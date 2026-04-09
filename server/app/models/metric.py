from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Double, ForeignKey, Index, JSON, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class MetricDefinition(Base):
    __tablename__ = "metric_definitions"
    __table_args__ = (UniqueConstraint("agent_type", "metric_key", name="uq_type_key"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    agent_type: Mapped[str] = mapped_column(String(50), nullable=False, default="generic")
    metric_key: Mapped[str] = mapped_column(String(100), nullable=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    chart_type: Mapped[str] = mapped_column(String(20), nullable=False, default="line")


class Metric(Base):
    __tablename__ = "metrics"
    __table_args__ = (
        Index("idx_agent_metric_time", "agent_id", "metric_key", "recorded_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id"), nullable=False)
    metric_key: Mapped[str] = mapped_column(String(100), nullable=False)
    value: Mapped[float] = mapped_column(Double, nullable=False)
    extra: Mapped[Any] = mapped_column(JSON, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    agent: Mapped["Agent"] = relationship("Agent", back_populates="metrics")  # noqa: F821
