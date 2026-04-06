from __future__ import annotations

from threading import Lock

_lock = Lock()
_allowed_origins: set[str] = set()


def _normalize(origin: str) -> str:
    return origin.strip().rstrip("/")


def set_allowed_origins(origins: list[str]) -> None:
    normalized = {_normalize(origin) for origin in origins if origin.strip()}
    with _lock:
        _allowed_origins.clear()
        _allowed_origins.update(normalized)


def get_allowed_origins() -> list[str]:
    with _lock:
        return sorted(_allowed_origins)


def is_origin_allowed(origin: str) -> bool:
    with _lock:
        return _normalize(origin) in _allowed_origins
