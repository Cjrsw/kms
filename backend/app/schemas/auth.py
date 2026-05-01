from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    full_name: str
    email: EmailStr | None = None
    role_codes: list[str]
    clearance_level: int
    department_id: int | None = None
    department_name: str | None = None
    phone: str | None = None
    position: str | None = None
    gender: str | None = None
    bio: str | None = None
    has_avatar_upload: bool = False
    need_password_change: bool = False


class CurrentUserResponse(BaseModel):
    id: int
    username: str
    full_name: str
    email: EmailStr | None = None
    role_codes: list[str]
    clearance_level: int
    department_id: int | None = None
    department_name: str | None = None
    phone: str | None = None
    position: str | None = None
    gender: str | None = None
    bio: str | None = None
    has_avatar_upload: bool = False
    need_password_change: bool = False


class UpdateProfileRequest(BaseModel):
    email: EmailStr | None = None
    phone: str | None = None
    position: str | None = None
    gender: str | None = None
    bio: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class FavoriteNoteItem(BaseModel):
    note_id: int
    repository_slug: str
    repository_name: str
    title: str
    author_name: str
    clearance_level: int
    updated_at: str
    href: str


class FavoriteNotesResponse(BaseModel):
    total: int
    items: list[FavoriteNoteItem]


class MyNoteItem(BaseModel):
    note_id: int
    repository_slug: str
    repository_name: str
    title: str
    content_text: str
    clearance_level: int
    updated_at: str
    href: str


class MyNotesResponse(BaseModel):
    total: int
    items: list[MyNoteItem]
