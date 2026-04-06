from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from sqlalchemy.engine import Engine

from app.core.config import get_settings


def _build_alembic_config() -> Config:
    root = Path(__file__).resolve().parents[2]  # backend/
    config = Config(str(root / "alembic.ini"))
    settings = get_settings()
    config.set_main_option("sqlalchemy.url", settings.sqlalchemy_database_uri)
    config.set_main_option("script_location", str(root / "alembic"))
    return config


def run_database_migrations(engine: Engine) -> None:
    config = _build_alembic_config()
    inspector = inspect(engine)
    has_version_table = inspector.has_table("alembic_version")
    # If the database already has tables (from earlier create_all) but no alembic version,
    # stamp to head to avoid recreate conflicts; otherwise upgrade normally.
    if has_version_table:
        command.upgrade(config, "head")
        return

    existing_tables = inspector.get_table_names()
    if existing_tables:
        command.stamp(config, "head")
    else:
        command.upgrade(config, "head")
