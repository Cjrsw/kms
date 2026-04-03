from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import app.models  # noqa: F401
from app.api.router import api_router
from app.core.config import get_settings
from app.db.base import Base
from app.db.init_db import seed_database
from app.db.session import SessionLocal, engine
from app.services.search import sync_all_notes
from app.services.storage import ensure_bucket_exists

settings = get_settings()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()
    try:
        ensure_bucket_exists()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Unable to ensure MinIO bucket exists during startup: %s", exc)
    db = SessionLocal()
    try:
        sync_all_notes(db)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Unable to sync notes into Elasticsearch during startup: %s", exc)
    finally:
        db.close()
    yield


app = FastAPI(title=settings.app_name, debug=settings.app_debug, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "KMS API is running."}
