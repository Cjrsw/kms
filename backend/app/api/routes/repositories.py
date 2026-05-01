import json
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import quote
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session, selectinload
from pydantic import BaseModel
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.content import Attachment, Folder, Note, NoteComment, NoteFavorite, NoteLike, Repository
from app.models.user import User
from app.schemas.repository import (
    AttachmentItem,
    FolderItem,
    NoteCommentCreateRequest,
    NoteCommentItem,
    NoteDetailResponse,
    NoteFavoriteResponse,
    NoteLikeResponse,
    NoteListItem,
    NoteCreateRequest,
    NoteUpdateRequest,
    RepositoryDetailResponse,
    RepositoryListItem,
)
from app.services.content_cleanup import (
    cleanup_deleted_note_resources,
    collect_descendant_folder_ids,
    collect_note_cleanup_payload,
)
from app.services.note_indexing import enqueue_note_index
from app.services.markdown import resolve_note_body
from app.services.attachment_ingestion import enqueue_attachment_ingestion
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
LATEST_NOTE_WINDOW = timedelta(days=1)
LATEST_NOTE_LIMIT = 2


@router.get("", response_model=list[RepositoryListItem])
def list_repositories(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[RepositoryListItem]:
    repositories = (
        db.query(Repository)
        .options(selectinload(Repository.notes), selectinload(Repository.folders))
        .filter(Repository.min_clearance_level <= user.clearance_level)
        .order_by(Repository.id.asc())
        .all()
    )

    recent_cutoff = datetime.utcnow() - LATEST_NOTE_WINDOW
    items: list[RepositoryListItem] = []
    for repository in repositories:
        visible_notes = [
            note for note in repository.notes if note.min_clearance_level <= user.clearance_level
        ]
        latest_notes = [
            _serialize_note_list_item(note, user)
            for note in sorted(visible_notes, key=lambda item: (item.created_at, item.id), reverse=True)
            if note.created_at >= recent_cutoff
        ][:LATEST_NOTE_LIMIT]
        items.append(
            RepositoryListItem(
                id=repository.id,
                slug=repository.slug,
                name=repository.name,
                description=repository.description,
                cover_image_url=repository.cover_image_url or "",
                has_cover_image_upload=bool(repository.cover_image_object_key),
                min_clearance_level=repository.min_clearance_level,
                folder_count=len(
                    [
                        folder
                        for folder in repository.folders
                        if folder.min_clearance_level <= user.clearance_level
                    ]
                ),
                note_count=len(visible_notes),
                latest_notes=latest_notes,
            )
        )
    return items


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
        _serialize_note_list_item(note, user)
        for note in repository.notes
        if note.min_clearance_level <= user.clearance_level
    ]
    return RepositoryDetailResponse(
        id=repository.id,
        slug=repository.slug,
        name=repository.name,
        description=repository.description,
        cover_image_url=repository.cover_image_url or "",
        has_cover_image_upload=bool(repository.cover_image_object_key),
        min_clearance_level=repository.min_clearance_level,
        folders=visible_folders,
        notes=visible_notes,
    )


@router.get("/{repository_slug}/cover")
def get_repository_cover(
    repository_slug: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    repository = db.query(Repository).filter(Repository.slug == repository_slug).first()
    if repository is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found.")
    if repository.min_clearance_level > user.clearance_level:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Repository access denied.")
    if not repository.cover_image_object_key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository cover not found.")

    object_bytes = get_object_bytes(repository.cover_image_object_key)
    if object_bytes is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository cover not found in storage.")

    return Response(
        content=object_bytes,
        media_type=_resolve_cover_media_type(repository.cover_image_object_key),
        headers={"Cache-Control": "private, max-age=300"},
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
        .options(
            selectinload(Note.attachments),
            selectinload(Note.favorites),
            selectinload(Note.likes),
            selectinload(Note.comments).selectinload(NoteComment.user),
        )
        .filter(Note.repository_id == repository.id, Note.id == note_id)
        .first()
    )
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found.")

    if note.min_clearance_level > user.clearance_level:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Note access denied.")

    return _serialize_note_detail(note, user)


@router.put("/{repository_slug}/notes/{note_id}", response_model=NoteDetailResponse)
def update_note(
    repository_slug: str,
    note_id: int,
    payload: NoteUpdateRequest,
    background_tasks: BackgroundTasks,
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
    _ensure_can_modify_note(user, note)

    content_markdown, content_text = resolve_note_body(
        content_markdown=payload.content_markdown,
        content_text=payload.content_text,
    )

    note.title = payload.title.strip()
    note.content_markdown = content_markdown
    note.content_text = content_text
    note.content_json = payload.content_json.strip() if payload.content_json else json.dumps(
        {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": note.content_text}] if note.content_text else [],
                }
            ],
        },
        ensure_ascii=False,
    )
    if payload.editable_by_clearance is not None and _is_note_creator(user, note):
        note.editable_by_clearance = payload.editable_by_clearance
    db.add(note)
    db.commit()
    db.refresh(note)
    enqueue_note_index(background_tasks, db, note.id)

    db.refresh(note)
    return _serialize_note_detail(_load_note_detail(db, note.id), user)


@router.post("/{repository_slug}/notes", response_model=NoteDetailResponse, status_code=status.HTTP_201_CREATED)
def create_note_user(
    repository_slug: str,
    payload: NoteCreateRequest,
    background_tasks: BackgroundTasks,
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

    content_markdown, content_text = resolve_note_body(
        content_markdown=payload.content_markdown,
        content_text=payload.content_text,
    )
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
        author_user_id=user.id,
        title=payload.title.strip(),
        author_name=(user.full_name or user.username).strip() or "系统",
        content_text=content_text,
        content_json=content_json,
        content_markdown=content_markdown,
        min_clearance_level=desired_level,
        editable_by_clearance=payload.editable_by_clearance,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    enqueue_note_index(background_tasks, db, note.id)

    return _serialize_note_detail(_load_note_detail(db, note.id), user)

class FolderCreateRequest(BaseModel):
    name: str
    parent_id: int | None = None
    min_clearance_level: int | None = None


class NoteIndexStatusResponse(BaseModel):
    note_id: int
    status: str
    error: str | None = None
    indexed_at: str | None = None


@router.get("/{repository_slug}/notes/{note_id}/index-status", response_model=NoteIndexStatusResponse)
def get_note_index_status(
    repository_slug: str,
    note_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> NoteIndexStatusResponse:
    repository, note = _get_repository_and_note(db, repository_slug, note_id)
    if repository.min_clearance_level > user.clearance_level or note.min_clearance_level > user.clearance_level:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Note access denied.")

    return NoteIndexStatusResponse(
        note_id=note.id,
        status=note.search_index_status or "indexed",
        error=note.search_index_error or None,
        indexed_at=note.search_indexed_at.isoformat() if note.search_indexed_at else None,
    )


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
    _ensure_can_delete_note(user, note)

    deleted_note_ids, object_keys = collect_note_cleanup_payload([note])
    db.delete(note)
    db.commit()

    cleanup_deleted_note_resources(deleted_note_ids, object_keys)
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

    if not _is_admin_user(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admin can delete folders.")

    all_folders = db.query(Folder).filter(Folder.repository_id == repository.id).all()
    descendant_ids = collect_descendant_folder_ids(folder.id, all_folders)

    notes_to_delete = (
        db.query(Note)
        .options(selectinload(Note.attachments))
        .filter(
            Note.repository_id == repository.id,
            Note.folder_id.in_(descendant_ids),
        )
        .all()
    )

    deleted_note_ids, object_keys = collect_note_cleanup_payload(notes_to_delete)
    for note in notes_to_delete:
        db.delete(note)

    db.delete(folder)
    db.commit()

    cleanup_deleted_note_resources(deleted_note_ids, object_keys)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{repository_slug}/notes/{note_id}/like", response_model=NoteLikeResponse)
def toggle_note_like(
    repository_slug: str,
    note_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> NoteLikeResponse:
    _, note = _get_repository_and_note(db, repository_slug, note_id)
    if note.min_clearance_level > user.clearance_level:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Note access denied.")

    existing = (
        db.query(NoteLike)
        .filter(NoteLike.note_id == note.id, NoteLike.user_id == user.id)
        .first()
    )
    if existing is None:
        db.add(NoteLike(note_id=note.id, user_id=user.id))
        liked_by_me = True
    else:
        db.delete(existing)
        liked_by_me = False
    db.commit()

    like_count = db.query(NoteLike).filter(NoteLike.note_id == note.id).count()
    return NoteLikeResponse(like_count=like_count, liked_by_me=liked_by_me)


@router.post("/{repository_slug}/notes/{note_id}/favorite", response_model=NoteFavoriteResponse)
def toggle_note_favorite(
    repository_slug: str,
    note_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> NoteFavoriteResponse:
    _, note = _get_repository_and_note(db, repository_slug, note_id)
    if note.min_clearance_level > user.clearance_level:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Note access denied.")

    existing = (
        db.query(NoteFavorite)
        .filter(NoteFavorite.note_id == note.id, NoteFavorite.user_id == user.id)
        .first()
    )
    if existing is None:
        db.add(NoteFavorite(note_id=note.id, user_id=user.id))
        favorited_by_me = True
    else:
        db.delete(existing)
        favorited_by_me = False
    db.commit()

    favorite_count = db.query(NoteFavorite).filter(NoteFavorite.note_id == note.id).count()
    return NoteFavoriteResponse(favorite_count=favorite_count, favorited_by_me=favorited_by_me)


@router.post(
    "/{repository_slug}/notes/{note_id}/comments",
    response_model=NoteCommentItem,
    status_code=status.HTTP_201_CREATED,
)
def create_note_comment(
    repository_slug: str,
    note_id: int,
    payload: NoteCommentCreateRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> NoteCommentItem:
    _, note = _get_repository_and_note(db, repository_slug, note_id)
    if note.min_clearance_level > user.clearance_level:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Note access denied.")

    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Comment cannot be empty.")

    comment = NoteComment(
        note_id=note.id,
        user_id=user.id,
        content=content,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    comment.user = user
    return _serialize_note_comment(comment, user)


@router.delete("/{repository_slug}/notes/{note_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note_comment(
    repository_slug: str,
    note_id: int,
    comment_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    _, note = _get_repository_and_note(db, repository_slug, note_id)
    if note.min_clearance_level > user.clearance_level:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Note access denied.")

    comment = (
        db.query(NoteComment)
        .options(selectinload(NoteComment.user))
        .filter(NoteComment.note_id == note.id, NoteComment.id == comment_id)
        .first()
    )
    if comment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found.")
    if not (_is_admin_user(user) or comment.user_id == user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Comment delete denied.")

    db.delete(comment)
    db.commit()
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
    _ensure_can_modify_note(user, note)

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

    enqueue_attachment_ingestion(db, note_id=note.id, attachment_id=attachment.id)

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
    background_tasks: BackgroundTasks,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    _, note = _get_repository_and_note(db, repository_slug, note_id)
    if note.min_clearance_level > user.clearance_level:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Note access denied.")
    _ensure_can_modify_note(user, note)

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
    enqueue_note_index(background_tasks, db, note.id)


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
    _ensure_can_modify_note(user, note)

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

    enqueue_attachment_ingestion(
        db,
        note_id=note.id,
        attachment_id=attachment.id,
        old_object_key=old_object_key,
    )
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


def _serialize_note_list_item(note: Note, user: User) -> NoteListItem:
    return NoteListItem(
        id=note.id,
        title=note.title,
        folder_id=note.folder_id,
        content_text=note.content_text or "",
        author_name=(note.author_name or "").strip() or "系统",
        author_user_id=note.author_user_id,
        clearance_level=note.min_clearance_level,
        created_at=note.created_at.isoformat(),
        updated_at=note.updated_at.isoformat(),
        editable_by_clearance=bool(note.editable_by_clearance),
        can_edit=_can_modify_note(user, note),
        attachment_count=len(note.attachments),
        can_delete=_can_delete_note(user, note),
        search_index_status=note.search_index_status or "indexed",
        search_index_error=note.search_index_error or None,
        search_indexed_at=note.search_indexed_at.isoformat() if note.search_indexed_at else None,
    )


def _serialize_attachments(attachments: list[Attachment]) -> list[AttachmentItem]:
    return [_serialize_attachment(attachment) for attachment in attachments]


def _serialize_note_detail(note: Note, user: User) -> NoteDetailResponse:
    return NoteDetailResponse(
        id=note.id,
        repository_id=note.repository_id,
        folder_id=note.folder_id,
        title=note.title,
        author_name=(note.author_name or "").strip() or "系统",
        author_user_id=note.author_user_id,
        content_markdown=note.content_markdown or "",
        content_json=note.content_json,
        content_text=note.content_text,
        clearance_level=note.min_clearance_level,
        updated_at=note.updated_at.isoformat(),
        editable_by_clearance=bool(note.editable_by_clearance),
        can_edit=_can_modify_note(user, note),
        can_change_edit_policy=_is_note_creator(user, note),
        can_delete=_can_delete_note(user, note),
        search_index_status=note.search_index_status or "indexed",
        search_index_error=note.search_index_error or None,
        search_indexed_at=note.search_indexed_at.isoformat() if note.search_indexed_at else None,
        like_count=len(note.likes),
        liked_by_me=any(like.user_id == user.id for like in note.likes),
        favorite_count=len(note.favorites),
        favorited_by_me=any(favorite.user_id == user.id for favorite in note.favorites),
        comments=[
            _serialize_note_comment(comment, user)
            for comment in sorted(note.comments, key=lambda item: (item.created_at, item.id))
        ],
        attachments=_serialize_attachments(note.attachments),
    )


def _serialize_note_comment(comment: NoteComment, user: User) -> NoteCommentItem:
    author_name = ""
    if comment.user is not None:
        author_name = (comment.user.full_name or comment.user.username or "").strip()
    return NoteCommentItem(
        id=comment.id,
        author_user_id=comment.user_id,
        author_name=author_name or "已删除用户",
        content=comment.content,
        created_at=comment.created_at.isoformat(),
        updated_at=comment.updated_at.isoformat(),
        can_delete=_is_admin_user(user) or comment.user_id == user.id,
    )


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


def _resolve_cover_media_type(object_key: str) -> str:
    suffix = Path(object_key).suffix.lower()
    if suffix == ".png":
        return "image/png"
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".webp":
        return "image/webp"
    return "application/octet-stream"


def _load_note_detail(db: Session, note_id: int) -> Note:
    note = (
        db.query(Note)
        .options(
            selectinload(Note.attachments),
            selectinload(Note.favorites),
            selectinload(Note.likes),
            selectinload(Note.comments).selectinload(NoteComment.user),
        )
        .filter(Note.id == note_id)
        .first()
    )
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found.")
    return note


def _is_admin_user(user: User) -> bool:
    return any(user_role.role.code == ADMIN_ROLE_CODE for user_role in user.roles)


def _can_delete_note(user: User, note: Note) -> bool:
    if _is_admin_user(user):
        return True
    if note.min_clearance_level > user.clearance_level:
        return False
    if note.author_user_id is not None:
        return note.author_user_id == user.id
    normalized_author = (note.author_name or "").strip()
    if not normalized_author:
        return False
    candidate_names = {
        value.strip()
        for value in (user.full_name, user.username)
        if value and value.strip()
    }
    return normalized_author in candidate_names


def _is_note_creator(user: User, note: Note) -> bool:
    if note.author_user_id is not None:
        return note.author_user_id == user.id
    normalized_author = (note.author_name or "").strip()
    if not normalized_author:
        return False
    candidate_names = {
        value.strip()
        for value in (user.full_name, user.username)
        if value and value.strip()
    }
    return normalized_author in candidate_names


def _can_modify_note(user: User, note: Note) -> bool:
    if _is_admin_user(user):
        return True
    if note.min_clearance_level > user.clearance_level:
        return False
    if _is_note_creator(user, note):
        return True
    return bool(note.editable_by_clearance)


def _ensure_can_delete_note(user: User, note: Note) -> None:
    if not _can_delete_note(user, note):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Note delete denied.")


def _ensure_can_modify_note(user: User, note: Note) -> None:
    if not _can_modify_note(user, note):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Note modify denied.")
