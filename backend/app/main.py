from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI

from app.api.router import api_router
from app.core.cors_state import set_allowed_origins
from app.core.config import get_settings
from app.db.migrations import run_database_migrations
from app.db.init_db import seed_database
from app.db.session import SessionLocal, engine
from app.middleware.dynamic_cors import DynamicCORSMiddleware
from app.services.search import sync_all_notes
from app.services.storage import ensure_bucket_exists
from app.services.system_settings import get_cors_origins_setting

settings = get_settings()
logger = logging.getLogger(__name__)
DEFAULT_LOCAL_CORS_ORIGINS = {"http://localhost:3000", "http://127.0.0.1:3000"}


@asynccontextmanager
async def lifespan(_: FastAPI):
    app_env = settings.app_env.lower()
    if app_env in {"production", "prod"} and settings.secret_key == "change-me":
        raise RuntimeError("SECRET_KEY cannot use default value in production.")

    active_origins = settings.cors_allow_origins_list
    set_allowed_origins(active_origins)
    run_database_migrations(engine)
    db = SessionLocal()
    try:
        seed_database(db)
        persisted_origins = get_cors_origins_setting(db)
        if persisted_origins:
            active_origins = persisted_origins
            set_allowed_origins(active_origins)
    finally:
        db.close()
    if app_env in {"production", "prod"}:
        normalized = {origin.rstrip("/") for origin in active_origins}
        if normalized == DEFAULT_LOCAL_CORS_ORIGINS:
            raise RuntimeError("CORS_ALLOW_ORIGINS cannot stay on local defaults in production.")
        if not normalized:
            raise RuntimeError("CORS allowlist cannot be empty in production.")
    try:
        ensure_bucket_exists()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Unable to ensure MinIO bucket exists during startup: %s", exc)
    db = SessionLocal()
    try:
        sync_all_notes(db)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Unable to sync notes into search/vector stores during startup: %s", exc)
    finally:
        db.close()
    yield


app = FastAPI(title=settings.app_name, debug=settings.app_debug, lifespan=lifespan)

app.add_middleware(DynamicCORSMiddleware)

app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "KMS API is running."}
