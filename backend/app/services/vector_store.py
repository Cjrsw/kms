from __future__ import annotations

import uuid
from typing import Any

import httpx

from app.core.config import get_settings

settings = get_settings()


def upsert_chunk_vectors(
    *,
    vectors: list[list[float]],
    payloads: list[dict[str, Any]],
    point_ids: list[str] | None = None,
) -> list[str]:
    if not vectors or not payloads or len(vectors) != len(payloads):
        return []

    collection = settings.qdrant_collection
    ids = point_ids[:] if point_ids else [uuid.uuid4().hex for _ in vectors]
    _ensure_collection(vector_size=len(vectors[0]))
    points = [
        {
            "id": ids[index],
            "vector": vectors[index],
            "payload": payloads[index],
        }
        for index in range(len(vectors))
    ]
    _request("PUT", f"/collections/{collection}/points?wait=true", json={"points": points})
    return ids


def delete_points_by_note_id(note_id: int) -> None:
    collection = settings.qdrant_collection
    body = {
        "filter": {
            "must": [{"key": "note_id", "match": {"value": note_id}}],
        }
    }
    _request("POST", f"/collections/{collection}/points/delete?wait=true", json=body, swallow_errors=True)


def search_similar_chunks(
    *,
    vector: list[float],
    max_clearance_level: int,
    repository_slug: str | None,
    limit: int,
) -> list[dict[str, Any]]:
    if not vector or limit <= 0:
        return []
    collection = settings.qdrant_collection
    filters: list[dict[str, Any]] = [{"key": "clearance_level", "range": {"lte": max_clearance_level}}]
    if repository_slug:
        filters.append({"key": "repository_slug", "match": {"value": repository_slug}})
    body = {
        "vector": vector,
        "limit": limit,
        "with_payload": True,
        "score_threshold": 0.12,
        "filter": {"must": filters},
    }
    response = _request("POST", f"/collections/{collection}/points/search", json=body, swallow_errors=True)
    if not response:
        return []
    return response.get("result") or []


def _ensure_collection(vector_size: int) -> None:
    collection = settings.qdrant_collection
    response = _request("GET", f"/collections/{collection}", swallow_errors=True)
    if response and response.get("result"):
        return
    create_body = {
        "vectors": {
            "size": vector_size,
            "distance": "Cosine",
        }
    }
    _request("PUT", f"/collections/{collection}", json=create_body)


def _request(
    method: str,
    path: str,
    *,
    json: dict[str, Any] | None = None,
    swallow_errors: bool = False,
) -> dict[str, Any] | None:
    base = settings.qdrant_url.rstrip("/")
    timeout = settings.qdrant_timeout_seconds
    try:
        with httpx.Client(timeout=timeout) as client:
            response = client.request(method, f"{base}{path}", json=json)
        if response.status_code >= 400:
            if swallow_errors:
                return None
            response.raise_for_status()
        return response.json()
    except Exception:
        if swallow_errors:
            return None
        raise
