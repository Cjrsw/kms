import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertCircle, FileText, Paperclip, ShieldAlert, RefreshCw, Trash2 } from "lucide-react";
import { AttachmentActions } from "@/components/attachment-actions";
import { AttachmentReplaceForm } from "@/components/attachment-replace-form";
import { NoteIndexStatus } from "@/components/note-index-status";
import { NoteEditor } from "@/components/note-editor";
import { getNote } from "@/lib/api";
import {
  deleteAttachmentAction,
  replaceAttachmentAction,
  saveNoteAction,
  uploadAttachmentAction
} from "./actions";

type NoteEditPageProps = {
  params: Promise<{ repoId: string; noteId: string }>;
};

export default async function NoteEditPage({ params }: NoteEditPageProps) {
  const { repoId, noteId } = await params;

  let note: Awaited<ReturnType<typeof getNote>> | null = null;
  try {
    note = await getNote(repoId, noteId);
  } catch {
    notFound();
  }

  if (!note) {
    notFound();
  }
  if (!note.can_edit) {
    redirect(`/repositories/${repoId}/notes/${noteId}`);
  }

  const saveAction = saveNoteAction.bind(null, repoId, noteId);
  const uploadAction = uploadAttachmentAction.bind(null, repoId, noteId);
  const deleteAction = deleteAttachmentAction.bind(null, repoId, noteId);
  const replaceAction = replaceAttachmentAction.bind(null, repoId, noteId);
  const updatedLabel = new Date(note.updated_at).toLocaleString("zh-CN", { hour12: false });

  return (
    <section className="kms-note-edit-layout">
      <header className="kms-note-edit-header">
        <Link href={`/repositories/${repoId}/notes/${noteId}`} className="kms-cyber-btn kms-note-back-btn">
          &lt; RETURN // 返回
        </Link>

        <div className="kms-note-edit-title-area">
          <h1>EDIT NOTE // 编辑笔记</h1>
          <div>
            NOTE #{note.id} | AUTHOR: @{note.author_name || "系统"} | UPDATED: {updatedLabel}
          </div>
        </div>

        <div className="kms-note-edit-status">
          <span className="kms-live-dot" />
          DRAFT MODE
        </div>
      </header>

      <div className="kms-note-edit-body">
        <main className="kms-note-edit-main">
          <NoteEditor
            action={saveAction}
            uploadAction={uploadAction}
            cancelHref={`/repositories/${repoId}/notes/${noteId}`}
            initialContentJson={note.content_json}
            initialContentMarkdown={note.content_markdown}
            initialContentText={note.content_text}
            initialEditableByClearance={note.editable_by_clearance}
            initialTitle={note.title}
            canChangeEditPolicy={note.can_change_edit_policy}
          />
        </main>

        <aside className="kms-note-edit-sidebar">
          <section className="kms-sidebar-block">
            <div className="kms-block-title">BACKEND STATE</div>
            <div className="kms-note-meta-card">
              <span>
                <ShieldAlert className="h-4 w-4" />
                CLEARANCE
              </span>
              <strong>L{note.clearance_level}</strong>
            </div>
            <div className="kms-note-meta-card">
              <span>MARKDOWN</span>
              <strong>{note.content_markdown ? "ON" : "EMPTY"}</strong>
            </div>
            <div className="kms-note-meta-card">
              <span>ATTACHMENTS</span>
              <strong>{note.attachments.length}</strong>
            </div>
            <div className="kms-note-meta-card">
              <span>EDIT POLICY</span>
              <strong>{note.editable_by_clearance ? "OPEN" : "OWNER"}</strong>
            </div>
            <div className="kms-note-meta-card">
              <span>INDEX</span>
              <strong>{note.search_index_status || "indexed"}</strong>
            </div>
          </section>

          <section className="kms-sidebar-block">
            <div className="kms-block-title">ATTACHMENTS // 附件管理</div>
            <p className="kms-note-edit-help">
              上传入口在编辑器工具栏；这里负责预览、下载、替换和删除。PDF 可预览，DOCX 会提示下载。
            </p>

            <div className="kms-edit-attachment-list">
              {note.attachments.length > 0 ? (
                note.attachments.map((attachment) => (
                  <div key={attachment.id} className="kms-edit-attachment-card">
                    <div className="kms-edit-attachment-main">
                      <div className="kms-att-icon">{attachment.file_type.toUpperCase()}</div>
                      <div className="kms-att-name" title={attachment.file_name}>
                        {attachment.file_name}
                      </div>
                    </div>
                    <div className="kms-edit-attachment-meta">
                      {(attachment.file_size / 1024).toFixed(1)} KB
                    </div>
                    <div className="kms-edit-attachment-actions">
                      <AttachmentActions
                        repoId={repoId}
                        noteId={noteId}
                        attachmentId={attachment.id}
                        fileType={attachment.file_type}
                      />
                      <AttachmentReplaceForm action={replaceAction} attachmentId={attachment.id} />
                      <form action={deleteAction}>
                        <input name="attachment_id" type="hidden" value={attachment.id} />
                        <button className="kms-edit-attachment-danger" type="submit" title="永久删除附件">
                          <Trash2 className="h-3.5 w-3.5" />
                          DEL
                        </button>
                      </form>
                    </div>
                  </div>
                ))
              ) : (
                <div className="kms-note-side-empty">
                  <FileText className="mx-auto mb-3 h-8 w-8 opacity-60" />
                  NO FILES
                </div>
              )}
            </div>
          </section>

          <section className="kms-sidebar-block">
            <div className="kms-block-title">SAVE PIPELINE</div>
            <div className="kms-edit-pipeline">
              <div>
                <RefreshCw className="h-4 w-4" />
                TipTap JSON
              </div>
              <div>
                <RefreshCw className="h-4 w-4" />
                Markdown
              </div>
              <div>
                <RefreshCw className="h-4 w-4" />
                Plain Text
              </div>
            </div>
            <div className="kms-note-edit-warning">
              <AlertCircle className="h-4 w-4" />
              保存后会在后台重新索引笔记内容，用于全文检索和问答召回。
            </div>
            <NoteIndexStatus
              repoSlug={repoId}
              noteId={noteId}
              initialStatus={note.search_index_status}
              initialError={note.search_index_error}
              variant="banner"
            />
          </section>
        </aside>
      </div>
    </section>
  );
}
