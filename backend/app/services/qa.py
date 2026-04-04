from __future__ import annotations

import html
import re

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.user import User
from app.schemas.qa import QaAnswerResponse, QaSourceItem
from app.services.gemini import generate_grounded_answer
from app.services.search import search_notes

TAG_RE = re.compile(r"<[^>]+>")
SPACE_RE = re.compile(r"\s+")


def answer_question(
    db: Session,
    user: User,
    question: str,
    repository_slug: str | None = None,
) -> QaAnswerResponse:
    normalized_question = question.strip()
    if not normalized_question:
        return QaAnswerResponse(
            question="",
            answer="请输入问题后再发起问答。",
            source_count=0,
            sources=[],
            mode="empty",
            model=None,
        )

    search_results = search_notes(db=db, user=user, query=normalized_question, repository_slug=repository_slug)
    top_results = search_results[:3]
    sources = [
        QaSourceItem(
            note_id=result.note_id,
            repository_slug=result.repository_slug,
            repository_name=result.repository_name,
            title=result.title,
            snippet=result.snippet,
            clearance_level=result.clearance_level,
            attachment_count=result.attachment_count,
            updated_at=result.updated_at,
        )
        for result in top_results
    ]

    if not sources:
        scope_text = "当前仓库范围内" if repository_slug else "当前权限可见的知识库中"
        return QaAnswerResponse(
            question=normalized_question,
            answer=(
                f"我没有在{scope_text}检索到可直接支持这个问题的内容。"
                "你可以换一个更具体的关键词，或缩小到某个知识仓库后再试。"
            ),
            source_count=0,
            sources=[],
            mode="no_results",
            model=None,
        )

    llm_answer = generate_grounded_answer(
        question=normalized_question,
        repository_slug=repository_slug,
        sources=sources,
    )
    if llm_answer:
        return QaAnswerResponse(
            question=normalized_question,
            answer=llm_answer,
            source_count=len(sources),
            sources=sources,
            mode="llm",
            model=get_settings().gemini_model,
        )

    return QaAnswerResponse(
        question=normalized_question,
        answer=_build_fallback_answer(sources=sources),
        source_count=len(sources),
        sources=sources,
        mode="fallback",
        model=None,
    )


def _build_fallback_answer(*, sources: list[QaSourceItem]) -> str:
    summary_lines = [
        f"以下回答基于你当前权限可见的 {len(sources)} 条知识整理，不包含更高密级内容。",
    ]
    for index, source in enumerate(sources, start=1):
        cleaned_snippet = _clean_snippet(source.snippet)
        if cleaned_snippet:
            summary_lines.append(f"{index}. {source.title}：{cleaned_snippet}")
        else:
            summary_lines.append(f"{index}. {source.title}：该结果命中了相关内容，建议打开原文查看。")

    summary_lines.append("当前未使用大模型生成，因此先返回检索式整理结果。")
    return "\n".join(summary_lines)


def _clean_snippet(snippet: str) -> str:
    text = html.unescape(TAG_RE.sub("", snippet))
    text = SPACE_RE.sub(" ", text).strip()
    if len(text) <= 140:
        return text
    return f"{text[:137]}..."
