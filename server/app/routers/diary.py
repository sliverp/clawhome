"""龙虾日记的列表 / 标记已读"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.agent import Agent
from app.models.diary import AgentDiary
from app.schemas.diary import AgentDiaryOut, DiaryListOut
from app.services.agent_access import require_agent

router = APIRouter(prefix="/agents/{agent_id}", tags=["diary"])


@router.get("/diary", response_model=DiaryListOut)
def list_diary(
    agent: Agent = Depends(require_agent),
    db: Session = Depends(get_db),
    limit: int = Query(20, ge=1, le=100),
):
    items = (
        db.query(AgentDiary)
        .filter(AgentDiary.agent_id == agent.id)
        .order_by(AgentDiary.diary_date.desc(), AgentDiary.id.desc())
        .limit(limit)
        .all()
    )
    unread_count = (
        db.query(AgentDiary)
        .filter(AgentDiary.agent_id == agent.id, AgentDiary.is_unread.is_(True))
        .count()
    )
    return DiaryListOut(
        items=[AgentDiaryOut.model_validate(it) for it in items],
        unread_count=unread_count,
    )


@router.patch("/diary/{diary_id}/read", response_model=AgentDiaryOut)
def mark_read(
    diary_id: int,
    agent: Agent = Depends(require_agent),
    db: Session = Depends(get_db),
):
    item = (
        db.query(AgentDiary)
        .filter(AgentDiary.id == diary_id, AgentDiary.agent_id == agent.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Diary not found")
    item.is_unread = False
    db.commit()
    db.refresh(item)
    return item
