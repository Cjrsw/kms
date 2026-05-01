from __future__ import annotations

from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.content import IngestionJob, Note, Repository
from app.models.user import User
from app.schemas.admin import (
    HomeActivityItem,
    HomeAnnouncementResponse,
    HomeCarouselResponse,
    HomeCarouselSlideItem,
    HomeDashboardResponse,
    HomeNoteItem,
)
from app.services.storage import get_object_bytes
from app.services.system_settings import get_home_announcement_setting, get_home_carousel_slides_setting

router = APIRouter()


@router.get("/carousel", response_model=HomeCarouselResponse)
def get_home_carousel(
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> HomeCarouselResponse:
    slides, updated_at = get_home_carousel_slides_setting(db)
    return HomeCarouselResponse(
        slides=[_serialize_home_slide(slide) for slide in slides],
        updated_at=updated_at.isoformat() if updated_at else None,
    )


@router.get("/dashboard", response_model=HomeDashboardResponse)
def get_home_dashboard(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> HomeDashboardResponse:
    announcement, announcement_updated_at = get_home_announcement_setting(db)
    return HomeDashboardResponse(
        latest_notes=_load_latest_notes(db, user),
        announcement=HomeAnnouncementResponse(
            title=announcement["title"],
            content=announcement["content"],
            updated_at=announcement_updated_at.isoformat() if announcement_updated_at else None,
        ),
        activities=_load_home_activities(db, user),
    )


@router.get("/carousel/{slide_index}/image")
def get_home_carousel_image(
    slide_index: int,
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    slides, _ = get_home_carousel_slides_setting(db)
    slide = next((item for item in slides if int(item["index"]) == slide_index), None)
    if slide is None or not slide.get("image_object_key"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Home carousel image not found.")

    object_key = str(slide["image_object_key"])
    object_bytes = get_object_bytes(object_key)
    if object_bytes is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Home carousel image not found in storage.")

    return Response(
        content=object_bytes,
        media_type=_resolve_image_media_type(object_key),
        headers={"Cache-Control": "private, max-age=300"},
    )


def _load_latest_notes(db: Session, user: User) -> list[HomeNoteItem]:
    rows = (
        db.query(Note, Repository)
        .join(Repository, Repository.id == Note.repository_id)
        .filter(Repository.min_clearance_level <= user.clearance_level)
        .filter(Note.min_clearance_level <= user.clearance_level)
        .order_by(Note.updated_at.desc(), Note.id.desc())
        .limit(6)
        .all()
    )
    return [_serialize_home_note(note, repository) for note, repository in rows]


def _load_home_activities(db: Session, user: User) -> list[HomeActivityItem]:
    note_rows = (
        db.query(Note, Repository)
        .join(Repository, Repository.id == Note.repository_id)
        .filter(Repository.min_clearance_level <= user.clearance_level)
        .filter(Note.min_clearance_level <= user.clearance_level)
        .filter(Note.search_index_status.in_(["pending", "indexing", "failed"]))
        .order_by(Note.updated_at.desc(), Note.id.desc())
        .limit(8)
        .all()
    )
    activities: list[HomeActivityItem] = []
    for note, repository in note_rows:
        status_text = note.search_index_status or "pending"
        if status_text == "failed":
            message = note.search_index_error or "索引失败，请检查后台日志。"
        elif status_text == "indexing":
            message = "正在写入全文索引与向量索引。"
        else:
            message = "已进入索引队列，等待后台任务处理。"
        activities.append(
            _serialize_activity(
                id_value=f"index:{note.id}",
                kind="index",
                status=status_text,
                repository=repository,
                note=note,
                message=message,
                updated_at=note.updated_at.isoformat(),
            )
        )

    ingestion_rows = (
        db.query(IngestionJob, Note, Repository)
        .join(Note, Note.id == IngestionJob.note_id)
        .join(Repository, Repository.id == Note.repository_id)
        .filter(Repository.min_clearance_level <= user.clearance_level)
        .filter(Note.min_clearance_level <= user.clearance_level)
        .filter(IngestionJob.status == "failed")
        .order_by(IngestionJob.updated_at.desc(), IngestionJob.id.desc())
        .limit(8)
        .all()
    )
    for job, note, repository in ingestion_rows:
        activities.append(
            _serialize_activity(
                id_value=f"attachment:{job.id}",
                kind="attachment",
                status="failed",
                repository=repository,
                note=note,
                message=job.error_message or "附件文本解析失败。",
                updated_at=job.updated_at.isoformat(),
            )
        )

    activities.sort(key=lambda item: item.updated_at, reverse=True)
    return activities[:8]


def _serialize_home_note(note: Note, repository: Repository) -> HomeNoteItem:
    return HomeNoteItem(
        id=note.id,
        repository_slug=repository.slug,
        repository_name=repository.name,
        title=note.title,
        snippet=_build_snippet(note.content_text),
        author_name=note.author_name,
        updated_at=note.updated_at.isoformat(),
        href=f"/repositories/{repository.slug}/notes/{note.id}",
    )


def _serialize_activity(
    *,
    id_value: str,
    kind: str,
    status: str,
    repository: Repository,
    note: Note,
    message: str,
    updated_at: str,
) -> HomeActivityItem:
    return HomeActivityItem(
        id=id_value,
        kind=kind,
        status=status,
        repository_slug=repository.slug,
        repository_name=repository.name,
        note_id=note.id,
        note_title=note.title,
        message=message[:180],
        updated_at=updated_at,
        href=f"/repositories/{repository.slug}/notes/{note.id}",
    )


def _build_snippet(value: str) -> str:
    normalized = " ".join(value.split())
    if len(normalized) <= 72:
        return normalized
    return f"{normalized[:69]}..."


def _serialize_home_slide(slide: dict[str, object]) -> HomeCarouselSlideItem:
    index = int(slide["index"])
    has_upload = bool(str(slide.get("image_object_key") or "").strip())
    return HomeCarouselSlideItem(
        index=index,
        title=str(slide.get("title") or ""),
        subtitle=str(slide.get("subtitle") or ""),
        image_url=f"/api/home/carousel/{index}/image" if has_upload else None,
        has_image_upload=has_upload,
    )


def _resolve_image_media_type(object_key: str) -> str:
    suffix = Path(object_key).suffix.lower()
    if suffix == ".png":
        return "image/png"
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".webp":
        return "image/webp"
    return "application/octet-stream"
