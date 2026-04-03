from __future__ import annotations

from io import BytesIO
from zipfile import BadZipFile

from docx import Document
from pypdf import PdfReader
from sqlalchemy.orm import Session

from app.models.content import Attachment, AttachmentContent


def extract_attachment_text(file_name: str, file_bytes: bytes) -> str:
    suffix = file_name.lower().rsplit(".", 1)[-1] if "." in file_name else ""
    if suffix == "pdf":
        return _extract_pdf_text(file_bytes)
    if suffix == "docx":
        return _extract_docx_text(file_bytes)
    return ""


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
    except Exception:  # noqa: BLE001
        return ""

    page_texts = []
    for page in reader.pages:
        try:
            page_text = page.extract_text() or ""
        except Exception:  # noqa: BLE001
            page_text = ""
        if page_text.strip():
            page_texts.append(page_text.strip())

    return "\n".join(page_texts).strip()


def _extract_docx_text(file_bytes: bytes) -> str:
    try:
        document = Document(BytesIO(file_bytes))
    except BadZipFile:
        return ""
    except Exception:  # noqa: BLE001
        return ""

    paragraph_text = [paragraph.text.strip() for paragraph in document.paragraphs if paragraph.text.strip()]
    return "\n".join(paragraph_text).strip()
