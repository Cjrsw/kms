import json
from pathlib import Path
from urllib.parse import quote
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session, selectinload
from pydantic import BaseModel
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.content import Attachment, Folder, Note, Repository
from app.models.user import User
from app.schemas.repository import (
    AttachmentItem,
    FolderItem,
    NoteDetailResponse,
    NoteListItem,
    NoteCreateRequest,
    NoteUpdateRequest,
    RepositoryDetailResponse,
    RepositoryListItem,
)
from app.services.search import delete_note_document, index_note, rebuild_notes_index
from app.services.ingestion import extract_attachment_text, upsert_attachment_text
from app.services.storage import (
    build_attachment_object_key,
    get_object_bytes,
    remove_object,
    upload_attachment_bytes,
)

router = APIRouter()
ALLOWED_ATTACHMENT_TYPES = {"pdf", "docx"}
MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024
ADMIN_ROLE_CODE = "admin"


@router.get("", response_model=list[RepositoryListItem])
def list_repositories(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[RepositoryListItem]:
    repositories = (
        db.query(Repository)
        .options(selectinload(Repository.notes))
        .filter(Repository.min_clearance_level <= user.clearance_level)
        .order_by(Repository.id.asc())
        .all()
    )

    return [
        RepositoryListItem(
            id=repository.id,
            slug=repository.slug,
            name=repository.name,
            description=repository.description,
            min_clearance_level=repository.min_clearance_level,
            note_count=len([note for note in repository.notes if note.min_clearance_level <= user.clearance_level]),
        )
        for repository in repositories
    ]


@router.get("/{repository_slug}", response_model=RepositoryDetailResponse)
def get_repository(
    repository_slug: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> RepositoryDetailResponse:
    repository = (
        db.query(Repository)
        .options(
            selectinload(Repository.folders),
            selectinload(Repository.notes).selectinload(Note.attachments),
        )
        .filter(Repository.slug == repository_slug)
        .first()
    )
    if repository is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found.")

    if repository.min_clearance_level > user.clearance_level:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Repository access denied.")

    visible_folders = [
        FolderItem(
            id=folder.id,
            name=folder.name,
            parent_id=folder.parent_id,
            clearance_level=folder.min_clearance_level,
        )
        for folder in repository.folders
        if folder.min_clearance_level <= user.clearance_level
    ]
    visible_notes = [
        NoteListItem(
            id=note.id,
            title=note.title,
            folder_id=note.folder_id,
            clearance_level=note.min_clearance_level,
            updated_at=note.updated_at.isoformat(),
            attachment_count=len(note.attachments),
        )
        for note in repository.notes
        if note.min_clearance_level <= user.clearance_level
    ]

    return RepositoryDetailResponse(
        id=repository.id,
        slug=repository.slug,
        name=repository.name,
        description=repository.description,
        min_clearance_level=repository.min_clearance_level,
        folders=visible_folders,
        notes=visible_notes,
    )


@router.get("/{repository_slug}/notes/{note_id}", response_model=NoteDetailResponse)
def get_note(
    repository_slug: str,
    note_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> NoteDetailResponse:
    repository = db.query(Repository).filter(Repository.slug == repository_slug).first()
    if repository is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found.")

    note = (
        db.query(Note)
        .filter(Note.repository_id == repository.id, Note.id == note_id)
        .first()
    )
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found.")

    if note.min_clearance_level > user.clearance_level:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Note access denied.")

    return NoteDetailResponse(
        id=note.id,
        repository_id=note.repository_id,
        folder_id=note.folder_id,
        title=note.title,
        content_json=note.content_json,
        content_text=note.content_text,
        clearance_level=note.min_clearance_level,
        updated_at=note.updated_at.isoformat(),
        attachments=_serialize_attachments(note.attachments),
    )


@router.put("/{repository_slug}/notes/{note_id}", response_model=NoteDetailResponse)
def update_note(
    repository_slug: str,
    note_id: int,
    payload: NoteUpdateRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> NoteDetailResponse:
    repository = db.query(Repository).filter(Repository.slug == repository_slug).first()
    if repository is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found.")

    note = (
        db.query(Note)
        .filter(Note.repository_id == repository.id, Note.id == note_id)
        .first()
    )
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found.")

    if note.min_clearance_level > user.clearance_level:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Note access denied.")

    note.title = payload.title.strip()
    note.content_text = payload.content_text.strip()
    note.content_json = payload.content_json.strip() if payload.content_json else json.dumps(
        {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": note.content_text}],
                }
            ],
        },
        ensure_ascii=False,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    index_note(db, note.id)

    return NoteDetailResponse(
        id=note.id,
        repository_id=note.repository_id,
        folder_id=note.folder_id,
        title=note.title,
        content_json=note.content_json,
        content_text=note.content_text,
        clearance_level=note.min_clearance_level,
        updated_at=note.updated_at.isoformat(),
        attachments=_serialize_attachments(note.attachments),
    )


@router.post("/{repository_slug}/notes", response_model=NoteDetailResponse, status_code=status.HTTP_201_CREATED)
def create_note_user(
    repository_slug: str,
    payload: NoteCreateRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> NoteDetailResponse:
    repository = db.query(Repository).filter(Repository.slug == repository_slug).first()
    if repository is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found.")

    if repository.min_clearance_level > user.clearance_level:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Repository access denied.")

    folder: Folder | None = None
    if payload.folder_id is not None:
        folder = db.query(Folder).filter(Folder.id == payload.folder_id).first()
        if folder is None or folder.repository_id != repository.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Folder is outside repository.")

    min_allowed_level = repository.min_clearance_level
    if folder is not None:
        min_allowed_level = max(min_allowed_level, folder.min_clearance_level)

    # 用户创建笔记时，前端应只允许选择 >= 当前目录密级的值；
    # 后端这里做强校验，避免绕过前端导致“自动抬升”造成误解。
    if payload.min_clearance_level is not None and payload.min_clearance_level < min_allowed_level:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Note clearance must be >= L{min_allowed_level}.",
        )

    desired_level = payload.min_clearance_level or min_allowed_level
    if desired_level > user.clearance_level:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Clearance insufficient for this note.")

    content_text = (payload.content_text or "").strip()
    if payload.content_json and payload.content_json.strip():
        content_json = payload.content_json.strip()
    else:
        # TipTap 不允许空文本节点（text=""），这里用空段落承载“空正文”
        paragraph: dict[str, object] = {"type": "paragraph"}
        if content_text:
            paragraph["content"] = [{"type": "text", "text": content_text}]
        content_json = json.dumps({"type": "doc", "content": [paragraph]}, ensure_ascii=False)

    note = Note(
        repository_id=repository.id,
        folder_id=payload.folder_id,
        title=payload.title.strip(),
        content_text=content_text,
        content_json=content_json,
        min_clearance_level=desired_level,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    index_note(db, note.id)

    return NoteDetailResponse(
        id=note.id,
        repository_id=note.repository_id,
        folder_id=note.folder_id,
        title=note.title,
        content_json=note.content_json,
        content_text=note.content_text,
        clearance_level=note.min_clearance_level,
        updated_at=note.updated_at.isoformat(),
        attachments=[],
    )

class FolderCreateRequest(BaseModel):
    name: str
    parent_id: int | None = None
    min_clearance_level: int | None = None

@router.post("/{repository_slug}/folders", response_model=FolderItem, status_code=status.HTTP_201_CREATED)
def create_folder_user(
    repository_slug: str,
    payload: FolderCreateRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> FolderItem:
    # 1. 检验仓库是否存在及权限
    repository = db.query(Repository).filter(Repository.slug == repository_slug).first()
    if repository is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found.")

    if repository.min_clearance_level > user.clearance_level:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Repository access denied.")

    # 2. 检验父目录是否存在及权限
    parent_folder: Folder | None = None
    if payload.parent_id is not None:
        parent_folder = db.query(Folder).filter(Folder.id == payload.parent_id).first()
        if parent_folder is None or parent_folder.repository_id != repository.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Parent folder is invalid.")
        if parent_folder.min_clearance_level > user.clearance_level:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Parent folder access denied.")

    # 3. 检验创建的新目录密级是否越权
    desired_level = payload.min_clearance_level or (parent_folder.min_clearance_level if parent_folder else repository.min_clearance_level)
    desired_level = max(desired_level, repository.min_clearance_level)
    if parent_folder is not None:
        desired_level = max(desired_level, parent_folder.min_clearance_level)
    if desired_level > user.clearance_level:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Clearance insufficient for this folder.")

    # 4. 插入数据库
    folder = Folder(
        repository_id=repository.id,
        name=payload.name.strip(),
        parent_id=payload.parent_id,
        min_clearance_level=desired_level,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)

    return FolderItem(
        id=folder.id,
        name=folder.name,
        parent_id=folder.parent_id,
        clearance_level=folder.min_clearance_level,
    )


@router.delete("/{repository_slug}/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note_user(
    repository_slug: str,
    note_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    _, note = _get_repository_and_note(db, repository_slug, note_id)
    _ensure_can_delete_by_clearance(user, note.min_clearance_level)

    object_keys = [attachment.object_key for attachment in note.attachments]
    deleted_note_id = note.id
    db.delete(note)
    db.commit()

    for object_key in object_keys:
        remove_object(object_key)
    delete_note_document(deleted_note_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{repository_slug}/folders/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_folder_user(
    repository_slug: str,
    folder_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    repository = db.query(Repository).filter(Repository.slug == repository_slug).first()
    if repository is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found.")
    if repository.min_clearance_level > user.clearance_level:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Repository access denied.")

    folder = (
        db.query(Folder)
        .options(selectinload(Folder.children), selectinload(Folder.notes))
        .filter(Folder.id == folder_id, Folder.repository_id == repository.id)
        .first()
    )
    if folder is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found.")

    all_folders = db.query(Folder).filter(Folder.repository_id == repository.id).all()
    descendant_ids = _collect_descendant_folder_ids(folder.id, all_folders)

    is_admin = _is_admin_user(user)
    if not is_admin:
        folder_level_violates = any(
            current_folder.min_clearance_level > user.clearance_level
            for current_folder in all_folders
            if current_folder.id in descendant_ids
        )
        if folder_level_violates:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Folder access denied.")

    notes_to_delete = (
        db.query(Note)
        .options(selectinload(Note.attachments))
        .filter(
            Note.repository_id == repository.id,
            Note.folder_id.in_(descendant_ids),
        )
        .all()
    )

    if not is_admin:
        for note in notes_to_delete:
            if note.min_clearance_level > user.clearance_level:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Note access denied.")

    object_keys: list[str] = []
    for note in notes_to_delete:
        object_keys.extend(attachment.object_key for attachment in note.attachments)
        db.delete(note)

    db.delete(folder)
    db.commit()

    for object_key in object_keys:
        remove_object(object_key)
    rebuild_notes_index(db)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{repository_slug}/notes/{note_id}/attachments", response_model=AttachmentItem, status_code=status.HTTP_201_CREATED)
async def upload_attachment(
    repository_slug: str,
    note_id: int,
    file: Annotated[UploadFile, File(...)],
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> AttachmentItem:
    _, note = _get_repository_and_note(db, repository_slug, note_id)

    if note.min_clearance_level > user.clearance_level:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Note access denied.")

    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Attachment file name is required.")

    file_extension = Path(file.filename).suffix.lower().lstrip(".")
    if file_extension not in ALLOWED_ATTACHMENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF and DOCX attachments are supported in the MVP.",
        )

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty attachments are not allowed.")
    if len(file_bytes) > MAX_ATTACHMENT_SIZE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Attachment exceeds the 20MB limit.")

    object_key = build_attachment_object_key(note.id, file.filename)
    upload_attachment_bytes(
        object_key=object_key,
        data=file_bytes,
        content_type=file.content_type or "application/octet-stream",
    )

    attachment = Attachment(
        note_id=note.id,
        file_name=file.filename,
        file_type=file_extension,
        object_key=object_key,
        file_size=len(file_bytes),
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)

    extracted_text = extract_attachment_text(file.filename, file_bytes)
    upsert_attachment_text(db, attachment, extracted_text)
    index_note(db, note.id)

    return _serialize_attachment(attachment)


@router.get("/{repository_slug}/notes/{note_id}/attachments/{attachment_id}/download")
def download_attachment(
    repository_slug: str,
    note_id: int,
    attachment_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    _, note = _get_repository_and_note(db, repository_slug, note_id)

    if note.min_clearance_level > user.clearance_level:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Note access denied.")

    attachment = (
        db.query(Attachment)
        .filter(Attachment.note_id == note.id, Attachment.id == attachment_id)
        .first()
    )
    if attachment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found.")

    object_bytes = get_object_bytes(attachment.object_key)
    if object_bytes is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment object not found in storage.")

    filename = quote(attachment.file_name)
    return Response(
        content=object_bytes,
        media_type=_resolve_attachment_media_type(attachment.file_type),
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{filename}",
        },
    )


@router.get("/{repository_slug}/notes/{note_id}/attachments/{attachment_id}/preview")
def preview_attachment(
    repository_slug: str,
    note_id: int,
    attachment_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    _, note = _get_repository_and_note(db, repository_slug, note_id)

    if note.min_clearance_level > user.clearance_level:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Note access denied.")

    attachment = (
        db.query(Attachment)
        .filter(Attachment.note_id == note.id, Attachment.id == attachment_id)
        .first()
    )
    if attachment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found.")

    object_bytes = get_object_bytes(attachment.object_key)
    if object_bytes is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment object not found in storage.")

    filename = quote(attachment.file_name)
    return Response(
        content=object_bytes,
        media_type=_resolve_attachment_media_type(attachment.file_type),
        headers={
            "Content-Disposition": f"inline; filename*=UTF-8''{filename}",
        },
    )


@router.delete("/{repository_slug}/notes/{note_id}/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attachment(
    repository_slug: str,
    note_id: int,
    attachment_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    _, note = _get_repository_and_note(db, repository_slug, note_id)
    if note.min_clearance_level > user.clearance_level:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Note access denied.")

    attachment = (
        db.query(Attachment)
        .options(selectinload(Attachment.extracted_content))
        .filter(Attachment.note_id == note.id, Attachment.id == attachment_id)
        .first()
    )
    if attachment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found.")

    object_key = attachment.object_key
    db.delete(attachment)
    db.commit()
    remove_object(object_key)
    index_note(db, note.id)


@router.put("/{repository_slug}/notes/{note_id}/attachments/{attachment_id}", response_model=AttachmentItem)
async def replace_attachment(
    repository_slug: str,
    note_id: int,
    attachment_id: int,
    file: Annotated[UploadFile, File(...)],
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> AttachmentItem:
    _, note = _get_repository_and_note(db, repository_slug, note_id)
    if note.min_clearance_level > user.clearance_level:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Note access denied.")

    attachment = (
        db.query(Attachment)
        .options(selectinload(Attachment.extracted_content))
        .filter(Attachment.note_id == note.id, Attachment.id == attachment_id)
        .first()
    )
    if attachment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found.")

    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Attachment file name is required.")
    file_extension = Path(file.filename).suffix.lower().lstrip(".")
    if file_extension not in ALLOWED_ATTACHMENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF and DOCX attachments are supported in the MVP.",
        )

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty attachments are not allowed.")
    if len(file_bytes) > MAX_ATTACHMENT_SIZE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Attachment exceeds the 20MB limit.")

    old_object_key = attachment.object_key
    new_object_key = build_attachment_object_key(note.id, file.filename)
    upload_attachment_bytes(
        object_key=new_object_key,
        data=file_bytes,
        content_type=file.content_type or "application/octet-stream",
    )

    attachment.file_name = file.filename
    attachment.file_type = file_extension
    attachment.object_key = new_object_key
    attachment.file_size = len(file_bytes)
    if attachment.extracted_content:
        db.delete(attachment.extracted_content)
    db.add(attachment)
    db.commit()
    db.refresh(attachment)

    extracted_text = extract_attachment_text(file.filename, file_bytes)
    upsert_attachment_text(db, attachment, extracted_text)
    index_note(db, note.id)

    remove_object(old_object_key)
    return _serialize_attachment(attachment)


def _serialize_attachment(attachment: Attachment) -> AttachmentItem:
    return AttachmentItem(
        id=attachment.id,
        file_name=attachment.file_name,
        file_type=attachment.file_type,
        file_size=attachment.file_size,
        created_at=attachment.created_at.isoformat(),
        download_url=None,
    )


def _serialize_attachments(attachments: list[Attachment]) -> list[AttachmentItem]:
    return [_serialize_attachment(attachment) for attachment in attachments]


def _get_repository_and_note(db: Session, repository_slug: str, note_id: int) -> tuple[Repository, Note]:
    repository = db.query(Repository).filter(Repository.slug == repository_slug).first()
    if repository is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found.")

    note = (
        db.query(Note)
        .options(selectinload(Note.attachments))
        .filter(Note.repository_id == repository.id, Note.id == note_id)
        .first()
    )
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found.")

    return repository, note


def _resolve_attachment_media_type(file_type: str) -> str:
    if file_type == "pdf":
        return "application/pdf"
    if file_type == "docx":
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    return "application/octet-stream"


def _collect_descendant_folder_ids(root_folder_id: int, folders: list[Folder]) -> set[int]:
    children_map: dict[int, list[int]] = {}
    for folder in folders:
        if folder.parent_id is None:
            continue
        children_map.setdefault(folder.parent_id, []).append(folder.id)

    visited: set[int] = set()
    stack = [root_folder_id]
    while stack:
        current = stack.pop()
        if current in visited:
            continue
        visited.add(current)
        stack.extend(children_map.get(current, []))
    return visited


def _is_admin_user(user: User) -> bool:
    return any(user_role.role.code == ADMIN_ROLE_CODE for user_role in user.roles)


def _ensure_can_delete_by_clearance(user: User, target_clearance_level: int) -> None:
    if _is_admin_user(user):
        return
    if target_clearance_level > user.clearance_level:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
