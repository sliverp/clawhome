from datetime import datetime
from typing import Any

from pydantic import BaseModel


class ExamSessionOut(BaseModel):
    id: int
    request_id: str | None = None
    exam_type: str
    status: str
    score: int | None = None
    details: Any = None
    started_at: datetime
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}


class StudySessionOut(BaseModel):
    id: int
    request_id: str | None = None
    skill_key: str | None = None
    skill_name: str | None = None
    status: str
    exp_gained: int | None = None
    details: Any = None
    started_at: datetime
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}


class WorkSessionOut(BaseModel):
    id: int
    request_id: str | None = None
    task_description: str
    status: str
    summary: str | None = None
    details: Any = None
    started_at: datetime
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}


class ExamCreate(BaseModel):
    exam_type: str = "basic"


class StudyCreate(BaseModel):
    skill_key: str | None = None


class WorkCreate(BaseModel):
    task_description: str
