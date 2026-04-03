from pydantic import BaseModel, Field


class AdminNoteItem(BaseModel):
    id: int
    repository_id: int
    folder_id: int | None
    title: str
    content_text: str
    clearance_level: int
    updated_at: str
    attachment_count: int


class AdminFolderItem(BaseModel):
    id: int
    repository_id: int
    parent_id: int | None
    name: str
    clearance_level: int
    note_count: int


class AdminRepositoryItem(BaseModel):
    id: int
    slug: str
    name: str
    description: str
    min_clearance_level: int
    folder_count: int
    note_count: int
    folders: list[AdminFolderItem]
    notes: list[AdminNoteItem]


class AdminContentResponse(BaseModel):
    repository_count: int
    folder_count: int
    note_count: int
    repositories: list[AdminRepositoryItem]


class RepositoryCreateRequest(BaseModel):
    slug: str
    name: str
    description: str = ""
    min_clearance_level: int = Field(default=1, ge=1, le=4)


class RepositoryUpdateRequest(BaseModel):
    slug: str
    name: str
    description: str = ""
    min_clearance_level: int = Field(default=1, ge=1, le=4)


class FolderCreateRequest(BaseModel):
    repository_id: int
    parent_id: int | None = None
    name: str
    min_clearance_level: int = Field(default=1, ge=1, le=4)


class FolderUpdateRequest(BaseModel):
    parent_id: int | None = None
    name: str
    min_clearance_level: int = Field(default=1, ge=1, le=4)


class NoteCreateRequest(BaseModel):
    repository_id: int
    folder_id: int | None = None
    title: str
    content_text: str
    content_json: str | None = None
    min_clearance_level: int = Field(default=1, ge=1, le=4)


class NoteUpdateRequest(BaseModel):
    folder_id: int | None = None
    title: str
    content_text: str
    content_json: str | None = None
    min_clearance_level: int = Field(default=1, ge=1, le=4)
