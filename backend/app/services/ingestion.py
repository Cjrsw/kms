from __future__ import annotations

from io import BytesIO
from zipfile import BadZipFile

from docx import Document
from pypdf import PdfReader
from sqlalchemy.orm import Session

from app.models.content import Attachment, AttachmentContent


class AttachmentExtractionError(Exception):
    """Raised when an attachment cannot be parsed at all."""


def extract_attachment_text(file_name: str, file_bytes: bytes) -> str:
    text, _ = extract_attachment_text_with_error(file_name, file_bytes)
    return text


def extract_attachment_text_with_error(file_name: str, file_bytes: bytes) -> tuple[str, str | None]:
    suffix = file_name.lower().rsplit(".", 1)[-1] if "." in file_name else ""
    try:
        if suffix == "pdf":
            return _extract_pdf_text(file_bytes), None
        if suffix == "docx":
            return _extract_docx_text(file_bytes), None
    except AttachmentExtractionError as exc:
        return "", str(exc)
    return "", None


def upsert_attachment_text(
    db: Session,
    attachment: Attachment,
    extracted_text: str,
) -> AttachmentContent:
    content = (
        db.query(AttachmentContent)
        .filter(AttachmentContent.attachment_id == attachment.id)
        .first()
    )
    if content is None:
        content = AttachmentContent(attachment_id=attachment.id, extracted_text=extracted_text)
    else:
        content.extracted_text = extracted_text

    db.add(content)
    db.commit()
    db.refresh(content)
    return content


def _extract_pdf_text(file_bytes: bytes) -> str:
    try:
        reader = PdfReader(BytesIO(file_bytes))
    except Exception as exc:  # noqa: BLE001
        raise AttachmentExtractionError("PDF 文件无法解析，可能已损坏或格式不受支持。") from exc

    page_texts: list[str] = []
    for page in reader.pages:
        try:
            page_text = page.extract_text() or ""
        except Exception:  # noqa: BLE001
            page_text = ""
        if page_text.strip():
            page_texts.append(page_text.strip())

    # Keep page boundaries for chunking strategies and retrieval diagnostics.
    return "\f".join(page_texts).strip()


def _extract_docx_text(file_bytes: bytes) -> str:
    try:
        document = Document(BytesIO(file_bytes))
    except BadZipFile as exc:
        raise AttachmentExtractionError("DOCX 文件无法解析，可能已损坏或不是有效的 DOCX。") from exc
    except Exception as exc:  # noqa: BLE001
        raise AttachmentExtractionError("DOCX 文件无法解析，可能已损坏或格式不受支持。") from exc

    # Preserve paragraph boundaries so downstream chunking can distinguish sections.
    paragraph_text = [paragraph.text.strip() for paragraph in document.paragraphs if paragraph.text.strip()]
    return "\n\n".join(paragraph_text).strip()
