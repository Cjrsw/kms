from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.ai import QaAvailableModelsResponse
from app.schemas.qa import QaAskRequest, QaConversationDetail, QaConversationListResponse, QaResponseEnvelope
from app.services.qa import answer_question, stream_answer_question
from app.services.qa_history import delete_conversation, get_user_conversation, list_user_conversations, serialize_conversation_detail
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
        conversation_id=payload.conversation_id,
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
        conversation_id=payload.conversation_id,
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


@router.get("/conversations", response_model=QaConversationListResponse)
def qa_conversations(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> QaConversationListResponse:
    return list_user_conversations(db, user=user)


@router.get("/conversations/{conversation_id}", response_model=QaConversationDetail)
def qa_conversation_detail(
    conversation_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> QaConversationDetail:
    conversation = get_user_conversation(db, user=user, conversation_id=conversation_id)
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
    return serialize_conversation_detail(conversation)


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def qa_conversation_delete(
    conversation_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    conversation = get_user_conversation(db, user=user, conversation_id=conversation_id)
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
    delete_conversation(db, conversation=conversation)
