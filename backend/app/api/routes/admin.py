from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from typing import Annotated
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from app.core.cors_state import get_allowed_origins, set_allowed_origins
from app.core.config import get_settings
from app.core.deps import require_role
from app.core.security import get_password_hash
from app.db.session import get_db
from app.models.ai import QaAuditLog
from app.models.content import Folder, Note, Repository
from app.models.user import AuthAuditLog, Department, Role, User, UserRole
from app.schemas.ai import (
    AdminQASystemPromptResponse,
    AdminQASystemPromptUpdateRequest,
    QaAuditLogResponse,
)
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
    DepartmentCreateRequest,
    DepartmentItem,
    DepartmentsResponse,
    DepartmentUpdateRequest,
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
from app.services.system_settings import (
    get_cors_origins_setting,
    get_qa_system_prompt_setting,
    set_cors_origins_setting,
    set_qa_system_prompt_setting,
)

router = APIRouter()
settings = get_settings()
ADMIN_ROLE_CODE = "admin"
EMPLOYEE_ROLE_CODE = "employee"
ADMIN_DEPENDENCY = Depends(require_role(ADMIN_ROLE_CODE))
PLATFORM_ADMIN_DEPENDENCY = Depends(require_role(ADMIN_ROLE_CODE))
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
    current_user: Annotated[User, ADMIN_DEPENDENCY],
    db: Annotated[Session, Depends(get_db)],
) -> AdminNoteItem:
    repository = db.query(Repository).filter(Repository.id == payload.repository_id).first()
    if repository is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found.")

    folder = _validate_note_folder(db, repository.id, payload.folder_id)
    min_note_level = _calculate_min_note_clearance(repository.min_clearance_level, folder)
    if payload.min_clearance_level < min_note_level:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Note clearance must be >= L{min_note_level}.",
        )
    note = Note(
        repository_id=repository.id,
        folder_id=payload.folder_id,
        title=payload.title.strip(),
        author_name=(current_user.full_name or current_user.username).strip() or "系统",
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

    repository = db.query(Repository).filter(Repository.id == note.repository_id).first()
    if repository is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found.")

    folder = _validate_note_folder(db, note.repository_id, payload.folder_id)
    min_note_level = _calculate_min_note_clearance(repository.min_clearance_level, folder)
    if payload.min_clearance_level < min_note_level:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Note clearance must be >= L{min_note_level}.",
        )

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


@router.get("/departments", response_model=DepartmentsResponse, dependencies=[ADMIN_DEPENDENCY])
def list_departments(db: Annotated[Session, Depends(get_db)]) -> DepartmentsResponse:
    departments = db.query(Department).order_by(Department.sort_order.asc(), Department.id.asc()).all()
    items = [_serialize_department(db, department) for department in departments]
    return DepartmentsResponse(total=len(items), departments=items)


@router.post("/departments", response_model=DepartmentItem, status_code=status.HTTP_201_CREATED, dependencies=[ADMIN_DEPENDENCY])
def create_department(payload: DepartmentCreateRequest, db: Annotated[Session, Depends(get_db)]) -> DepartmentItem:
    code = payload.code.strip().lower()
    name = payload.name.strip()
    if not code or not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department code and name are required.")

    if db.query(Department).filter(Department.code == code).first() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Department code already exists.")
    if db.query(Department).filter(Department.name == name).first() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Department name already exists.")
    if payload.parent_id is not None and db.query(Department).filter(Department.id == payload.parent_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent department not found.")

    department = Department(
        code=code,
        name=name,
        parent_id=payload.parent_id,
        sort_order=payload.sort_order,
        is_active=payload.is_active,
    )
    db.add(department)
    db.commit()
    db.refresh(department)
    return _serialize_department(db, department)


@router.put("/departments/{department_id}", response_model=DepartmentItem, dependencies=[ADMIN_DEPENDENCY])
def update_department(
    department_id: int,
    payload: DepartmentUpdateRequest,
    db: Annotated[Session, Depends(get_db)],
) -> DepartmentItem:
    department = db.query(Department).filter(Department.id == department_id).first()
    if department is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found.")

    code = payload.code.strip().lower()
    name = payload.name.strip()
    if not code or not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department code and name are required.")
    if payload.parent_id == department.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department cannot be its own parent.")
    if payload.parent_id is not None and db.query(Department).filter(Department.id == payload.parent_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent department not found.")

    duplicate_code = db.query(Department).filter(Department.code == code, Department.id != department_id).first()
    if duplicate_code is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Department code already exists.")
    duplicate_name = db.query(Department).filter(Department.name == name, Department.id != department_id).first()
    if duplicate_name is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Department name already exists.")

    department.code = code
    department.name = name
    department.parent_id = payload.parent_id
    department.sort_order = payload.sort_order
    department.is_active = payload.is_active
    db.add(department)
    db.commit()
    db.refresh(department)
    return _serialize_department(db, department)


@router.get("/users", response_model=AdminUsersResponse, dependencies=[ADMIN_DEPENDENCY])
def list_users(
    db: Annotated[Session, Depends(get_db)],
    department_id: int | None = None,
    keyword: str | None = None,
    account_status: str = "all",
) -> AdminUsersResponse:
    query = db.query(User).options(
        selectinload(User.roles).selectinload(UserRole.role),
        selectinload(User.department),
    )
    if department_id is not None:
        query = query.filter(User.department_id == department_id)

    normalized_keyword = (keyword or "").strip()
    if normalized_keyword:
        like_keyword = f"%{normalized_keyword}%"
        query = query.filter(
            or_(
                User.full_name.like(like_keyword),
                User.username.like(like_keyword),
                User.phone.like(like_keyword),
            )
        )

    if account_status == "active":
        query = query.filter(User.is_active.is_(True))
    elif account_status == "inactive":
        query = query.filter(User.is_active.is_(False))

    users = query.order_by(User.id.asc()).all()
    roles = [ADMIN_ROLE_CODE, EMPLOYEE_ROLE_CODE]
    departments = db.query(Department).order_by(Department.sort_order.asc(), Department.id.asc()).all()

    return AdminUsersResponse(
        total=len(users),
        users=[_serialize_user(user) for user in users],
        roles=roles,
        departments=[_serialize_department(db, department) for department in departments],
    )


@router.get("/roles", response_model=RolesResponse, dependencies=[ADMIN_DEPENDENCY])
def list_roles() -> RolesResponse:
    return RolesResponse(roles=[ADMIN_ROLE_CODE, EMPLOYEE_ROLE_CODE])


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


@router.get("/security/qa-audit", response_model=QaAuditLogResponse, dependencies=[PLATFORM_ADMIN_DEPENDENCY])
def get_qa_audit_logs(
    db: Annotated[Session, Depends(get_db)],
    limit: int = 50,
) -> QaAuditLogResponse:
    safe_limit = min(max(limit, 1), 200)
    logs = db.query(QaAuditLog).order_by(QaAuditLog.id.desc()).limit(safe_limit).all()
    items = [
        {
            "id": log.id,
            "username": log.username,
            "question": log.question,
            "repository_slug": log.repository_slug,
            "model_name": log.model_name,
            "status": log.status,
            "error_code": log.error_code,
            "error_category": log.error_category,
            "hint": log.hint,
            "trace_id": log.trace_id,
            "latency_ms": log.latency_ms,
            "source_count": log.source_count,
            "recall_mode": log.recall_mode,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]
    return QaAuditLogResponse(total=len(items), logs=items)


@router.get("/ai/models", dependencies=[PLATFORM_ADMIN_DEPENDENCY])
def list_ai_models() -> dict[str, object]:
    _raise_fixed_model_policy_disabled()


@router.post("/ai/models", dependencies=[PLATFORM_ADMIN_DEPENDENCY])
def create_ai_model_api() -> dict[str, object]:
    _raise_fixed_model_policy_disabled()


@router.put("/ai/models/{model_id}", dependencies=[PLATFORM_ADMIN_DEPENDENCY])
def update_ai_model_api(model_id: int) -> dict[str, object]:
    _ = model_id
    _raise_fixed_model_policy_disabled()


@router.post("/ai/models/{model_id}/enable", dependencies=[PLATFORM_ADMIN_DEPENDENCY])
def enable_ai_model(model_id: int) -> dict[str, object]:
    _ = model_id
    _raise_fixed_model_policy_disabled()


@router.post("/ai/models/{model_id}/disable", dependencies=[PLATFORM_ADMIN_DEPENDENCY])
def disable_ai_model(model_id: int) -> dict[str, object]:
    _ = model_id
    _raise_fixed_model_policy_disabled()


@router.delete("/ai/models/{model_id}", dependencies=[PLATFORM_ADMIN_DEPENDENCY])
def delete_ai_model_api(model_id: int) -> dict[str, object]:
    _ = model_id
    _raise_fixed_model_policy_disabled()


@router.put("/ai/defaults", dependencies=[PLATFORM_ADMIN_DEPENDENCY])
def update_ai_defaults() -> dict[str, object]:
    _raise_fixed_model_policy_disabled()


@router.get("/ai/system-prompt", response_model=AdminQASystemPromptResponse, dependencies=[PLATFORM_ADMIN_DEPENDENCY])
def get_qa_system_prompt(db: Annotated[Session, Depends(get_db)]) -> AdminQASystemPromptResponse:
    value, updated_at = get_qa_system_prompt_setting(db)
    prompt = value or settings.qa_system_prompt_default
    return AdminQASystemPromptResponse(
        system_prompt=prompt,
        updated_at=updated_at.isoformat() if updated_at else None,
    )


@router.put("/ai/system-prompt", response_model=AdminQASystemPromptResponse, dependencies=[PLATFORM_ADMIN_DEPENDENCY])
def update_qa_system_prompt(
    payload: AdminQASystemPromptUpdateRequest,
    db: Annotated[Session, Depends(get_db)],
) -> AdminQASystemPromptResponse:
    value, updated_at = set_qa_system_prompt_setting(db, payload.system_prompt)
    return AdminQASystemPromptResponse(
        system_prompt=value,
        updated_at=updated_at.isoformat() if updated_at else None,
    )


@router.post("/users", response_model=AdminUserItem, status_code=status.HTTP_201_CREATED, dependencies=[ADMIN_DEPENDENCY])
def create_user(payload: UserCreateRequest, db: Annotated[Session, Depends(get_db)]) -> AdminUserItem:
    if payload.department_id is not None and db.query(Department).filter(Department.id == payload.department_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found.")

    full_name = payload.full_name.strip()
    if not full_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Full name is required.")

    username = _generate_employee_username(db, full_name)
    user = User(
        username=username,
        full_name=full_name,
        email=None,
        phone=None,
        position=(payload.position or "").strip() or None,
        gender=(payload.gender or "").strip() or None,
        hashed_password=get_password_hash("123456"),
        clearance_level=payload.clearance_level,
        department_id=payload.department_id,
        is_active=True,
        need_password_change=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    _replace_user_roles(db, user.id, [EMPLOYEE_ROLE_CODE])
    db.refresh(user)
    return _serialize_user(user)


@router.put("/users/{user_id}", response_model=AdminUserItem, dependencies=[ADMIN_DEPENDENCY])
def update_user(user_id: int, payload: UserUpdateRequest, db: Annotated[Session, Depends(get_db)]) -> AdminUserItem:
    user = (
        db.query(User)
        .options(
            selectinload(User.roles).selectinload(UserRole.role),
            selectinload(User.department),
        )
        .filter(User.id == user_id)
        .first()
    )
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    if _has_role(user, ADMIN_ROLE_CODE):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="System admin user cannot be edited here.")

    if payload.department_id is not None and db.query(Department).filter(Department.id == payload.department_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found.")

    if payload.email:
        _ensure_unique_username_email(db, username=user.username, email=payload.email, exclude_user_id=user_id)

    old_clearance = user.clearance_level
    old_active = user.is_active
    should_rotate_token = False

    user.full_name = payload.full_name.strip()
    user.department_id = payload.department_id
    user.position = payload.position.strip() if payload.position else None
    user.gender = payload.gender.strip() if payload.gender else None
    user.phone = payload.phone.strip() if payload.phone else None
    user.email = payload.email.strip() if payload.email else None
    user.bio = payload.bio.strip() if payload.bio else None
    user.clearance_level = payload.clearance_level
    user.is_active = payload.is_active

    if old_active and not user.is_active:
        user.deactivated_at = datetime.now(UTC).replace(tzinfo=None)
        should_rotate_token = True
    elif (not old_active) and user.is_active:
        user.deactivated_at = None
        should_rotate_token = True

    if old_clearance != user.clearance_level:
        should_rotate_token = True

    if should_rotate_token:
        user.token_version += 1

    db.add(user)
    db.commit()
    db.refresh(user)
    return _serialize_user(user)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[ADMIN_DEPENDENCY])
def delete_user(user_id: int, db: Annotated[Session, Depends(get_db)], current_user: Annotated[User, ADMIN_DEPENDENCY]) -> Response:
    if current_user.id == user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete current user.")

    user = db.query(User).options(selectinload(User.roles).selectinload(UserRole.role)).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    if _has_role(user, ADMIN_ROLE_CODE):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="System admin user cannot be deleted.")

    db.delete(user)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _raise_fixed_model_policy_disabled() -> None:
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail={
            "error_code": "feature_disabled_fixed_model_policy",
            "message": "Model management is disabled by fixed-model policy.",
        },
    )


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


def _validate_note_folder(db: Session, repository_id: int, folder_id: int | None) -> Folder | None:
    if folder_id is None:
        return None

    folder = _get_folder(db, folder_id)
    if folder.repository_id != repository_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Folder is outside repository.")
    return folder


def _calculate_min_note_clearance(repository_level: int, folder: Folder | None) -> int:
    if folder is None:
        return repository_level
    return max(repository_level, folder.min_clearance_level)


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
    role_code = ADMIN_ROLE_CODE if _has_role(user, ADMIN_ROLE_CODE) else EMPLOYEE_ROLE_CODE
    return AdminUserItem(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        phone=user.phone,
        department_id=user.department_id,
        department_name=user.department.name if user.department else None,
        position=user.position,
        gender=user.gender,
        bio=user.bio,
        clearance_level=user.clearance_level,
        is_active=user.is_active,
        deactivated_at=user.deactivated_at.isoformat() if user.deactivated_at else None,
        role_code=role_code,
        need_password_change=user.need_password_change,
        created_at=user.created_at.isoformat(),
    )


def _ensure_unique_username_email(
    db: Session, *, username: str, email: str | None, exclude_user_id: int | None = None
) -> None:
    existing_username = db.query(User).filter(User.username == username, User.id != exclude_user_id).first()
    if existing_username:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists.")

    if email:
        existing_email = db.query(User).filter(User.email == email, User.id != exclude_user_id).first()
        if existing_email:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists.")


def _replace_user_roles(db: Session, user_id: int, role_codes: list[str]) -> None:
    roles = db.query(Role).filter(Role.code.in_(role_codes)).all()
    db.query(UserRole).filter(UserRole.user_id == user_id).delete()
    for role in roles:
        db.add(UserRole(user_id=user_id, role_id=role.id))
    db.commit()


def _serialize_department(db: Session, department: Department) -> DepartmentItem:
    member_count = db.query(func.count(User.id)).filter(User.department_id == department.id).scalar() or 0
    return DepartmentItem(
        id=department.id,
        code=department.code,
        name=department.name,
        parent_id=department.parent_id,
        is_active=department.is_active,
        sort_order=department.sort_order,
        member_count=int(member_count),
    )


def _generate_employee_username(db: Session, full_name: str) -> str:
    base_name = "".join(full_name.split())
    if not base_name:
        base_name = "employee"
    max_name_len = 40
    base_name = base_name[:max_name_len]
    base = f"{base_name}@kms.com"
    candidate = base
    suffix = 1
    while db.query(User).filter(User.username == candidate).first() is not None:
        suffix += 1
        suffix_text = str(suffix)
        allowed_len = max_name_len - len(suffix_text)
        candidate = f"{base_name[:allowed_len]}{suffix_text}@kms.com"
    return candidate


def _has_role(user: User, role_code: str) -> bool:
    return any(user_role.role.code == role_code for user_role in user.roles)


def _normalize_origin(origin: str) -> str:
    value = origin.strip().rstrip("/")
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid origin: {origin}")
    if parsed.path not in {"", "/"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Origin must not include path: {origin}")
    return f"{parsed.scheme}://{parsed.netloc}"
