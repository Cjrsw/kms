from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi import Request
from sqlalchemy.orm import Session

from app.core.security import create_access_token, verify_password
from app.core.config import get_settings
from app.models.user import User
from app.schemas.auth import CurrentUserResponse, TokenResponse
from app.services.audit import record_auth_audit


@dataclass
class LoginResult:
    token: TokenResponse | None = None
    error_code: str | None = None
    detail: str | None = None
    remaining_attempts: int | None = None
    locked_until: str | None = None


def login_with_database_user(db: Session, username: str, password: str, request: Request) -> LoginResult:
    settings = get_settings()
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        record_auth_audit(
            db,
            event_type="login",
            status="failed",
            request=request,
            username=username,
            detail="user_not_found",
        )
        return LoginResult(error_code="invalid", detail="账号或密码错误。")

    now = datetime.now(UTC)
    if user.locked_until is not None and user.locked_until.replace(tzinfo=UTC) <= now:
        user.locked_until = None
        db.add(user)
        db.commit()

    if user.locked_until is not None and user.locked_until.replace(tzinfo=UTC) > now:
        locked_until_dt = user.locked_until.replace(tzinfo=UTC)
        record_auth_audit(
            db,
            event_type="login",
            status="failed",
            request=request,
            user=user,
            detail="account_locked",
        )
        return LoginResult(
            error_code="locked",
            detail="账号已锁定，请在解锁后重试。",
            locked_until=locked_until_dt.isoformat(),
        )

    if not user.is_active:
        record_auth_audit(
            db,
            event_type="login",
            status="failed",
            request=request,
            user=user,
            detail="user_inactive",
        )
        return LoginResult(error_code="invalid", detail="账号不可用。")

    if not verify_password(password, user.hashed_password):
        user.failed_login_attempts += 1
        remaining_attempts = max(settings.max_login_attempts - user.failed_login_attempts, 0)
        if user.failed_login_attempts >= settings.max_login_attempts:
            extra_attempts = user.failed_login_attempts - settings.max_login_attempts
            lock_minutes = settings.login_lock_minutes + extra_attempts * settings.login_lock_step_minutes
            lock_until = now + timedelta(minutes=lock_minutes)
            user.locked_until = lock_until.replace(tzinfo=None)
            db.add(user)
            db.commit()
            record_auth_audit(
                db,
                event_type="login",
                status="failed",
                request=request,
                user=user,
                detail=f"account_locked_attempts={user.failed_login_attempts}",
            )
            return LoginResult(
                error_code="locked",
                detail=(
                    f"密码累计错误 {user.failed_login_attempts} 次，账号已锁定 {lock_minutes} 分钟。"
                ),
                remaining_attempts=0,
                locked_until=lock_until.isoformat(),
            )

        db.add(user)
        db.commit()
        record_auth_audit(
            db,
            event_type="login",
            status="failed",
            request=request,
            user=user,
            detail=f"password_mismatch_remaining={remaining_attempts}",
        )
        return LoginResult(
            error_code="invalid",
            detail=f"账号或密码错误，还可尝试 {remaining_attempts} 次。",
            remaining_attempts=remaining_attempts,
        )

    user.failed_login_attempts = 0
    user.locked_until = None
    db.add(user)
    db.commit()

    role_codes = [user_role.role.code for user_role in user.roles]
    token = TokenResponse(
        access_token=create_access_token(subject=user.username, token_version=user.token_version),
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        role_codes=role_codes,
        clearance_level=user.clearance_level,
    )
    record_auth_audit(db, event_type="login", status="success", request=request, user=user, detail="login_success")
    return LoginResult(token=token)


def serialize_current_user(user: User) -> CurrentUserResponse:
    return CurrentUserResponse(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        role_codes=[user_role.role.code for user_role in user.roles],
        clearance_level=user.clearance_level,
    )
