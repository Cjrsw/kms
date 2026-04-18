from __future__ import annotations

import os
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI, HTTPException
from huggingface_hub import snapshot_download
from pydantic import BaseModel, Field

try:
    from sentence_transformers import SentenceTransformer
except Exception as exc:  # pragma: no cover
    raise RuntimeError("Failed to import sentence-transformers") from exc


@dataclass
class EmbeddingRuntimeConfig:
    model_name: str
    local_model_dir: str
    cache_dir: str
    device: str
    use_fp16: bool
    batch_size: int
    max_length: int


class EmbeddingRequest(BaseModel):
    model: str | None = None
    input: str | list[str] = Field(min_length=1)


class EmbeddingDataItem(BaseModel):
    object: str = "embedding"
    embedding: list[float]
    index: int


class EmbeddingResponse(BaseModel):
    object: str = "list"
    data: list[EmbeddingDataItem]
    model: str
    usage: dict[str, int]


app = FastAPI(title="KMS Embedding Service", version="1.0.0")

MODEL: SentenceTransformer | None = None
CONFIG: EmbeddingRuntimeConfig | None = None
MODEL_REF = ""
MODEL_LOAD_LOCK = threading.Lock()
MODEL_LOADING = False
MODEL_LOAD_ERROR = ""
IGNORE_DOWNLOAD_PATTERNS = ["*.DS_Store", "**/.DS_Store"]


def _load_config() -> EmbeddingRuntimeConfig:
    return EmbeddingRuntimeConfig(
        model_name=os.getenv("EMBEDDING_MODEL_NAME", "BAAI/bge-m3").strip() or "BAAI/bge-m3",
        local_model_dir=os.getenv("EMBEDDING_LOCAL_MODEL_DIR", "").strip(),
        cache_dir=(
            os.getenv("EMBEDDING_CACHE_DIR", "").strip()
            or os.getenv("HUGGINGFACE_HUB_CACHE", "").strip()
        ),
        device=os.getenv("EMBEDDING_DEVICE", "cuda").strip() or "cuda",
        use_fp16=os.getenv("EMBEDDING_USE_FP16", "true").strip().lower() in {"1", "true", "yes", "on"},
        batch_size=max(int(os.getenv("EMBEDDING_BATCH_SIZE", "8")), 1),
        max_length=max(int(os.getenv("EMBEDDING_MAX_LENGTH", "2048")), 128),
    )


def _model_encode(texts: list[str]) -> list[list[float]]:
    _ensure_model_loaded()
    if MODEL is None or CONFIG is None:
        detail = MODEL_LOAD_ERROR or "Embedding model is not loaded."
        raise HTTPException(status_code=503, detail=detail)
    dense: Any = MODEL.encode(
        texts,
        batch_size=CONFIG.batch_size,
        normalize_embeddings=True,
        convert_to_numpy=True,
        show_progress_bar=False,
    )
    if isinstance(dense, np.ndarray):
        dense = dense.tolist()
    if not isinstance(dense, list):
        raise HTTPException(status_code=502, detail="Unexpected embedding output format.")
    vectors: list[list[float]] = []
    for item in dense:
        if isinstance(item, np.ndarray):
            vectors.append(item.astype(np.float32).tolist())
            continue
        if isinstance(item, list):
            vectors.append([float(v) for v in item])
            continue
        raise HTTPException(status_code=502, detail="Unexpected embedding vector shape.")
    return vectors


@app.on_event("startup")
def startup_event() -> None:
    global CONFIG
    CONFIG = _load_config()


def _ensure_model_loaded() -> None:
    global MODEL, CONFIG, MODEL_LOADING, MODEL_LOAD_ERROR, MODEL_REF
    if MODEL is not None:
        return
    if CONFIG is None:
        CONFIG = _load_config()

    with MODEL_LOAD_LOCK:
        if MODEL is not None:
            return
        MODEL_LOADING = True
        MODEL_LOAD_ERROR = ""
        try:
            MODEL_REF = _resolve_model_reference(CONFIG)
            MODEL = SentenceTransformer(
                MODEL_REF,
                device=CONFIG.device,
                trust_remote_code=True,
            )
            return
        except Exception as primary_error:
            # Fallback to CPU for environments where GPU runtime is unavailable.
            try:
                MODEL = SentenceTransformer(
                    MODEL_REF or _resolve_model_reference(CONFIG),
                    device="cpu",
                    trust_remote_code=True,
                )
                CONFIG = EmbeddingRuntimeConfig(
                    model_name=CONFIG.model_name,
                    local_model_dir=CONFIG.local_model_dir,
                    cache_dir=CONFIG.cache_dir,
                    device="cpu",
                    use_fp16=False,
                    batch_size=CONFIG.batch_size,
                    max_length=CONFIG.max_length,
                )
                return
            except Exception as cpu_error:
                MODEL = None
                MODEL_LOAD_ERROR = f"Failed to load embedding model: {primary_error}; cpu fallback: {cpu_error}"
                raise
        finally:
            MODEL_LOADING = False


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": MODEL is not None,
        "loading": MODEL_LOADING,
        "load_error": MODEL_LOAD_ERROR,
        "model": CONFIG.model_name if CONFIG else "",
        "device": CONFIG.device if CONFIG else "",
        "model_ref": MODEL_REF,
    }


@app.post("/v1/embeddings", response_model=EmbeddingResponse)
def create_embeddings(payload: EmbeddingRequest) -> EmbeddingResponse:
    model_name = (payload.model or (CONFIG.model_name if CONFIG else "")).strip()
    if not model_name:
        raise HTTPException(status_code=400, detail="model is required")

    if isinstance(payload.input, str):
        texts = [payload.input]
    else:
        texts = [str(item) for item in payload.input if str(item).strip()]
    if not texts:
        raise HTTPException(status_code=400, detail="input is required")

    vectors = _model_encode(texts)
    data = [
        EmbeddingDataItem(embedding=vector, index=index)
        for index, vector in enumerate(vectors)
    ]
    total_chars = sum(len(text) for text in texts)
    return EmbeddingResponse(
        data=data,
        model=model_name,
        usage={"prompt_tokens": total_chars, "total_tokens": total_chars},
    )


def _resolve_model_reference(config: EmbeddingRuntimeConfig) -> str:
    if config.local_model_dir:
        local_dir = Path(config.local_model_dir)
        if local_dir.exists():
            return str(local_dir)

    model_path = Path(config.model_name)
    if model_path.exists():
        return str(model_path)

    return _download_model_snapshot(repo_id=config.model_name, cache_dir=config.cache_dir)


def _download_model_snapshot(*, repo_id: str, cache_dir: str) -> str:
    # First try local cache only to avoid unnecessary network calls.
    try:
        return snapshot_download(
            repo_id=repo_id,
            cache_dir=cache_dir or None,
            local_files_only=True,
            ignore_patterns=IGNORE_DOWNLOAD_PATTERNS,
        )
    except Exception:
        pass

    original_endpoint = os.getenv("HF_ENDPOINT")
    endpoints = _candidate_hf_endpoints(original_endpoint)
    errors: list[str] = []

    for endpoint in endpoints:
        try:
            if endpoint:
                os.environ["HF_ENDPOINT"] = endpoint
            else:
                os.environ.pop("HF_ENDPOINT", None)
            return snapshot_download(
                repo_id=repo_id,
                cache_dir=cache_dir or None,
                local_files_only=False,
                ignore_patterns=IGNORE_DOWNLOAD_PATTERNS,
            )
        except Exception as exc:
            endpoint_label = endpoint or "<default>"
            errors.append(f"{endpoint_label}: {exc}")

    if original_endpoint is not None:
        os.environ["HF_ENDPOINT"] = original_endpoint
    else:
        os.environ.pop("HF_ENDPOINT", None)

    raise RuntimeError("; ".join(errors))


def _candidate_hf_endpoints(current: str | None) -> list[str | None]:
    candidates: list[str | None] = []
    normalized_current = (current or "").strip()
    if normalized_current:
        candidates.append(normalized_current)
    candidates.extend(["https://huggingface.co", "https://hf-mirror.com", None])
    deduped: list[str | None] = []
    for item in candidates:
        if item not in deduped:
            deduped.append(item)
    return deduped
