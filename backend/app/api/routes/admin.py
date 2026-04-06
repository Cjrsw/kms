from __future__ import annotations

import json
import re
from typing import Annotated
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session, selectinload

from app.core.cors_state import get_allowed_origins, set_allowed_origins
from app.core.deps import require_role
from app.core.security import get_password_hash
from app.db.session import get_db
from app.models.content import Folder, Note, Repository
from app.models.user import AuthAuditLog, Role, User, UserRole
from app.schemas.admin import (
    AdminContentResponse,
    AdminFolderItem,
    AdminNoteItem,
    AdminRepositoryItem,
    AdminUserItem,
    AdminUsersResponse,
    AuthAuditLogItem,
    AuthAuditLogResponse,
    CorsOriginsResponse,
    CorsOriginsUpdateRequest,
    FolderCreateRequest,
    FolderUpdateRequest,
    NoteCreateRequest,
    NoteUpdateRequest,
    RepositoryCreateRequest,
    RepositoryUpdateRequest,
    RolesResponse,
    UserCreateRequest,
    UserUpdateRequest,
)
from app.services.search import delete_note_document, index_note, rebuild_notes_index
from app.services.system_settings import get_cors_origins_setting, set_cors_origins_setting

router = APIRouter()
ADMIN_DEPENDENCY = Depends(require_role("platform_admin", "repo_admin"))
PLATFORM_ADMIN_DEPENDENCY = Depends(require_role("platform_admin"))
SLUG_RE = re.compile(r"[^a-z0-9]+")


@router.get("/content", response_model=AdminContentResponse)
def get_admin_content(
    _: Annotated[User, ADMIN_DEPENDENCY],
    db: Annotated[Session, Depends(get_db)],
) -> AdminContentResponse:
    repositories = (
        db.query(Repository)
        .options(
            selectinload(Repository.folders).selectinload(Folder.notes),
            selectinload(Repository.notes).selectinload(Note.attachments),
        )
        .order_by(Repository.id.asc())
        .all()
    )

    serialized_repositories = [
        AdminRepositoryItem(
            id=repository.id,
            slug=repository.slug,
            name=repository.name,
            description=repository.description,
            min_clearance_level=repository.min_clearance_level,
            folder_count=len(repository.folders),
            note_count=len(repository.notes),
            folders=[
                AdminFolderItem(
                    id=folder.id,
                    repository_id=folder.repository_id,
                    parent_id=folder.parent_id,
                    name=folder.name,
                    clearance_level=folder.min_clearance_level,
                    note_count=len(folder.notes),
                )
                for folder in sorted(repository.folders, key=lambda item: item.id)
            ],
            notes=[
                AdminNoteItem(
                    id=note.id,
                    repository_id=note.repository_id,
                    folder_id=note.folder_id,
                    title=note.title,
                    content_text=note.content_text,
                    clearance_level=note.min_clearance_level,
                    updated_at=note.updated_at.isoformat(),
                    attachment_count=len(note.attachments),
                )
                for note in sorted(repository.notes, key=lambda item: item.updated_at, reverse=True)
            ],
        )
        for repository in repositories
    ]

    return AdminContentResponse(
        repository_count=len(serialized_repositories),
        folder_count=sum(len(repository.folders) for repository in repositories),
        note_count=sum(len(repository.notes) for repository in repositories),
        repositories=serialized_repositories,
    )


@router.post("/repositories", response_model=AdminRepositoryItem, status_code=status.HTTP_201_CREATED)
def create_repository(
    payload: RepositoryCreateRequest,
    _: Annotated[User, ADMIN_DEPENDENCY],
    db: Annotated[Session, Depends(get_db)],
) -> AdminRepositoryItem:
    slug = _normalize_slug(payload.slug)
    if db.query(Repository).filter(Repository.slug == slug).first() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Repository slug already exists.")

    repository = Repository(
        slug=slug,
        name=payload.name.strip(),
        description=payload.description.strip(),
        min_clearance_level=payload.min_clearance_level,
    )
    db.add(repository)
    db.commit()
    db.refresh(repository)
    return _serialize_repository(repository)


@router.put("/repositories/{repository_id}", response_model=AdminRepositoryItem)
def update_repository(
    repository_id: int,
    payload: RepositoryUpdateRequest,
    _: Annotated[User, ADMIN_DEPENDENCY],
    db: Annotated[Session, Depends(get_db)],
) -> AdminRepositoryItem:
    repository = db.query(Repository).filter(Repository.id == repository_id).first()
    if repository is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found.")

    slug = _normalize_slug(payload.slug)
    existing = db.query(Repository).filter(Repository.slug == slug, Repository.id != repository_id).first()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Repository slug already exists.")

    repository.slug = slug
    repository.name = payload.name.strip()
    repository.description = payload.description.strip()
    repository.min_clearance_level = payload.min_clearance_level
    db.add(repository)
    db.commit()
    db.refresh(repository)
    rebuild_notes_index(db)
    return _load_repository(db, repository.id)


@router.delete("/repositories/{repository_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_repository(
    repository_id: int,
    _: Annotated[User, ADMIN_DEPENDENCY],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    repository = db.query(Repository).filter(Repository.id == repository_id).first()
    if repository is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found.")

    db.delete(repository)
    db.commit()
    rebuild_notes_index(db)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/folders", response_model=AdminFolderItem, status_code=status.HTTP_201_CREATED)
def create_folder(
    payload: FolderCreateRequest,
    _: Annotated[User, ADMIN_DEPENDENCY],
    db: Annotated[Session, Depends(get_db)],
) -> AdminFolderItem:
    repository = db.query(Repository).filter(Repository.id == payload.repository_id).first()
    if repository is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found.")

    if payload.parent_id is not None:
        parent = _get_folder(db, payload.parent_id)
        if parent.repository_id != repository.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Parent folder is outside repository.")

    folder = Folder(
        repository_id=repository.id,
        parent_id=payload.parent_id,
        name=payload.name.strip(),
        min_clearance_level=payload.min_clearance_level,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return _serialize_folder(folder)


@router.put("/folders/{folder_id}", response_model=AdminFolderItem)
def update_folder(
    folder_id: int,
    payload: FolderUpdateRequest,
    _: Annotated[User, ADMIN_DEPENDENCY],
    db: Annotated[Session, Depends(get_db)],
) -> AdminFolderItem:
    folder = _get_folder(db, folder_id)
    if payload.parent_id == folder.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Folder cannot be its own parent.")

    if payload.parent_id is not None:
        parent = _get_folder(db, payload.parent_id)
        if parent.repository_id != folder.repository_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Parent folder is outside repository.")

    folder.parent_id = payload.parent_id
    folder.name = payload.name.strip()
    folder.min_clearance_level = payload.min_clearance_level
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return _serialize_folder(folder)


@router.delete("/folders/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_folder(
    folder_id: int,
    _: Annotated[User, ADMIN_DEPENDENCY],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    folder = _get_folder(db, folder_id)
    db.delete(folder)
    db.commit()
    rebuild_notes_index(db)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/notes", response_model=AdminNoteItem, status_code=status.HTTP_201_CREATED)
def create_note(
    payload: NoteCreateRequest,
    _: Annotated[User, ADMIN_DEPENDENCY],
    db: Annotated[Session, Depends(get_db)],
) -> AdminNoteItem:
    repository = db.query(Repository).filter(Repository.id == payload.repository_id).first()
    if repository is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found.")

    _validate_note_folder(db, repository.id, payload.folder_id)
    note = Note(
        repository_id=repository.id,
        folder_id=payload.folder_id,
        title=payload.title.strip(),
        content_text=payload.content_text.strip(),
        content_json=_build_content_json(payload.content_text, payload.content_json),
        min_clearance_level=payload.min_clearance_level,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    index_note(db, note.id)
    return _load_note_item(db, note.id)


@router.put("/notes/{note_id}", response_model=AdminNoteItem)
def update_note(
    note_id: int,
    payload: NoteUpdateRequest,
    _: Annotated[User, ADMIN_DEPENDENCY],
    db: Annotated[Session, Depends(get_db)],
) -> AdminNoteItem:
    note = (
        db.query(Note)
        .options(selectinload(Note.attachments))
        .filter(Note.id == note_id)
        .first()
    )
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found.")

    _validate_note_folder(db, note.repository_id, payload.folder_id)
    note.folder_id = payload.folder_id
    note.title = payload.title.strip()
    note.content_text = payload.content_text.strip()
    note.content_json = _build_content_json(payload.content_text, payload.content_json)
    note.min_clearance_level = payload.min_clearance_level
    db.add(note)
    db.commit()
    db.refresh(note)
    index_note(db, note.id)
    return _load_note_item(db, note.id)


@router.delete("/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(
    note_id: int,
    _: Annotated[User, ADMIN_DEPENDENCY],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    note = db.query(Note).filter(Note.id == note_id).first()
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found.")

    db.delete(note)
    db.commit()
    delete_note_document(note_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/users", response_model=AdminUsersResponse, dependencies=[ADMIN_DEPENDENCY])
def list_users(db: Annotated[Session, Depends(get_db)]) -> AdminUsersResponse:
    users = db.query(User).options(selectinload(User.roles).selectinload(UserRole.role)).order_by(User.id.asc()).all()
    roles = [role.code for role in db.query(Role).order_by(Role.id.asc()).all()]

    return AdminUsersResponse(
        total=len(users),
        users=[_serialize_user(user) for user in users],
        roles=roles,
    )


@router.get("/roles", response_model=RolesResponse, dependencies=[ADMIN_DEPENDENCY])
def list_roles(db: Annotated[Session, Depends(get_db)]) -> RolesResponse:
    roles = [role.code for role in db.query(Role).order_by(Role.id.asc()).all()]
    return RolesResponse(roles=roles)


@router.get("/security/cors-origins", response_model=CorsOriginsResponse, dependencies=[PLATFORM_ADMIN_DEPENDENCY])
def get_cors_origins(db: Annotated[Session, Depends(get_db)]) -> CorsOriginsResponse:
    persisted = get_cors_origins_setting(db)
    if persisted is not None:
        set_allowed_origins(persisted)
    return CorsOriginsResponse(origins=get_allowed_origins())


@router.put("/security/cors-origins", response_model=CorsOriginsResponse, dependencies=[PLATFORM_ADMIN_DEPENDENCY])
def update_cors_origins(
    payload: CorsOriginsUpdateRequest,
    db: Annotated[Session, Depends(get_db)],
) -> CorsOriginsResponse:
    origins = [_normalize_origin(origin) for origin in payload.origins]
    if not origins:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CORS origins cannot be empty.")
    persisted = set_cors_origins_setting(db, origins)
    set_allowed_origins(persisted)
    return CorsOriginsResponse(origins=persisted)


@router.get("/security/auth-audit", response_model=AuthAuditLogResponse, dependencies=[PLATFORM_ADMIN_DEPENDENCY])
def get_auth_audit_logs(
    db: Annotated[Session, Depends(get_db)],
    limit: int = 50,
) -> AuthAuditLogResponse:
    safe_limit = min(max(limit, 1), 200)
    logs = db.query(AuthAuditLog).order_by(AuthAuditLog.id.desc()).limit(safe_limit).all()
    items = [
        AuthAuditLogItem(
            id=log.id,
            username=log.username,
            event_type=log.event_type,
            status=log.status,
            ip_address=log.ip_address,
            user_agent=log.user_agent,
            detail=log.detail,
            created_at=log.created_at.isoformat(),
        )
        for log in logs
    ]
    return AuthAuditLogResponse(total=len(items), logs=items)


@router.post("/users", response_model=AdminUserItem, status_code=status.HTTP_201_CREATED, dependencies=[ADMIN_DEPENDENCY])
def create_user(payload: UserCreateRequest, db: Annotated[Session, Depends(get_db)]) -> AdminUserItem:
    _ensure_unique_username_email(db, username=payload.username, email=payload.email)
    user = User(
        username=payload.username.strip(),
        full_name=payload.full_name.strip(),
        email=payload.email.strip(),
        hashed_password=get_password_hash(payload.password),
        clearance_level=payload.clearance_level,
        is_active=payload.is_active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    _replace_user_roles(db, user.id, payload.role_codes)
    db.refresh(user)
    return _serialize_user(user)


@router.put("/users/{user_id}", response_model=AdminUserItem, dependencies=[ADMIN_DEPENDENCY])
def update_user(user_id: int, payload: UserUpdateRequest, db: Annotated[Session, Depends(get_db)]) -> AdminUserItem:
    user = (
        db.query(User)
        .options(selectinload(User.roles).selectinload(UserRole.role))
        .filter(User.id == user_id)
        .first()
    )
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    _ensure_unique_username_email(db, username=user.username, email=payload.email, exclude_user_id=user_id)
    old_clearance = user.clearance_level
    old_active = user.is_active
    old_role_codes = {user_role.role.code for user_role in user.roles}
    new_role_codes = set(payload.role_codes)
    should_rotate_token = False

    user.full_name = payload.full_name.strip()
    user.email = payload.email.strip()
    user.clearance_level = payload.clearance_level
    user.is_active = payload.is_active
    if payload.password:
        user.hashed_password = get_password_hash(payload.password)
        should_rotate_token = True
    if old_clearance != user.clearance_level or old_active != user.is_active:
        should_rotate_token = True
    if old_role_codes != new_role_codes:
        should_rotate_token = True
    if should_rotate_token:
        user.token_version += 1
    db.add(user)
    db.commit()
    _replace_user_roles(db, user.id, payload.role_codes)
    db.refresh(user)
    return _serialize_user(user)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[ADMIN_DEPENDENCY])
def delete_user(user_id: int, db: Annotated[Session, Depends(get_db)], current_user: Annotated[User, ADMIN_DEPENDENCY]) -> Response:
    if current_user.id == user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete current user.")

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    db.delete(user)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _normalize_slug(raw_slug: str) -> str:
    normalized = SLUG_RE.sub("-", raw_slug.strip().lower()).strip("-")
    if not normalized:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Repository slug is invalid.")
    return normalized


def _build_content_json(content_text: str, content_json: str | None) -> str:
    if content_json and content_json.strip():
        return content_json.strip()

    normalized_text = content_text.strip()
    return json.dumps(
        {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": normalized_text}],
                }
            ],
        },
        ensure_ascii=False,
    )


def _get_folder(db: Session, folder_id: int) -> Folder:
    folder = (
        db.query(Folder)
        .options(selectinload(Folder.notes))
        .filter(Folder.id == folder_id)
        .first()
    )
    if folder is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found.")
    return folder


def _validate_note_folder(db: Session, repository_id: int, folder_id: int | None) -> None:
    if folder_id is None:
        return

    folder = _get_folder(db, folder_id)
    if folder.repository_id != repository_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Folder is outside repository.")


def _serialize_folder(folder: Folder) -> AdminFolderItem:
    return AdminFolderItem(
        id=folder.id,
        repository_id=folder.repository_id,
        parent_id=folder.parent_id,
        name=folder.name,
        clearance_level=folder.min_clearance_level,
        note_count=len(folder.notes),
    )


def _serialize_repository(repository: Repository) -> AdminRepositoryItem:
    return AdminRepositoryItem(
        id=repository.id,
        slug=repository.slug,
        name=repository.name,
        description=repository.description,
        min_clearance_level=repository.min_clearance_level,
        folder_count=0,
        note_count=0,
        folders=[],
        notes=[],
    )


def _load_repository(db: Session, repository_id: int) -> AdminRepositoryItem:
    repository = (
        db.query(Repository)
        .options(
            selectinload(Repository.folders).selectinload(Folder.notes),
            selectinload(Repository.notes).selectinload(Note.attachments),
        )
        .filter(Repository.id == repository_id)
        .first()
    )
    if repository is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found.")

    return AdminRepositoryItem(
        id=repository.id,
        slug=repository.slug,
        name=repository.name,
        description=repository.description,
        min_clearance_level=repository.min_clearance_level,
        folder_count=len(repository.folders),
        note_count=len(repository.notes),
        folders=[_serialize_folder(folder) for folder in sorted(repository.folders, key=lambda item: item.id)],
        notes=[
            AdminNoteItem(
                id=note.id,
                repository_id=note.repository_id,
                folder_id=note.folder_id,
                title=note.title,
                content_text=note.content_text,
                clearance_level=note.min_clearance_level,
                updated_at=note.updated_at.isoformat(),
                attachment_count=len(note.attachments),
            )
            for note in sorted(repository.notes, key=lambda item: item.updated_at, reverse=True)
        ],
    )


def _load_note_item(db: Session, note_id: int) -> AdminNoteItem:
    note = (
        db.query(Note)
        .options(selectinload(Note.attachments))
        .filter(Note.id == note_id)
        .first()
    )
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found.")

    return AdminNoteItem(
        id=note.id,
        repository_id=note.repository_id,
        folder_id=note.folder_id,
        title=note.title,
        content_text=note.content_text,
        clearance_level=note.min_clearance_level,
        updated_at=note.updated_at.isoformat(),
        attachment_count=len(note.attachments),
    )


def _serialize_user(user: User) -> AdminUserItem:
    role_codes = [user_role.role.code for user_role in user.roles]
    return AdminUserItem(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        clearance_level=user.clearance_level,
        is_active=user.is_active,
        role_codes=role_codes,
    )


def _ensure_unique_username_email(
    db: Session, *, username: str, email: str, exclude_user_id: int | None = None
) -> None:
    existing_username = db.query(User).filter(User.username == username, User.id != exclude_user_id).first()
    if existing_username:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists.")

    existing_email = db.query(User).filter(User.email == email, User.id != exclude_user_id).first()
    if existing_email:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists.")


def _replace_user_roles(db: Session, user_id: int, role_codes: list[str]) -> None:
    roles = db.query(Role).filter(Role.code.in_(role_codes)).all()
    db.query(UserRole).filter(UserRole.user_id == user_id).delete()
    for role in roles:
        db.add(UserRole(user_id=user_id, role_id=role.id))
    db.commit()


def _normalize_origin(origin: str) -> str:
    value = origin.strip().rstrip("/")
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid origin: {origin}")
    if parsed.path not in {"", "/"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Origin must not include path: {origin}")
    return f"{parsed.scheme}://{parsed.netloc}"
