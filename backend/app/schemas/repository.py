from pydantic import BaseModel


class NoteListItem(BaseModel):
    id: int
    title: str
    folder_id: int | None
    clearance_level: int
    created_at: str
    updated_at: str
    attachment_count: int


class AttachmentItem(BaseModel):
    id: int
    file_name: str
    file_type: str
    file_size: int
    created_at: str
    download_url: str | None = None


class FolderItem(BaseModel):
    id: int
    name: str
    parent_id: int | None
    clearance_level: int


class RepositoryListItem(BaseModel):
    id: int
    slug: str
    name: str
    description: str
    cover_image_url: str
    has_cover_image_upload: bool
    min_clearance_level: int
    folder_count: int
    note_count: int
    latest_notes: list[NoteListItem] = []


class RepositoryDetailResponse(BaseModel):
    id: int
    slug: str
    name: str
    description: str
    cover_image_url: str
    has_cover_image_upload: bool
    min_clearance_level: int
    folders: list[FolderItem]
    notes: list[NoteListItem]


class NoteDetailResponse(BaseModel):
    id: int
    repository_id: int
    folder_id: int | None
    title: str
    content_json: str
    content_text: str
    clearance_level: int
    updated_at: str
    attachments: list[AttachmentItem]


class NoteUpdateRequest(BaseModel):
    title: str
    content_text: str
    content_json: str | None = None


class NoteCreateRequest(BaseModel):
    title: str
    content_text: str = ""
    content_json: str | None = None
    folder_id: int | None = None
    min_clearance_level: int | None = None
