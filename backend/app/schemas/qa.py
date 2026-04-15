from typing import Literal

from pydantic import BaseModel, Field


class QaSourceItem(BaseModel):
    note_id: int
    repository_slug: str
    repository_name: str
    title: str
    snippet: str
    clearance_level: int
    attachment_count: int
    updated_at: str


class QaAnswerData(BaseModel):
    question: str
    answer: str
    source_count: int
    sources: list[QaSourceItem]
    model_id: int | None = None
    model_name: str = ""
    recall_mode: str = "keyword"
    trace_id: str = ""


class QaFailure(BaseModel):
    error_code: str
    error_category: str
    user_message: str
    hint: str
    trace_id: str


class QaResponseEnvelope(BaseModel):
    status: Literal["ok", "failed"]
    data: QaAnswerData | None = None
    error: QaFailure | None = None


class QaAskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    repository_slug: str | None = None
    model_id: int | None = None
