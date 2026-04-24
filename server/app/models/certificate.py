"""龙虾的证书夹"""
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AgentCertificate(Base):
    __tablename__ = "agent_certificates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    agent_id: Mapped[int] = mapped_column(
        ForeignKey("agents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # cert_type: birth / exam_basic / task_cert / ...
    cert_type: Mapped[str] = mapped_column(String(30), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    icon: Mapped[str | None] = mapped_column(String(10), nullable=True)
    issued_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    details: Mapped[Any] = mapped_column(JSON, nullable=True)  # {score:.., items:..}
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
