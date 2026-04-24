"""考试 / 学习 / 长任务 三种业务会话记录"""
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ExamSession(Base):
    __tablename__ = "exam_sessions"
    __table_args__ = (
        Index("idx_exam_agent_status", "agent_id", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    agent_id: Mapped[int] = mapped_column(
        ForeignKey("agents.id", ondelete="CASCADE"), nullable=False
    )
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    exam_type: Mapped[str] = mapped_column(String(50), nullable=False, default="basic")
    # status: waiting / running / completed / timeout / interrupted
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="waiting")
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    details: Mapped[Any] = mapped_column(JSON, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class StudySession(Base):
    __tablename__ = "study_sessions"
    __table_args__ = (
        Index("idx_study_agent_status", "agent_id", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    agent_id: Mapped[int] = mapped_column(
        ForeignKey("agents.id", ondelete="CASCADE"), nullable=False
    )
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    skill_key: Mapped[str | None] = mapped_column(String(50), nullable=True)
    skill_name: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # status: waiting / running / completed / timeout / interrupted
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="waiting")
    exp_gained: Mapped[int | None] = mapped_column(Integer, nullable=True)
    details: Mapped[Any] = mapped_column(JSON, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class WorkSession(Base):
    __tablename__ = "work_sessions"
    __table_args__ = (
        Index("idx_work_agent_status", "agent_id", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    agent_id: Mapped[int] = mapped_column(
        ForeignKey("agents.id", ondelete="CASCADE"), nullable=False
    )
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    task_description: Mapped[str] = mapped_column(Text, nullable=False)
    # status: waiting / running / completed / timeout / interrupted
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="waiting")
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    details: Mapped[Any] = mapped_column(JSON, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
