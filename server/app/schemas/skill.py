from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AgentSkillOut(BaseModel):
    id: int
    dimension: str
    skill_key: str
    skill_name: str
    level: int
    unlocked: bool
    secondary_skills: Any = None
    updated_at: datetime

    model_config = {"from_attributes": True}


class SkillDimensionOut(BaseModel):
    """一个维度下的所有 skill，前端按维度分组渲染"""
    dimension: str
    icon: str
    name: str
    skills: list[AgentSkillOut]
