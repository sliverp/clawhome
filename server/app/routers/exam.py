"""POST /agents/{id}/exam, GET /agents/{id}/exam[/exam_id]"""
from fastapi import APIRouter, Depends, HTTPException, Query

from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.agent import Agent
from app.models.session import ExamSession
from app.schemas.session import ExamCreate, ExamSessionOut
from app.services.agent_access import require_agent
from app.services.session_dispatch import start_exam

router = APIRouter(prefix="/agents/{agent_id}", tags=["exam"])


@router.post("/exam", response_model=ExamSessionOut, status_code=201)
async def create_exam(
    body: ExamCreate,
    agent: Agent = Depends(require_agent),
    db: Session = Depends(get_db),
):
    s = await start_exam(db, agent, exam_type=body.exam_type)
    return s


@router.get("/exam", response_model=list[ExamSessionOut])
def list_exams(
    agent: Agent = Depends(require_agent),
    db: Session = Depends(get_db),
    status: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
):
    q = db.query(ExamSession).filter(ExamSession.agent_id == agent.id)
    if status:
        q = q.filter(ExamSession.status == status)
    return q.order_by(ExamSession.id.desc()).limit(limit).all()


@router.get("/exam/{exam_id}", response_model=ExamSessionOut)
def get_exam(
    exam_id: int,
    agent: Agent = Depends(require_agent),
    db: Session = Depends(get_db),
):
    s = db.query(ExamSession).filter(
        ExamSession.id == exam_id, ExamSession.agent_id == agent.id
    ).first()
    if not s:
        raise HTTPException(status_code=404, detail="Exam session not found")
    return s
