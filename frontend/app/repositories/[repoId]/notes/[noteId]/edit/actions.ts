"use server";

import { redirect } from "next/navigation";
import { deleteNoteAttachment, replaceNoteAttachment, updateNote, uploadNoteAttachment } from "../../../../../../lib/api";

export async function saveNoteAction(repositorySlug: string, noteId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const contentText = String(formData.get("content_text") ?? "").trim();
  const contentJson = String(formData.get("content_json") ?? "").trim();

  if (!title || !contentText) {
    throw new Error("Title and content are required.");
  }

  await updateNote(repositorySlug, noteId, {
    title,
    content_text: contentText,
    content_json: contentJson || undefined
  });

  redirect(`/repositories/${repositorySlug}/notes/${noteId}`);
}

export async function uploadAttachmentAction(repositorySlug: string, noteId: string, formData: FormData) {
  const fileEntry = formData.get("attachment");

  if (!(fileEntry instanceof File) || fileEntry.size === 0) {
    throw new Error("Attachment file is required.");
  }

  await uploadNoteAttachment(repositorySlug, noteId, fileEntry);
  redirect(`/repositories/${repositorySlug}/notes/${noteId}/edit`);
}

export async function replaceAttachmentAction(
  repositorySlug: string,
  noteId: string,
  attachmentId: string,
  formData: FormData
) {
  const fileEntry = formData.get("attachment");

  if (!(fileEntry instanceof File) || fileEntry.size === 0) {
    throw new Error("Attachment file is required.");
  }

  await replaceNoteAttachment(repositorySlug, noteId, attachmentId, fileEntry);
  redirect(`/repositories/${repositorySlug}/notes/${noteId}/edit`);
}

export async function deleteAttachmentAction(repositorySlug: string, noteId: string, attachmentId: string) {
  await deleteNoteAttachment(repositorySlug, noteId, attachmentId);
  redirect(`/repositories/${repositorySlug}/notes/${noteId}/edit`);
}
