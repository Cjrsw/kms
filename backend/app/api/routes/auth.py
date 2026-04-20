from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.core.deps import get_current_user
from app.core.security import get_password_hash, is_password_complex, verify_password
from app.db.session import get_db
from app.models.content import Note, NoteFavorite, Repository
from app.models.user import User
from app.schemas.ai import UserModelPreferenceResponse, UserModelPreferenceUpdateRequest
from app.schemas.auth import (
    ChangePasswordRequest,
    CurrentUserResponse,
    FavoriteNoteItem,
    FavoriteNotesResponse,
    LoginRequest,
    TokenResponse,
    UpdateProfileRequest,
)
from app.services.auth import login_with_database_user, serialize_current_user
from app.services.audit import record_auth_audit
from app.services.storage import (
    build_user_avatar_object_key,
    get_object_bytes,
    remove_object,
    upload_attachment_bytes,
)
from app.services.token_revocation import parse_jwt_exp, revoke_token_jti

router = APIRouter()
optional_bearer = HTTPBearer(auto_error=False)
ALLOWED_AVATAR_TYPES = {"png", "jpg", "jpeg", "webp"}
MAX_AVATAR_SIZE = 5 * 1024 * 1024


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


@router.get("/me/avatar")
def get_my_avatar(user: Annotated[User, Depends(get_current_user)]) -> Response:
    if not user.avatar_object_key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avatar not found.")

    object_bytes = get_object_bytes(user.avatar_object_key)
    if object_bytes is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avatar not found in storage.")

    return Response(
        content=object_bytes,
        media_type=_resolve_avatar_media_type(user.avatar_object_key),
        headers={"Cache-Control": "private, max-age=300"},
    )


@router.put("/me/avatar", response_model=CurrentUserResponse)
async def update_my_avatar(
    file: Annotated[UploadFile, File(...)],
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> CurrentUserResponse:
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Avatar file name is required.")

    file_extension = Path(file.filename).suffix.lower().lstrip(".")
    if file_extension not in ALLOWED_AVATAR_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Avatar only supports PNG, JPG, JPEG and WEBP.",
        )

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty avatar is not allowed.")
    if len(file_bytes) > MAX_AVATAR_SIZE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Avatar exceeds the 5MB limit.")

    old_object_key = user.avatar_object_key
    new_object_key = build_user_avatar_object_key(user.id, file.filename)
    upload_attachment_bytes(
        object_key=new_object_key,
        data=file_bytes,
        content_type=file.content_type or _resolve_avatar_upload_media_type(file_extension),
    )

    user.avatar_object_key = new_object_key
    db.add(user)
    db.commit()
    db.refresh(user)

    if old_object_key:
        remove_object(old_object_key)

    record_auth_audit(db, event_type="profile_update", status="success", request=request, user=user, detail="self_avatar_updated")
    return serialize_current_user(user)


@router.delete("/me/avatar", response_model=CurrentUserResponse)
def delete_my_avatar(
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> CurrentUserResponse:
    old_object_key = user.avatar_object_key
    user.avatar_object_key = None
    db.add(user)
    db.commit()
    db.refresh(user)

    if old_object_key:
        remove_object(old_object_key)

    record_auth_audit(db, event_type="profile_update", status="success", request=request, user=user, detail="self_avatar_deleted")
    return serialize_current_user(user)


@router.get("/me/favorites", response_model=FavoriteNotesResponse)
def get_my_favorites(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> FavoriteNotesResponse:
    favorites = (
        db.query(NoteFavorite)
        .options(
            selectinload(NoteFavorite.note).selectinload(Note.repository),
        )
        .filter(NoteFavorite.user_id == user.id)
        .join(Note, NoteFavorite.note_id == Note.id)
        .filter(Note.min_clearance_level <= user.clearance_level)
        .order_by(NoteFavorite.created_at.desc(), NoteFavorite.id.desc())
        .all()
    )

    items = [
        FavoriteNoteItem(
            note_id=favorite.note.id,
            repository_slug=favorite.note.repository.slug,
            repository_name=favorite.note.repository.name,
            title=favorite.note.title,
            author_name=(favorite.note.author_name or "").strip() or "系统",
            clearance_level=favorite.note.min_clearance_level,
            updated_at=favorite.note.updated_at.isoformat(),
            href=f"/repositories/{favorite.note.repository.slug}/notes/{favorite.note.id}",
        )
        for favorite in favorites
        if favorite.note is not None and favorite.note.repository is not None
    ]
    return FavoriteNotesResponse(total=len(items), items=items)


@router.get("/me/model-preference", response_model=UserModelPreferenceResponse)
def get_my_model_preference(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> UserModelPreferenceResponse:
    _ = user
    _ = db
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail={
            "error_code": "feature_disabled_fixed_model_policy",
            "message": "Model preference is disabled by fixed-model policy.",
        },
    )


@router.put("/me/model-preference", response_model=UserModelPreferenceResponse)
def update_my_model_preference(
    payload: UserModelPreferenceUpdateRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> UserModelPreferenceResponse:
    _ = payload
    _ = user
    _ = db
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail={
            "error_code": "feature_disabled_fixed_model_policy",
            "message": "Model preference is disabled by fixed-model policy.",
        },
    )


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


def _resolve_avatar_media_type(object_key: str) -> str:
    suffix = Path(object_key).suffix.lower()
    if suffix == ".png":
        return "image/png"
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".webp":
        return "image/webp"
    return "application/octet-stream"


def _resolve_avatar_upload_media_type(file_type: str) -> str:
    if file_type == "png":
        return "image/png"
    if file_type in {"jpg", "jpeg"}:
        return "image/jpeg"
    if file_type == "webp":
        return "image/webp"
    return "application/octet-stream"
