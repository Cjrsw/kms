import json
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session, selectinload

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
from app.services.search import index_note
from app.services.ingestion import extract_attachment_text, upsert_attachment_text
from app.services.storage import (
    build_attachment_object_key,
    get_download_url,
    get_preview_url,
    remove_object,
    upload_attachment_bytes,
)

router = APIRouter()
ALLOWED_ATTACHMENT_TYPES = {"pdf", "docx"}
MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024


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

    if payload.folder_id is not None:
        folder = db.query(Folder).filter(Folder.id == payload.folder_id).first()
        if folder is None or folder.repository_id != repository.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Folder is outside repository.")

    desired_level = payload.min_clearance_level or repository.min_clearance_level
    desired_level = max(desired_level, repository.min_clearance_level)
    if desired_level > user.clearance_level:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Clearance insufficient for this note.")

    content_text = (payload.content_text or "").strip()
    content_json = (
        payload.content_json.strip()
        if payload.content_json
        else json.dumps(
            {
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [{"type": "text", "text": content_text}],
                    }
                ],
            },
            ensure_ascii=False,
        )
    )

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
) -> RedirectResponse:
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

    download_url = get_download_url(attachment.object_key)
    if download_url is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment object not found in storage.")

    return RedirectResponse(url=download_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)


@router.get("/{repository_slug}/notes/{note_id}/attachments/{attachment_id}/preview")
def preview_attachment(
    repository_slug: str,
    note_id: int,
    attachment_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> RedirectResponse:
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

    preview_url = get_preview_url(attachment.object_key)
    if preview_url is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment object not found in storage.")

    return RedirectResponse(url=preview_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)


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
