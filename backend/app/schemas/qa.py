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
    score: float | None = None
    hit_mode: str | None = None


class QaAnswerData(BaseModel):
    conversation_id: int | None = None
    conversation_title: str | None = None
    question: str
    answer: str
    source_count: int
    sources: list[QaSourceItem]
    model_id: int | None = None
    model_name: str = ""
    recall_mode: str = "keyword"
    citation_status: Literal["ok", "partial", "missing"] = "missing"
    trace_id: str = ""


class QaFailure(BaseModel):
    error_code: str
    error_category: str
    user_message: str
    hint: str
    trace_id: str
    conversation_id: int | None = None
    conversation_title: str | None = None


class QaResponseEnvelope(BaseModel):
    status: Literal["ok", "failed"]
    data: QaAnswerData | None = None
    error: QaFailure | None = None


class QaAskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    repository_slug: str | None = None
    model_id: int | None = None
    conversation_id: int | None = None


class QaConversationMessageItem(BaseModel):
    id: int
    role: Literal["user", "assistant"]
    content: str
    status: Literal["success", "failed"]
    error_code: str = ""
    error_category: str = ""
    trace_id: str = ""
    model_name: str = ""
    citation_status: Literal["ok", "partial", "missing", ""] = ""
    source_count: int = 0
    sources: list[QaSourceItem] = []
    created_at: str


class QaConversationSummaryItem(BaseModel):
    id: int
    title: str
    repository_slug: str | None = None
    last_question: str
    message_count: int
    created_at: str
    updated_at: str


class QaConversationListResponse(BaseModel):
    total: int
    items: list[QaConversationSummaryItem]


class QaConversationDetail(QaConversationSummaryItem):
    messages: list[QaConversationMessageItem]
