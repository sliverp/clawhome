from datetime import datetime
from typing import Any

from pydantic import BaseModel


class MetricDefinitionOut(BaseModel):
    id: int
    agent_type: str
    metric_key: str
    display_name: str
    unit: str | None
    chart_type: str

    model_config = {"from_attributes": True}


class MetricPoint(BaseModel):
    metric_key: str
    value: float
    extra: Any = None
    recorded_at: datetime

    model_config = {"from_attributes": True}


class MetricLatest(BaseModel):
    """Latest snapshot of all metrics for an agent."""
    agent_id: int
    metrics: dict[str, float]
    recorded_at: datetime | None
