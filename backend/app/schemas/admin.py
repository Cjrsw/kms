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


class AdminUserItem(BaseModel):
    id: int
    username: str
    full_name: str
    email: str | None
    phone: str | None
    department_id: int | None
    department_name: str | None
    position: str | None
    gender: str | None
    bio: str | None
    clearance_level: int
    is_active: bool
    deactivated_at: str | None
    role_code: str
    need_password_change: bool
    created_at: str


class AdminUsersResponse(BaseModel):
    total: int
    users: list[AdminUserItem]
    roles: list[str]
    departments: list["DepartmentItem"]


class RolesResponse(BaseModel):
    roles: list[str]


class DepartmentItem(BaseModel):
    id: int
    code: str
    name: str
    parent_id: int | None
    is_active: bool
    sort_order: int
    member_count: int


class DepartmentsResponse(BaseModel):
    total: int
    departments: list[DepartmentItem]


class DepartmentCreateRequest(BaseModel):
    code: str
    name: str
    parent_id: int | None = None
    sort_order: int = 0
    is_active: bool = True


class DepartmentUpdateRequest(BaseModel):
    code: str
    name: str
    parent_id: int | None = None
    sort_order: int = 0
    is_active: bool = True


class CorsOriginsResponse(BaseModel):
    origins: list[str]


class CorsOriginsUpdateRequest(BaseModel):
    origins: list[str]


class AuthAuditLogItem(BaseModel):
    id: int
    username: str
    event_type: str
    status: str
    ip_address: str
    user_agent: str
    detail: str
    created_at: str


class AuthAuditLogResponse(BaseModel):
    total: int
    logs: list[AuthAuditLogItem]


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


class UserCreateRequest(BaseModel):
    full_name: str
    department_id: int | None = None
    position: str | None = None
    gender: str | None = None
    clearance_level: int = Field(default=1, ge=1, le=3)


class UserUpdateRequest(BaseModel):
    full_name: str
    department_id: int | None = None
    position: str | None = None
    gender: str | None = None
    phone: str | None = None
    email: str | None = None
    bio: str | None = None
    clearance_level: int = Field(default=1, ge=1, le=3)
    is_active: bool = True


AdminUsersResponse.model_rebuild()
