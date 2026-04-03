from sqlalchemy.orm import Session

from app.core.security import create_access_token, verify_password
from app.models.user import User
from app.schemas.auth import CurrentUserResponse, TokenResponse


def login_with_database_user(db: Session, username: str, password: str) -> TokenResponse | None:
    user = db.query(User).filter(User.username == username, User.is_active.is_(True)).first()
    if user is None:
        return None

    if not verify_password(password, user.hashed_password):
        return None

    role_codes = [user_role.role.code for user_role in user.roles]
    return TokenResponse(
        access_token=create_access_token(subject=user.username),
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        role_codes=role_codes,
        clearance_level=user.clearance_level,
    )


def serialize_current_user(user: User) -> CurrentUserResponse:
    return CurrentUserResponse(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        role_codes=[user_role.role.code for user_role in user.roles],
        clearance_level=user.clearance_level,
    )
