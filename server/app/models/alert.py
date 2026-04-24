"""异常告警（Token 不足、错误率异常等）"""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Alert(Base):
    __tablename__ = "alerts"
    __table_args__ = (
        Index("idx_alert_agent_resolved", "agent_id", "resolved"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    agent_id: Mapped[int] = mapped_column(
        ForeignKey("agents.id", ondelete="CASCADE"), nullable=False
    )
    # alert_type: token_exhaust / error_spike / connection_lost / ...
    alert_type: Mapped[str] = mapped_column(String(30), nullable=False)
    # level: warn / error
    level: Mapped[str] = mapped_column(String(10), nullable=False, default="warn")
    message: Mapped[str] = mapped_column(String(255), nullable=False)
    resolved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    raised_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
