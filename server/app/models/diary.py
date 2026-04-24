"""龙虾的成长日记"""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AgentDiary(Base):
    __tablename__ = "agent_diaries"
    __table_args__ = (
        Index("idx_diary_agent_date", "agent_id", "diary_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    agent_id: Mapped[int] = mapped_column(
        ForeignKey("agents.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # tag: exam/study/work/alert/milestone/birth
    tag: Mapped[str] = mapped_column(String(30), nullable=False, default="milestone")
    is_unread: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    diary_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
