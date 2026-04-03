from pydantic import BaseModel


class SearchResultItem(BaseModel):
    note_id: int
    repository_slug: str
    repository_name: str
    title: str
    snippet: str
    clearance_level: int
    attachment_count: int
    score: float
    updated_at: str
