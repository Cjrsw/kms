from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.qa import QaAnswerResponse
from app.services.qa import answer_question

router = APIRouter()


@router.get("", response_model=QaAnswerResponse)
def qa(
    q: Annotated[str, Query(min_length=1, description="Question for the knowledge assistant")],
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    repository_slug: Annotated[str | None, Query()] = None,
) -> QaAnswerResponse:
    return answer_question(db=db, user=user, question=q, repository_slug=repository_slug)
