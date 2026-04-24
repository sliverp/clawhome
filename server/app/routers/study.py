"""POST /agents/{id}/study, GET /agents/{id}/study[/study_id]"""
from fastapi import APIRouter, Depends, HTTPException, Query

from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.agent import Agent
from app.models.session import StudySession
from app.schemas.session import StudyCreate, StudySessionOut
from app.services.agent_access import require_agent
from app.services.session_dispatch import start_study

router = APIRouter(prefix="/agents/{agent_id}", tags=["study"])


@router.post("/study", response_model=StudySessionOut, status_code=201)
async def create_study(
    body: StudyCreate,
    agent: Agent = Depends(require_agent),
    db: Session = Depends(get_db),
):
    s = await start_study(db, agent, skill_key=body.skill_key)
    return s


@router.get("/study", response_model=list[StudySessionOut])
def list_studies(
    agent: Agent = Depends(require_agent),
    db: Session = Depends(get_db),
    status: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
):
    q = db.query(StudySession).filter(StudySession.agent_id == agent.id)
    if status:
        q = q.filter(StudySession.status == status)
    return q.order_by(StudySession.id.desc()).limit(limit).all()


@router.get("/study/{study_id}", response_model=StudySessionOut)
def get_study(
    study_id: int,
    agent: Agent = Depends(require_agent),
    db: Session = Depends(get_db),
):
    s = db.query(StudySession).filter(
        StudySession.id == study_id, StudySession.agent_id == agent.id
    ).first()
    if not s:
        raise HTTPException(status_code=404, detail="Study session not found")
    return s
