from __future__ import annotations

from pathlib import Path
from uuid import uuid4
from io import BytesIO

from minio import Minio
from minio.error import S3Error

from app.core.config import get_settings

settings = get_settings()


def get_minio_client() -> Minio:
    return Minio(
        endpoint=settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )


def ensure_bucket_exists() -> None:
    client = get_minio_client()
    if not client.bucket_exists(settings.minio_bucket):
        client.make_bucket(settings.minio_bucket)


def build_attachment_object_key(note_id: int, file_name: str) -> str:
    suffix = Path(file_name).suffix.lower()
    return f"notes/{note_id}/{uuid4().hex}{suffix}"


def upload_attachment_bytes(
    *,
    object_key: str,
    data: bytes,
    content_type: str,
) -> None:
    client = get_minio_client()

    client.put_object(
        bucket_name=settings.minio_bucket,
        object_name=object_key,
        data=BytesIO(data),
        length=len(data),
        content_type=content_type,
    )


def get_object_bytes(object_key: str) -> bytes | None:
    client = get_minio_client()
    response = None
    try:
        response = client.get_object(settings.minio_bucket, object_key)
        return response.read()
    except S3Error:
        return None
    finally:
        if response is not None:
            response.close()
            response.release_conn()


def get_download_url(object_key: str) -> str | None:
    client = get_minio_client()
    try:
        client.stat_object(settings.minio_bucket, object_key)
    except S3Error:
        return None

    return client.presigned_get_object(settings.minio_bucket, object_key)


def get_preview_url(object_key: str) -> str | None:
    client = get_minio_client()
    try:
        client.stat_object(settings.minio_bucket, object_key)
    except S3Error:
        return None

    return client.presigned_get_object(
        settings.minio_bucket,
        object_key,
        response_headers={"response-content-disposition": "inline"},
    )


def remove_object(object_key: str) -> None:
    client = get_minio_client()
    try:
        client.remove_object(settings.minio_bucket, object_key)
    except S3Error:
        return
