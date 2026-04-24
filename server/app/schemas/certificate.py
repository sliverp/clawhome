from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AgentCertificateOut(BaseModel):
    id: int
    cert_type: str
    name: str
    description: str | None = None
    icon: str | None = None
    issued_at: datetime
    details: Any = None
    created_at: datetime

    model_config = {"from_attributes": True}
