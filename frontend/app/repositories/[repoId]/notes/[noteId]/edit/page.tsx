import { notFound } from "next/navigation";
import { UploadCloud } from "lucide-react";
import { AppShell } from "../../../../../../components/app-shell";
import { AttachmentActions } from "../../../../../../components/attachment-actions";
import { NoteEditor } from "../../../../../../components/note-editor";
import { AttachmentUploader } from "../../../../../../components/attachment-uploader";
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
      description="当前编辑页已经切换为 TipTap，沿用原型里的白底工具栏和大正文编辑区布局。"
    >
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 border-b border-gray-100 pb-6">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="text-3xl font-bold text-gray-900">{note.title}</h2>
            <div className="flex flex-wrap items-center gap-3">
              <AttachmentUploader
                action={uploadAction}
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                label="点击选择附件，自动上传"
                hint="支持 PDF / DOCX，单文件 20MB 以内"
              />
              <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                编辑模式
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
            <p className="text-sm leading-6 text-indigo-700">
              编辑器已切换为 TipTap，当前支持标题、粗体、斜体、列表、引用和链接清除，保存时会同步写入
              `content_json` 与 `content_text`。
            </p>
          </div>
        </div>

        <NoteEditor
          action={saveAction}
          cancelHref={`/repositories/${repoId}/notes/${noteId}`}
          initialContentJson={note.content_json}
          initialContentText={note.content_text}
          initialTitle={note.title}
        />

        <section className="mt-6 overflow-hidden rounded-xl border border-gray-300 bg-white shadow-sm">
          <div className="border-b border-gray-200 bg-gray-50 p-4">
            <h3 className="text-sm font-semibold text-gray-700">附件管理</h3>
          </div>
          <div className="p-5">
            {note.attachments.length > 0 ? (
              <div className="space-y-3">
                {note.attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-gray-900">{attachment.file_name}</p>
                        <p className="text-xs text-gray-500">
                          {attachment.file_type.toUpperCase()} · {(attachment.file_size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <AttachmentActions
                          repoId={repoId}
                          noteId={noteId}
                          attachmentId={attachment.id}
                          fileType={attachment.file_type}
                        />
                        <form action={deleteAction}>
                          <input name="attachment_id" type="hidden" value={attachment.id} />
                          <button
                            className="rounded border border-red-200 px-2 py-1 text-red-600 transition-colors hover:bg-red-50"
                            type="submit"
                          >
                            删除
                          </button>
                        </form>
                      </div>
                    </div>
                    <form action={replaceAction} className="flex flex-wrap items-center gap-3">
                      <input name="attachment_id" type="hidden" value={attachment.id} />
                      <input
                        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        className="w-full max-w-sm rounded border border-gray-300 px-3 py-2 text-xs text-gray-700"
                        name="attachment"
                        type="file"
                      />
                      <button
                        className="rounded border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                        type="submit"
                      >
                        替换文件
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
                当前还没有附件。
              </p>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
