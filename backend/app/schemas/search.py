from pydantic import BaseModel


class SearchResultItem(BaseModel):
    note_id: int
    repository_slug: str
    repository_name: str
    title: str
    author_name: str
    snippet: str
    clearance_level: int
    attachment_count: int
    score: float
    updated_at: str
    hit_mode: str = "keyword"


class SearchResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[SearchResultItem]


class SearchSuggestResponse(BaseModel):
    suggestions: list[str]


class SearchAuthorSuggestResponse(BaseModel):
    suggestions: list[str]
