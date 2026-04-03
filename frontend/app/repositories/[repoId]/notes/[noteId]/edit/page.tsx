import { notFound } from "next/navigation";
import { UploadCloud } from "lucide-react";
import { AppShell } from "../../../../../../components/app-shell";
import { NoteEditor } from "../../../../../../components/note-editor";
import { getNote } from "../../../../../../lib/api";
import { saveNoteAction, uploadAttachmentAction } from "./actions";

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

  const saveAction = saveNoteAction.bind(null, repoId, noteId);
  const uploadAction = uploadAttachmentAction.bind(null, repoId, noteId);

  return (
    <AppShell
      title={`编辑：${note.title}`}
      description="当前编辑页已经切换为 TipTap，沿用原型里的白底工具栏和大正文编辑区布局。"
    >
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 border-b border-gray-100 pb-6">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="text-3xl font-bold text-gray-900">{note.title}</h2>
            <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
              编辑模式
            </span>
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
            <h3 className="text-sm font-semibold text-gray-700">附件上传</h3>
          </div>
          <div className="p-5">
            <form action={uploadAction} className="space-y-4">
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 px-6 py-8 text-center transition-colors hover:border-blue-300 hover:bg-blue-50/40">
                <UploadCloud className="mb-2 h-6 w-6 text-gray-400" />
                <span className="text-sm font-medium text-gray-700">点击选择 PDF 或 DOCX 附件</span>
                <span className="mt-1 text-xs text-gray-500">首版仅支持 PDF、DOCX，单文件 20MB 以内。</span>
                <input accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" name="attachment" type="file" />
              </label>
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">已有关联附件 {note.attachments.length} 个，上传后会直接刷新当前编辑页。</p>
                <button
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                  type="submit"
                >
                  上传附件
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
