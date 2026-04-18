from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.ai import QaAvailableModelsResponse
from app.schemas.qa import QaAskRequest, QaResponseEnvelope
from app.services.qa import answer_question, stream_answer_question
from app.services.runtime_llm import get_chat_model_name

router = APIRouter()


@router.get("/models", response_model=QaAvailableModelsResponse)
def qa_models(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> QaAvailableModelsResponse:
    _ = user
    _ = db
    return QaAvailableModelsResponse(
        models=[
            {
                "id": 0,
                "name": "fixed-chat-model",
                "model_name": get_chat_model_name(),
                "provider": "openai_compatible",
            }
        ],
        user_default_model_id=None,
        system_default_model_id=None,
    )


@router.post("", response_model=QaResponseEnvelope)
def qa_post(
    payload: QaAskRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> QaResponseEnvelope:
    return answer_question(
        db=db,
        user=user,
        question=payload.question,
        repository_slug=(payload.repository_slug or "").strip() or None,
        model_id=payload.model_id,
    )


@router.post("/stream")
async def qa_stream(
    payload: QaAskRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> StreamingResponse:
    generator = stream_answer_question(
        db=db,
        user=user,
        question=payload.question,
        repository_slug=(payload.repository_slug or "").strip() or None,
        model_id=payload.model_id,
    )
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("", response_model=QaResponseEnvelope, deprecated=True)
def qa_get_compat(
    response: Response,
    q: Annotated[str, Query(min_length=1, description="Question for the knowledge assistant")],
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    repository_slug: Annotated[str | None, Query()] = None,
    model_id: Annotated[int | None, Query()] = None,
) -> QaResponseEnvelope:
    response.headers["X-API-Deprecated"] = "Use POST /api/v1/qa instead of GET /api/v1/qa"
    return answer_question(
        db=db,
        user=user,
        question=q,
        repository_slug=(repository_slug or "").strip() or None,
        model_id=model_id,
    )
