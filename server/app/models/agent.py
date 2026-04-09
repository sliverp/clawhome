from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    instance_id: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    agent_type: Mapped[str] = mapped_column(String(50), nullable=False, default="generic")
    hostname: Mapped[str | None] = mapped_column(String(255), nullable=True)
    bind_token: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    bind_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    access_token: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    local_port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(
        Enum("offline", "online", "error"), nullable=False, default="offline"
    )
    last_seen: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    metadata_: Mapped[Any] = mapped_column("metadata", JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship("User", back_populates="agents")  # noqa: F821
    metrics: Mapped[list["Metric"]] = relationship("Metric", back_populates="agent")  # noqa: F821
