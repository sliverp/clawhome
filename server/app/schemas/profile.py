from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AgentProfileOut(BaseModel):
    agent_id: int
    shrimp_name: str
    birth_time: datetime
    initial_personality: str
    initial_tendency: str
    stage: str
    tendency: str
    recent_change: str | None = None
    recent_skill: str | None = None
    scene_preference: Any = None
    current_scene: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AgentProfileUpdate(BaseModel):
    shrimp_name: str | None = None
    initial_personality: str | None = None
    initial_tendency: str | None = None


class SceneUpdate(BaseModel):
    scene: str  # pond / forest / farm
