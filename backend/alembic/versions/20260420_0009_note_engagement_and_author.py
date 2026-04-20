"""add note author user and engagement tables

Revision ID: 20260420_0009
Revises: 20260419_0008
Create Date: 2026-04-20 19:30:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260420_0009"
down_revision = "20260419_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    note_columns = {column["name"] for column in inspector.get_columns("notes")}
    if "author_user_id" not in note_columns:
        op.add_column("notes", sa.Column("author_user_id", sa.Integer(), nullable=True))
    note_foreign_keys = {tuple(fk.get("constrained_columns") or []) for fk in inspector.get_foreign_keys("notes")}
    if ("author_user_id",) not in note_foreign_keys:
        op.create_foreign_key(
            "fk_notes_author_user_id_users",
            "notes",
            "users",
            ["author_user_id"],
            ["id"],
            ondelete="SET NULL",
        )
    note_indexes = {index["name"] for index in inspector.get_indexes("notes")}
    if "ix_notes_author_user_id" not in note_indexes:
        op.create_index("ix_notes_author_user_id", "notes", ["author_user_id"], unique=False)

    if "note_likes" not in tables:
        op.create_table(
            "note_likes",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("note_id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["note_id"], ["notes.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("note_id", "user_id", name="uq_note_like_note_user"),
        )
        op.create_index("ix_note_likes_note_id", "note_likes", ["note_id"], unique=False)
        op.create_index("ix_note_likes_user_id", "note_likes", ["user_id"], unique=False)

    if "note_comments" not in tables:
        op.create_table(
            "note_comments",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("note_id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["note_id"], ["notes.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_note_comments_note_id", "note_comments", ["note_id"], unique=False)
        op.create_index("ix_note_comments_user_id", "note_comments", ["user_id"], unique=False)

    _backfill_note_author_user_id(bind)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "note_comments" in tables:
        note_comment_indexes = {index["name"] for index in inspector.get_indexes("note_comments")}
        if "ix_note_comments_user_id" in note_comment_indexes:
            op.drop_index("ix_note_comments_user_id", table_name="note_comments")
        if "ix_note_comments_note_id" in note_comment_indexes:
            op.drop_index("ix_note_comments_note_id", table_name="note_comments")
        op.drop_table("note_comments")

    if "note_likes" in tables:
        note_like_indexes = {index["name"] for index in inspector.get_indexes("note_likes")}
        if "ix_note_likes_user_id" in note_like_indexes:
            op.drop_index("ix_note_likes_user_id", table_name="note_likes")
        if "ix_note_likes_note_id" in note_like_indexes:
            op.drop_index("ix_note_likes_note_id", table_name="note_likes")
        op.drop_table("note_likes")

    note_columns = {column["name"] for column in inspector.get_columns("notes")}
    note_indexes = {index["name"] for index in inspector.get_indexes("notes")}
    if "ix_notes_author_user_id" in note_indexes:
        op.drop_index("ix_notes_author_user_id", table_name="notes")
    if "author_user_id" in note_columns:
        note_foreign_keys = inspector.get_foreign_keys("notes")
        if any(tuple(fk.get("constrained_columns") or []) == ("author_user_id",) for fk in note_foreign_keys):
            op.drop_constraint("fk_notes_author_user_id_users", "notes", type_="foreignkey")
        op.drop_column("notes", "author_user_id")


def _backfill_note_author_user_id(bind: sa.engine.Connection) -> None:
    notes = sa.table(
        "notes",
        sa.column("id", sa.Integer()),
        sa.column("author_name", sa.String()),
        sa.column("author_user_id", sa.Integer()),
    )
    users = sa.table(
        "users",
        sa.column("id", sa.Integer()),
        sa.column("username", sa.String()),
        sa.column("full_name", sa.String()),
    )

    rows = bind.execute(
        sa.select(notes.c.id, notes.c.author_name).where(
            notes.c.author_user_id.is_(None),
            notes.c.author_name.is_not(None),
        )
    ).all()

    for note_id, author_name in rows:
        normalized_author = (author_name or "").strip()
        if not normalized_author:
            continue
        user_id = bind.execute(
            sa.select(users.c.id)
            .where(
                sa.or_(
                    users.c.full_name == normalized_author,
                    users.c.username == normalized_author,
                )
            )
            .limit(1)
        ).scalar()
        if user_id is None:
            continue
        bind.execute(
            sa.update(notes)
            .where(notes.c.id == note_id)
            .values(author_user_id=int(user_id))
        )
