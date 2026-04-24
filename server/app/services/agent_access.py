"""Agent 归属校验：所有 /agents/{id}/* 子接口的统一入口"""
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.agent import Agent
from app.models.user import User


def require_agent(
    agent_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Agent:
    agent = (
        db.query(Agent)
        .filter(Agent.id == agent_id, Agent.user_id == current_user.id)
        .first()
    )
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent
