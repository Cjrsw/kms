import re


FENCED_CODE_RE = re.compile(r"```[\w+-]*\n(?P<body>.*?)```", re.DOTALL)
INLINE_LINK_RE = re.compile(r"!?\[([^\]]*)\]\(([^)]*)\)")
HTML_TAG_RE = re.compile(r"<[^>]+>")


def markdown_to_plain_text(markdown: str) -> str:
    """Return a search/QA-friendly plain text representation of Markdown."""
    text = (markdown or "").replace("\r\n", "\n").replace("\r", "\n")

    text = FENCED_CODE_RE.sub(lambda match: match.group("body"), text)
    text = INLINE_LINK_RE.sub(lambda match: match.group(1), text)
    text = HTML_TAG_RE.sub("", text)

    cleaned_lines: list[str] = []
    for raw_line in text.split("\n"):
        line = raw_line.strip()
        line = re.sub(r"^#{1,6}\s+", "", line)
        line = re.sub(r"^>\s?", "", line)
        line = re.sub(r"^[-+*]\s+", "", line)
        line = re.sub(r"^\d+[.)]\s+", "", line)
        line = re.sub(r"^\|?[-:\s|]{3,}\|?$", "", line)
        line = line.replace("`", "")
        line = re.sub(r"(\*\*|__)(.*?)\1", r"\2", line)
        line = re.sub(r"(\*|_)(.*?)\1", r"\2", line)
        line = re.sub(r"~~(.*?)~~", r"\1", line)
        line = re.sub(r"\s+", " ", line).strip()
        if line:
            cleaned_lines.append(line)

    return "\n".join(cleaned_lines).strip()


def resolve_note_body(
    *,
    content_markdown: str | None = None,
    content_text: str | None = None,
) -> tuple[str, str]:
    """Resolve canonical Markdown and derived plain text for note persistence."""
    markdown = (content_markdown or "").strip()
    if markdown:
        return markdown, markdown_to_plain_text(markdown)

    fallback_text = (content_text or "").strip()
    return fallback_text, fallback_text
