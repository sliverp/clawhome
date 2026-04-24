"""POST /agents/{id}/work, GET /agents/{id}/work[/work_id]"""
from fastapi import APIRouter, Depends, HTTPException, Query

from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.agent import Agent
from app.models.session import WorkSession
from app.schemas.session import WorkCreate, WorkSessionOut
from app.services.agent_access import require_agent
from app.services.session_dispatch import start_work

router = APIRouter(prefix="/agents/{agent_id}", tags=["work"])


@router.post("/work", response_model=WorkSessionOut, status_code=201)
async def create_work(
    body: WorkCreate,
    agent: Agent = Depends(require_agent),
    db: Session = Depends(get_db),
):
    s = await start_work(db, agent, task_description=body.task_description)
    return s


@router.get("/work", response_model=list[WorkSessionOut])
def list_works(
    agent: Agent = Depends(require_agent),
    db: Session = Depends(get_db),
    status: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
):
    q = db.query(WorkSession).filter(WorkSession.agent_id == agent.id)
    if status:
        q = q.filter(WorkSession.status == status)
    return q.order_by(WorkSession.id.desc()).limit(limit).all()


@router.get("/work/{work_id}", response_model=WorkSessionOut)
def get_work(
    work_id: int,
    agent: Agent = Depends(require_agent),
    db: Session = Depends(get_db),
):
    s = db.query(WorkSession).filter(
        WorkSession.id == work_id, WorkSession.agent_id == agent.id
    ).first()
    if not s:
        raise HTTPException(status_code=404, detail="Work session not found")
    return s
