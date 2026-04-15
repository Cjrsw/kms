from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import get_current_user
from app.core.security import get_password_hash, is_password_complex, verify_password
from app.db.session import get_db
from app.models.user import User
from app.schemas.ai import UserModelPreferenceResponse, UserModelPreferenceUpdateRequest
from app.schemas.auth import (
    ChangePasswordRequest,
    CurrentUserResponse,
    LoginRequest,
    TokenResponse,
    UpdateProfileRequest,
)
from app.services.ai_models import get_user_model_preference, set_user_model_preference
from app.services.auth import login_with_database_user, serialize_current_user
from app.services.audit import record_auth_audit
from app.services.token_revocation import parse_jwt_exp, revoke_token_jti

router = APIRouter()
optional_bearer = HTTPBearer(auto_error=False)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: Annotated[Session, Depends(get_db)]) -> TokenResponse:
    result = login_with_database_user(db, payload.username, payload.password, request)
    if result.token is None:
        response_status = status.HTTP_423_LOCKED if result.error_code == "locked" else status.HTTP_401_UNAUTHORIZED
        raise HTTPException(
            status_code=response_status,
            detail={
                "code": result.error_code or "invalid",
                "message": result.detail or "Invalid username or password.",
                "remaining_attempts": result.remaining_attempts,
                "locked_until": result.locked_until,
            },
        )

    return result.token


@router.get("/me", response_model=CurrentUserResponse)
def current_user(user: Annotated[User, Depends(get_current_user)]) -> CurrentUserResponse:
    return serialize_current_user(user)


@router.get("/me/model-preference", response_model=UserModelPreferenceResponse)
def get_my_model_preference(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> UserModelPreferenceResponse:
    return get_user_model_preference(db, user)


@router.put("/me/model-preference", response_model=UserModelPreferenceResponse)
def update_my_model_preference(
    payload: UserModelPreferenceUpdateRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> UserModelPreferenceResponse:
    return set_user_model_preference(db, user, payload.chat_model_id)


@router.put("/me/profile", response_model=CurrentUserResponse)
def update_profile(
    payload: UpdateProfileRequest,
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> CurrentUserResponse:
    if payload.email and payload.email != user.email:
        existing = db.query(User).filter(User.email == payload.email, User.id != user.id).first()
        if existing is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists.")

    user.email = payload.email.strip() if payload.email else None
    user.phone = payload.phone.strip() if payload.phone else None
    user.position = payload.position.strip() if payload.position else None
    user.gender = payload.gender.strip() if payload.gender else None
    user.bio = payload.bio.strip() if payload.bio else None
    db.add(user)
    db.commit()
    db.refresh(user)

    record_auth_audit(db, event_type="profile_update", status="success", request=request, user=user, detail="self_profile_updated")
    return serialize_current_user(user)


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    if not verify_password(payload.current_password, user.hashed_password):
        record_auth_audit(db, event_type="password_change", status="failed", request=request, user=user, detail="current_password_invalid")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect.")

    if not is_password_complex(payload.new_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must include letters and numbers and be 6-64 characters long.",
        )

    user.hashed_password = get_password_hash(payload.new_password)
    user.need_password_change = False
    user.token_version += 1
    db.add(user)
    db.commit()
    record_auth_audit(db, event_type="password_change", status="success", request=request, user=user, detail="self_password_changed")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(optional_bearer)],
) -> Response:
    if credentials is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    settings = get_settings()
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.secret_key,
            algorithms=["HS256"],
            options={"verify_exp": False},
        )
    except JWTError:
        record_auth_audit(db, event_type="logout", status="failed", request=request, detail="invalid_jwt")
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    username = str(payload.get("sub") or "").strip()
    jti = str(payload.get("jti") or "").strip()
    exp = parse_jwt_exp(payload.get("exp"))
    user = db.query(User).filter(User.username == username).first() if username else None

    if jti:
        revoke_token_jti(
            db,
            jti=jti,
            user_id=user.id if user else None,
            reason="logout",
            expires_at=exp,
        )
        record_auth_audit(
            db,
            event_type="logout",
            status="success",
            request=request,
            user=user,
            username=username or None,
            detail="logout_revoked",
        )
    else:
        record_auth_audit(
            db,
            event_type="logout",
            status="failed",
            request=request,
            user=user,
            username=username or None,
            detail="missing_jti",
        )

    return Response(status_code=status.HTTP_204_NO_CONTENT)
