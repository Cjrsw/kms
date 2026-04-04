from __future__ import annotations

import json
import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session, selectinload

from app.core.deps import require_role
from app.core.security import get_password_hash
from app.db.session import get_db
from app.models.content import Folder, Note, Repository
from app.models.user import Role, User, UserRole
from app.schemas.admin import (
    AdminContentResponse,
    AdminFolderItem,
    AdminNoteItem,
    AdminRoleItem,
    AdminRepositoryItem,
    AdminUserItem,
    FolderCreateRequest,
    FolderUpdateRequest,
    NoteCreateRequest,
    NoteUpdateRequest,
    RepositoryCreateRequest,
    RepositoryUpdateRequest,
    UserCreateRequest,
    UserUpdateRequest,
)
from app.services.search import delete_note_document, index_note, rebuild_notes_index

router = APIRouter()
ADMIN_DEPENDENCY = Depends(require_role("platform_admin", "repo_admin"))
SLUG_RE = re.compile(r"[^a-z0-9]+")


@router.get("/content", response_model=AdminContentResponse)
def get_admin_content(
    _: Annotated[User, ADMIN_DEPENDENCY],
    db: Annotated[Session, Depends(get_db)],
) -> AdminContentResponse:
    users = (
        db.query(User)
        .options(selectinload(User.roles).selectinload(UserRole.role))
        .order_by(User.id.asc())
        .all()
    )
    roles = db.query(Role).order_by(Role.id.asc()).all()
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
        user_count=len(users),
        repository_count=len(serialized_repositories),
        folder_count=sum(len(repository.folders) for repository in repositories),
        note_count=sum(len(repository.notes) for repository in repositories),
        users=[_serialize_user(user) for user in users],
        available_roles=[AdminRoleItem(code=role.code, name=role.name) for role in roles],
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


@router.post("/users", response_model=AdminUserItem, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreateRequest,
    _: Annotated[User, ADMIN_DEPENDENCY],
    db: Annotated[Session, Depends(get_db)],
) -> AdminUserItem:
    _ensure_unique_user_fields(db, username=payload.username, email=payload.email)
    _ensure_role_codes_exist(db, payload.role_codes)
    user = User(
        username=payload.username.strip(),
        full_name=payload.full_name.strip(),
        email=payload.email.strip().lower(),
        hashed_password=get_password_hash(payload.password),
        clearance_level=payload.clearance_level,
        is_active=payload.is_active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    _sync_user_roles(db, user, payload.role_codes)
    return _load_user_item(db, user.id)


@router.put("/users/{user_id}", response_model=AdminUserItem)
def update_user(
    user_id: int,
    payload: UserUpdateRequest,
    _: Annotated[User, ADMIN_DEPENDENCY],
    db: Annotated[Session, Depends(get_db)],
) -> AdminUserItem:
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    _ensure_unique_user_fields(db, username=user.username, email=payload.email, exclude_user_id=user.id)
    _ensure_role_codes_exist(db, payload.role_codes)
    user.full_name = payload.full_name.strip()
    user.email = payload.email.strip().lower()
    user.clearance_level = payload.clearance_level
    user.is_active = payload.is_active
    if payload.password and payload.password.strip():
        user.hashed_password = get_password_hash(payload.password.strip())
    db.add(user)
    db.commit()
    db.refresh(user)
    _sync_user_roles(db, user, payload.role_codes)
    return _load_user_item(db, user.id)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    current_user: Annotated[User, ADMIN_DEPENDENCY],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    if user.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current admin user cannot be deleted.")

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
    return AdminUserItem(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        clearance_level=user.clearance_level,
        is_active=user.is_active,
        role_codes=sorted(user_role.role.code for user_role in user.roles),
    )


def _load_user_item(db: Session, user_id: int) -> AdminUserItem:
    user = (
        db.query(User)
        .options(selectinload(User.roles).selectinload(UserRole.role))
        .filter(User.id == user_id)
        .first()
    )
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return _serialize_user(user)


def _ensure_unique_user_fields(
    db: Session,
    *,
    username: str,
    email: str,
    exclude_user_id: int | None = None,
) -> None:
    normalized_username = username.strip()
    normalized_email = email.strip().lower()

    username_query = db.query(User).filter(User.username == normalized_username)
    email_query = db.query(User).filter(User.email == normalized_email)
    if exclude_user_id is not None:
        username_query = username_query.filter(User.id != exclude_user_id)
        email_query = email_query.filter(User.id != exclude_user_id)

    if username_query.first() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists.")
    if email_query.first() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists.")


def _sync_user_roles(db: Session, user: User, role_codes: list[str]) -> None:
    normalized_role_codes = sorted({role_code.strip() for role_code in role_codes if role_code.strip()})
    roles = db.query(Role).filter(Role.code.in_(normalized_role_codes)).all() if normalized_role_codes else []
    db.query(UserRole).filter(UserRole.user_id == user.id).delete()
    for role in roles:
        db.add(UserRole(user_id=user.id, role_id=role.id))
    db.commit()


def _ensure_role_codes_exist(db: Session, role_codes: list[str]) -> None:
    normalized_role_codes = sorted({role_code.strip() for role_code in role_codes if role_code.strip()})
    if not normalized_role_codes:
        return

    roles = db.query(Role).filter(Role.code.in_(normalized_role_codes)).all()
    found_codes = {role.code for role in roles}
    missing_codes = set(normalized_role_codes) - found_codes
    if missing_codes:
        missing_code = sorted(missing_codes)[0]
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown role code: {missing_code}")
