from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    full_name: str
    email: EmailStr
    role_codes: list[str]
    clearance_level: int


class CurrentUserResponse(BaseModel):
    id: int
    username: str
    full_name: str
    email: EmailStr
    role_codes: list[str]
    clearance_level: int
