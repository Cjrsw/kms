from datetime import UTC, datetime, timedelta
from uuid import uuid4

from jose import jwt
from passlib.context import CryptContext

from app.core.config import get_settings

ALGORITHM = "HS256"
password_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return password_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return password_context.hash(password)


def create_access_token(subject: str, token_version: int) -> str:
    settings = get_settings()
    expire_at = datetime.now(UTC) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": subject, "exp": expire_at, "ver": token_version, "jti": uuid4().hex}
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)
