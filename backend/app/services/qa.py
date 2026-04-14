from __future__ import annotations

import html
import re
from typing import Iterable

import httpx
from app.core.config import get_settings
from sqlalchemy.orm import Session

from app.models.user import User
from app.schemas.qa import QaAnswerResponse, QaSourceItem
from app.services.search import search_notes

TAG_RE = re.compile(r"<[^>]+>")
SPACE_RE = re.compile(r"\s+")
settings = get_settings()
GEMINI_ENDPOINT = (
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"
)


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
        )

    search_results = search_notes(
        db=db,
        user=user,
        query=normalized_question,
        repository_slug=repository_slug,
        page=1,
        page_size=3,
    )
    top_results = search_results.items
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
        scope_text = "当前范围内" if repository_slug else "当前权限可见的知识库中"
        return QaAnswerResponse(
            question=normalized_question,
            answer=f"我没有在{scope_text}检索到可直接支撑这个问题的内容。你可以换一个更具体的关键词，或缩小到某个知识仓库后再试。",
            source_count=0,
            sources=[],
        )

    summary_lines = [
        f"以下回答基于你当前权限可见的 {len(sources)} 条知识整理，不包含更高密级内容。"
    ]
    for index, source in enumerate(sources, start=1):
        cleaned_snippet = _clean_snippet(source.snippet)
        summary_lines.append(f"{index}. {source.title}：{cleaned_snippet or '命中相关内容，建议打开原文查看'}")

    llm_answer = _try_gemini_answer(normalized_question, sources)
    answer_text = llm_answer or "\n".join(summary_lines)

    return QaAnswerResponse(
        question=normalized_question,
        answer=answer_text,
        source_count=len(sources),
        sources=sources,
    )


def _clean_snippet(snippet: str) -> str:
    text = html.unescape(TAG_RE.sub("", snippet))
    text = SPACE_RE.sub(" ", text).strip()
    if len(text) <= 140:
        return text
    return f"{text[:137]}..."


def _try_gemini_answer(question: str, sources: Iterable[QaSourceItem]) -> str | None:
    api_key = settings.gemini_api_key
    if not api_key:
        return None

    context_lines = []
    for idx, src in enumerate(sources, start=1):
        snippet = _clean_snippet(src.snippet)
        context_lines.append(
            f"[{idx}] 标题：{src.title}（仓库：{src.repository_name}，密级 L{src.clearance_level}）\n内容摘录：{snippet}"
        )

    system_prompt = (
        "你是企业内部知识助手。基于提供的命中片段回答问题，优先使用片段内容，不要编造。"
        " 输出用简短中文段落，末尾列出引用编号，如[1][2]。如果片段不足以回答，请说明“根据当前可见内容无法回答”。"
    )

    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": system_prompt},
                    {"text": f"用户问题：{question}"},
                    {"text": "可用片段：\n" + "\n\n".join(context_lines)},
                ],
            }
        ],
    }

    try:
        response = httpx.post(
            GEMINI_ENDPOINT,
            params={"key": api_key},
            json=payload,
            timeout=20,
        )
        response.raise_for_status()
        data = response.json()
        candidates = data.get("candidates") or []
        for cand in candidates:
            parts = cand.get("content", {}).get("parts", [])
            texts = [part.get("text", "") for part in parts if "text" in part]
            combined = "\n".join(texts).strip()
            if combined:
                return combined
    except Exception:
        return None

    return None
