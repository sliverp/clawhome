from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AgentCreate(BaseModel):
    name: str | None = None  # optional; auto-generated if omitted


class AgentRename(BaseModel):
    name: str


class AgentOut(BaseModel):
    id: int
    instance_id: str
    name: str
    agent_type: str
    hostname: str | None
    status: str
    last_seen: datetime | None
    local_port: int | None
    metadata_: Any = None
    created_at: datetime
    install_url: str | None = None  # present if bind_token still valid

    model_config = {"from_attributes": True}


class AgentInstallInfo(BaseModel):
    """Returned when creating an agent - includes the install prompt URL."""
    agent: AgentOut
    install_url: str
    prompt: str


class AgentCommandRequest(BaseModel):
    cmd: str  # must match a key in agent's commands config


class AgentModelSetRequest(BaseModel):
    model_ref: str
