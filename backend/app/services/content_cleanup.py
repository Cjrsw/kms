from __future__ import annotations

from collections.abc import Iterable, Sequence

from app.models.content import Folder, Note
from app.services.search import delete_note_documents
from app.services.storage import remove_object


def collect_descendant_folder_ids(root_folder_id: int, folders: Sequence[Folder]) -> set[int]:
    children_map: dict[int, list[int]] = {}
    for folder in folders:
        if folder.parent_id is None:
            continue
        children_map.setdefault(folder.parent_id, []).append(folder.id)

    visited: set[int] = set()
    stack = [root_folder_id]
    while stack:
        current = stack.pop()
        if current in visited:
            continue
        visited.add(current)
        stack.extend(children_map.get(current, []))
    return visited


def collect_note_cleanup_payload(notes: Iterable[Note]) -> tuple[list[int], list[str]]:
    note_ids: list[int] = []
    object_keys: list[str] = []
    for note in notes:
        note_ids.append(note.id)
        object_keys.extend(
            attachment.object_key
            for attachment in note.attachments
            if getattr(attachment, "object_key", None)
        )
    return note_ids, object_keys


def cleanup_deleted_note_resources(note_ids: Sequence[int], attachment_object_keys: Sequence[str]) -> None:
    for object_key in dict.fromkeys(key for key in attachment_object_keys if key):
        remove_object(object_key)
    delete_note_documents(list(note_ids))
