import Link from "next/link";
import { FileText, Sparkles } from "lucide-react";
import { generateHTML } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
import { notFound } from "next/navigation";
import { AppShell } from "../../../../../components/app-shell";
import { getNote, getRepository } from "../../../../../lib/api";
import { requireCurrentUser } from "../../../../../lib/auth";

type NoteDetailPageProps = {
  params: Promise<{ repoId: string; noteId: string }>;
};

export default async function NoteDetailPage({ params }: NoteDetailPageProps) {
  const { repoId, noteId } = await params;
  const currentUser = await requireCurrentUser();

  let repository: Awaited<ReturnType<typeof getRepository>> | null = null;
  let note: Awaited<ReturnType<typeof getNote>> | null = null;

  try {
    repository = await getRepository(repoId);
    note = await getNote(repoId, noteId);
  } catch {
    notFound();
  }

  if (!repository || !note) {
    notFound();
  }

  return (
    <AppShell
      currentUser={currentUser}
      title={note.title}
      description="这是后续搜索和问答来源跳转的落点页，布局沿用原型里的左信息栏加右正文阅读区。"
    >
      <div className="flex min-h-[720px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <aside className="w-[280px] flex-shrink-0 border-r border-gray-200 bg-gray-50 p-5">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-gray-400">上下文</p>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">{repository.name}</h3>
          <p className="mt-2 text-sm leading-6 text-gray-600">{repository.description}</p>

          <div className="mt-6 space-y-3 text-sm text-gray-600">
            <p>笔记 ID：{note.id}</p>
            <p>最低密级：L{note.clearance_level}</p>
            <p>更新时间：{new Date(note.updated_at).toLocaleString("zh-CN", { hour12: false })}</p>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/repositories/${repoId}`}
              className="inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              返回仓库
            </Link>
            <Link
              href={`/repositories/${repoId}/notes/${noteId}/edit`}
              className="inline-flex rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-white"
            >
              编辑笔记
            </Link>
          </div>
        </aside>

        <section className="flex-1 bg-white">
          <div className="mx-auto max-w-4xl p-10">
            <div className="mb-8 border-b border-gray-100 pb-6">
              <div className="mb-3 flex items-center justify-between gap-4">
                <h2 className="text-3xl font-bold text-gray-900">{note.title}</h2>
                <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                  已通过权限过滤
                </span>
              </div>

              <div className="mb-4 flex items-center space-x-4 text-sm text-gray-500">
                <span>来源页</span>
                <span className="text-gray-300">|</span>
                <span>{repository.name}</span>
                <span className="text-gray-300">|</span>
                <span>{new Date(note.updated_at).toLocaleDateString("zh-CN")}</span>
              </div>

              <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
                <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-indigo-700">
                  <span className="inline-flex items-center">
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    AI 助手
                  </span>
                  <button
                    className="rounded-md border border-indigo-200 bg-white px-3 py-1.5 text-indigo-600 transition-colors hover:bg-indigo-50"
                    type="button"
                  >
                    智能摘要
                  </button>
                  <button
                    className="rounded-md border border-indigo-200 bg-white px-3 py-1.5 text-indigo-600 transition-colors hover:bg-indigo-50"
                    type="button"
                  >
                    文本润色
                  </button>
                </div>
              </div>
            </div>

            <article className="prose max-w-none text-[15px] leading-8 text-gray-800 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1">
              <div
                dangerouslySetInnerHTML={{
                  __html: generateHTML(JSON.parse(note.content_json || "{}"), [StarterKit]),
                }}
              />
            </article>

            <div className="mt-10 border-t border-gray-100 pt-6">
              <h3 className="mb-4 text-sm font-bold text-gray-800">笔记附件</h3>
              {note.attachments.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {note.attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700"
                    >
                      <div className="flex min-w-0 flex-1 items-center">
                        <FileText className="mr-3 h-4 w-4 flex-shrink-0 text-gray-400" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-gray-800">{attachment.file_name}</p>
                          <p className="text-xs text-gray-400">
                            {attachment.file_type.toUpperCase()} · {(attachment.file_size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-shrink-0 gap-2 text-xs">
                        <a
                          className="rounded border border-gray-300 px-2 py-1 text-gray-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                          href={`/repositories/${repoId}/notes/${noteId}/attachments/${attachment.id}/preview`}
                          target="_blank"
                        >
                          预览
                        </a>
                        <a
                          className="rounded border border-gray-300 px-2 py-1 text-gray-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                          href={`/repositories/${repoId}/notes/${noteId}/attachments/${attachment.id}/download`}
                          target="_blank"
                        >
                          下载
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex w-full max-w-sm items-center rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
                  <FileText className="mr-2 h-4 w-4 flex-shrink-0 text-gray-400" />
                  当前笔记还没有附件。
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
