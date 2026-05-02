from datetime import date, datetime, time
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.search import SearchAuthorSuggestResponse, SearchResponse, SearchSuggestResponse
from app.services.search import search_notes, suggest_author_names, suggest_search_queries

router = APIRouter()


@router.get("", response_model=SearchResponse)
def search(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    q: Annotated[str | None, Query(description="Search query")] = None,
    repository_slug: Annotated[str | None, Query()] = None,
    author: Annotated[str | None, Query(max_length=80)] = None,
    file_type: Annotated[str, Query(pattern="^(all|note|pdf|docx|md|txt)$")] = "all",
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
    sort_by: Annotated[str, Query(pattern="^(relevance|updated_desc|updated_asc)$")] = "relevance",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 10,
) -> SearchResponse:
    normalized_repository_slug = (repository_slug or "").strip() or None
    normalized_author = (author or "").strip() or None
    updated_from = datetime.combine(date_from, time.min) if date_from else None
    updated_to = datetime.combine(date_to, time.max) if date_to else None
    return search_notes(
        db=db,
        user=user,
        query=q or "",
        repository_slug=normalized_repository_slug,
        author_keyword=normalized_author,
        file_type=file_type.lower(),
        updated_from=updated_from,
        updated_to=updated_to,
        sort_by=sort_by,
        page=page,
        page_size=page_size,
    )


@router.get("/suggest", response_model=SearchSuggestResponse)
def suggest(
    q: Annotated[str, Query(min_length=1, description="Suggestion query")],
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    repository_slug: Annotated[str | None, Query()] = None,
) -> SearchSuggestResponse:
    suggestions = suggest_search_queries(db=db, user=user, query=q, repository_slug=repository_slug, limit=8)
    return SearchSuggestResponse(suggestions=suggestions)


@router.get("/authors", response_model=SearchAuthorSuggestResponse)
def suggest_authors(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    q: Annotated[str | None, Query(max_length=80)] = None,
    repository_slug: Annotated[str | None, Query()] = None,
) -> SearchAuthorSuggestResponse:
    suggestions = suggest_author_names(
        db=db,
        user=user,
        keyword=q,
        repository_slug=(repository_slug or "").strip() or None,
        limit=20,
    )
    return SearchAuthorSuggestResponse(suggestions=suggestions)
