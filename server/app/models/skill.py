"""7 维度技能树（每个 agent × 每个 skill 一行）"""
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AgentSkill(Base):
    __tablename__ = "agent_skills"
    __table_args__ = (
        UniqueConstraint("agent_id", "skill_key", name="uq_agent_skill"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    agent_id: Mapped[int] = mapped_column(
        ForeignKey("agents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # 维度：basic/retrieval/reasoning/tools/system/automation/expression
    dimension: Mapped[str] = mapped_column(String(20), nullable=False)
    skill_key: Mapped[str] = mapped_column(String(50), nullable=False)
    skill_name: Mapped[str] = mapped_column(String(50), nullable=False)
    level: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    unlocked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    secondary_skills: Mapped[Any] = mapped_column(JSON, nullable=True)  # ["reasoning", ...]
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
