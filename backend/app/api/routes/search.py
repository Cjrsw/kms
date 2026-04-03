from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.search import SearchResultItem
from app.services.search import search_notes

router = APIRouter()


@router.get("", response_model=list[SearchResultItem])
def search(
    q: Annotated[str, Query(min_length=1, description="Search query")],
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    repository_slug: Annotated[str | None, Query()] = None,
) -> list[SearchResultItem]:
    return search_notes(db=db, user=user, query=q, repository_slug=repository_slug)
