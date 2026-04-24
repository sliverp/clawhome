"""龙虾的成长档案 / 出生证明（一对一 agent）"""
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AgentProfile(Base):
    __tablename__ = "agent_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    agent_id: Mapped[int] = mapped_column(
        ForeignKey("agents.id", ondelete="CASCADE"), unique=True, nullable=False
    )

    # ── 出生证明（创建后基本不变） ──
    shrimp_name: Mapped[str] = mapped_column(String(50), nullable=False)
    birth_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    initial_personality: Mapped[str] = mapped_column(String(20), nullable=False, default="认真型")
    initial_tendency: Mapped[str] = mapped_column(String(20), nullable=False, default="执行型")

    # ── 当前成长状态（运行时不断更新） ──
    stage: Mapped[str] = mapped_column(String(20), nullable=False, default="juvenile")  # juvenile/adult
    tendency: Mapped[str] = mapped_column(String(20), nullable=False, default="执行型")
    recent_change: Mapped[str | None] = mapped_column(String(100), nullable=True)
    recent_skill: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # 各场景停留计数 / 偏好聚合
    scene_preference: Mapped[Any] = mapped_column(JSON, nullable=True)  # {"pond":N,"forest":N,"farm":N}
    # 用户最后停留的场景（多端同步用）
    current_scene: Mapped[str] = mapped_column(String(10), nullable=False, default="pond")

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
