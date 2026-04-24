from datetime import datetime

from pydantic import BaseModel


class AgentDiaryOut(BaseModel):
    id: int
    title: str
    body: str
    tag: str
    is_unread: bool
    diary_date: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class DiaryListOut(BaseModel):
    items: list[AgentDiaryOut]
    unread_count: int


class DiaryCreate(BaseModel):
    title: str
    body: str
    tag: str = "milestone"
