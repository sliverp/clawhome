import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.ws_manager import ws_manager
from app.models.agent import Agent
from app.models.user import User
from app.schemas.agent import (
    AgentCommandRequest,
    AgentCreate,
    AgentInstallInfo,
    AgentOut,
    AgentRename,
)

router = APIRouter(prefix="/agents", tags=["agents"])


def _get_agent_or_404(agent_id: int, user_id: int, db: Session) -> Agent:
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.user_id == user_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.get("", response_model=list[AgentOut])
def list_agents(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    agents = db.query(Agent).filter(Agent.user_id == current_user.id).all()
    # reflect live status from ws_manager
    for agent in agents:
        if not ws_manager.is_agent_online(agent.id) and agent.status == "online":
            agent.status = "offline"
    return agents


@router.post("", response_model=AgentInstallInfo, status_code=status.HTTP_201_CREATED)
def create_agent(
    body: AgentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    bind_token = secrets.token_urlsafe(24)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=settings.BIND_TOKEN_EXPIRE_HOURS)
    # Use a placeholder name; client will update it after detecting agent type
    name = body.name or f"agent-{uuid.uuid4().hex[:6]}"
    agent = Agent(
        user_id=current_user.id,
        instance_id=uuid.uuid4().hex[:16],
        name=name,
        bind_token=bind_token,
        bind_token_expires_at=expires_at,
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)

    install_url = f"{settings.SERVER_BASE_URL}/api/install/{bind_token}"
    prompt = (
        f"请阅读 {install_url} 并按照说明安装监控客户端，完成后告诉我结果。"
    )
    return AgentInstallInfo(agent=AgentOut.model_validate(agent), install_url=install_url, prompt=prompt)


@router.get("/{agent_id}", response_model=AgentOut)
def get_agent(
    agent_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _get_agent_or_404(agent_id, current_user.id, db)


@router.patch("/{agent_id}/name", response_model=AgentOut)
def rename_agent(
    agent_id: int,
    body: AgentRename,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    agent = _get_agent_or_404(agent_id, current_user.id, db)
    agent.name = body.name
    db.commit()
    db.refresh(agent)
    return agent


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_agent(
    agent_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    agent = _get_agent_or_404(agent_id, current_user.id, db)
    db.delete(agent)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{agent_id}/command")
async def send_command(
    agent_id: int,
    body: AgentCommandRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    agent = _get_agent_or_404(agent_id, current_user.id, db)
    request_id = uuid.uuid4().hex
    sent = await ws_manager.send_to_agent(
        agent.id,
        {"type": "command", "data": {"cmd": body.cmd, "request_id": request_id}},
    )
    if not sent:
        raise HTTPException(status_code=503, detail="Agent is offline")
    return {"request_id": request_id, "status": "sent"}


# ── Install page (no auth required) ─────────────────────────────────────────

install_router = APIRouter(tags=["install"])


@install_router.get("/install/{bind_token}", response_class=PlainTextResponse)
def install_page(bind_token: str, db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(Agent.bind_token == bind_token).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Invalid or expired install link")
    if agent.bind_token_expires_at and datetime.now(timezone.utc) > agent.bind_token_expires_at.replace(tzinfo=timezone.utc):
        raise HTTPException(status_code=410, detail="Install link has expired")

    content = f"""# ClawHome 客户端安装说明

## 安装步骤

1. 安装客户端（需要 Node.js >= 18）：

```bash
npm install -g clawhome-client
```

2. 初始化并绑定：

```bash
clawhome-client init --server {settings.SERVER_BASE_URL} --token {bind_token}
```

安装程序会自动：
- 检测你的 agent 类型（openclaw / cursor 等）
- 生成配置文件 `~/.clawhome/<instance-id>/agent-config.yaml`
- 建立与监控服务器的长连接
- 注册后台服务（systemd / pm2 / nohup）
- 启动本地 HTTP API 供 agent 上报指标

## 完成后

安装成功后，你可以在 Dashboard 中看到该 agent 的实时状态。

> 此安装链接有效期 {settings.BIND_TOKEN_EXPIRE_HOURS} 小时，且只能使用一次。
"""
    return content
