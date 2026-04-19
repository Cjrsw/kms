import { notFound } from "next/navigation";
import { FileText, Paperclip, AlertCircle } from "lucide-react";
import { AppShell } from "../../../../../../components/app-shell";
import { AttachmentActions } from "../../../../../../components/attachment-actions";
import { AttachmentReplaceForm } from "../../../../../../components/attachment-replace-form";
import { NoteEditor } from "../../../../../../components/note-editor";
import { getNote } from "../../../../../../lib/api";
import { requireCurrentUser } from "../../../../../../lib/auth";
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
  const currentUser = await requireCurrentUser();

  let note: Awaited<ReturnType<typeof getNote>> | null = null;
  try {
    note = await getNote(repoId, noteId);
  } catch {
    notFound();
  }

  if (!note) {
    notFound();
  }

  const saveAction = saveNoteAction.bind(null, repoId, noteId);
  const uploadAction = uploadAttachmentAction.bind(null, repoId, noteId);
  const deleteAction = deleteAttachmentAction.bind(null, repoId, noteId);
  const replaceAction = replaceAttachmentAction.bind(null, repoId, noteId);

  return (
    <AppShell
      currentUser={currentUser}
      title={`编辑：${note.title}`}
      description="知识编辑模式，沉浸式的富文本创作体验。"
    >
      <div className="mx-auto max-w-5xl py-4">
        
        {/* 顶部标题与状态 */}
        <div className="mb-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-b border-slate-100 pb-8">
          <div>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
              编辑笔记
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
              </span>
              沉浸编辑模式
            </span>
          </div>
        </div>

        {/* 主编辑器 */}
        <NoteEditor
          action={saveAction}
          uploadAction={uploadAction}
          cancelHref={`/repositories/${repoId}/notes/${noteId}`}
          initialContentJson={note.content_json}
          initialContentText={note.content_text}
          initialTitle={note.title}
        />

        {/* 附件管理模块 */}
        <section className="mt-12 overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-soft">
          <div className="border-b border-slate-100 bg-slate-50/50 px-8 py-5">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Paperclip className="h-5 w-5 text-indigo-500" />
              已上传附件管理
              <span className="bg-slate-200 text-slate-600 text-xs py-0.5 px-2.5 rounded-full font-bold ml-2">
                {note.attachments.length}
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-1.5">您可以在此处查看、替换或删除当前笔记关联的附件。</p>
          </div>
          
          <div className="p-8">
            {note.attachments.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {note.attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="group flex flex-col gap-4 rounded-2xl border border-slate-200/60 bg-white p-5 text-sm text-slate-700 shadow-sm transition-all hover:border-indigo-200 hover:shadow-soft"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center">
                        <div className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-bold text-slate-800">{attachment.file_name}</p>
                          <p className="text-xs font-semibold text-slate-400 mt-0.5 tracking-wider uppercase">
                            {attachment.file_type} · {(attachment.file_size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap items-center justify-between border-t border-slate-100 pt-4 gap-3 mt-auto">
                      <div className="flex items-center gap-2">
                        <AttachmentActions
                          repoId={repoId}
                          noteId={noteId}
                          attachmentId={attachment.id}
                          fileType={attachment.file_type}
                        />
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <AttachmentReplaceForm action={replaceAction} attachmentId={attachment.id} />
                        
                        <form action={deleteAction}>
                          <input name="attachment_id" type="hidden" value={attachment.id} />
                          <button
                            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-600 transition-colors hover:bg-rose-100 hover:text-rose-700"
                            type="submit"
                            title="永久删除"
                          >
                            删除
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center">
                <AlertCircle className="mb-3 h-8 w-8 text-slate-300" />
                <p className="text-sm font-bold text-slate-600">当前没有上传附件</p>
                <p className="text-xs text-slate-400 mt-1">您可以在上方编辑器工具栏中点击 <b>上传附件</b> 按钮。</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
