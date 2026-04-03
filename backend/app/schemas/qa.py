from pydantic import BaseModel


class QaSourceItem(BaseModel):
    note_id: int
    repository_slug: str
    repository_name: str
    title: str
    snippet: str
    clearance_level: int
    attachment_count: int
    updated_at: str


class QaAnswerResponse(BaseModel):
    question: str
    answer: str
    source_count: int
    sources: list[QaSourceItem]
