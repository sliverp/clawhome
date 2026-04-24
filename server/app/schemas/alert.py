from datetime import datetime

from pydantic import BaseModel


class AlertOut(BaseModel):
    id: int
    alert_type: str
    level: str
    message: str
    resolved: bool
    raised_at: datetime
    resolved_at: datetime | None = None

    model_config = {"from_attributes": True}
