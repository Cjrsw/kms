import Link from "next/link";
import { FileText, Sparkles, ChevronLeft, Pencil, ShieldAlert } from "lucide-react";
import { generateHTML } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
import { notFound } from "next/navigation";
import { AppShell } from "../../../../../components/app-shell";
import { AttachmentActions } from "../../../../../components/attachment-actions";
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

  let renderedHtml = "";
  try {
    const parsed = note.content_json ? JSON.parse(note.content_json) : null;
    renderedHtml = parsed ? generateHTML(parsed, [StarterKit]) : "";
  } catch {
    renderedHtml = "";
  }

  return (
    <AppShell
      currentUser={currentUser}
      title={note.title}
      description="知识笔记详情页，支持结构化阅读与 AI 工具集。"
    >
      <div className="flex min-h-[750px] overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-soft">
        
        {/* 左侧元数据边栏 */}
        <aside className="w-[300px] flex-shrink-0 border-r border-slate-200/60 bg-slate-50/50 p-6 backdrop-blur-sm hidden md:block">
          <Link
            href={`/repositories/${repoId}`}
            className="inline-flex items-center gap-2 mb-8 text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            返回 {repository.name}
          </Link>

          <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-4">归属知识库</p>
          <h3 className="text-xl font-bold text-slate-900">{repository.name}</h3>
          <p className="mt-3 text-sm leading-relaxed text-slate-500">{repository.description}</p>

          <div className="mt-10 pt-8 border-t border-slate-200/60 space-y-4">
            <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-2">笔记信息</p>
            <div className="bg-white rounded-2xl p-4 border border-slate-200/60 shadow-sm space-y-3 text-sm font-medium text-slate-600">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">笔记标识</span>
                <span className="text-slate-800 font-mono text-xs">#{note.id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">更新时间</span>
                <span className="text-slate-800">{new Date(note.updated_at).toLocaleDateString("zh-CN")}</span>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <span className="flex items-center gap-1.5"><ShieldAlert className="h-4 w-4 text-emerald-500" /> 最低密级</span>
                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-xs font-bold ring-1 ring-inset ring-emerald-600/20">L{note.clearance_level}</span>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <Link
              href={`/repositories/${repoId}/notes/${noteId}/edit`}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-soft transition-all hover:-translate-y-0.5 hover:bg-indigo-700 hover:shadow-floating active:scale-95"
            >
              <Pencil className="h-4 w-4" />
              编辑笔记正文
            </Link>
          </div>
        </aside>

        {/* 右侧主正文区 */}
        <section className="flex-1 bg-white relative">
          <div className="mx-auto max-w-4xl p-8 lg:p-12">
            
            {/* 笔记头部 */}
            <div className="mb-10 border-b border-slate-100 pb-8">
              <div className="mb-4 flex items-center justify-between gap-4">
                <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">{note.title}</h1>
              </div>

              <div className="mb-6 flex items-center gap-4 text-sm font-medium text-slate-500">
                <span className="md:hidden inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1">
                  <ShieldAlert className="h-4 w-4 text-emerald-500" />
                  L{note.clearance_level}
                </span>
                <span className="rounded-full bg-indigo-50 text-indigo-700 px-3 py-1">
                  知识仓库: {repository.name}
                </span>
                <span className="text-slate-400">{new Date(note.updated_at).toLocaleString("zh-CN", { hour12: false })} 更新</span>
              </div>

              {/* AI 助手浮窗 */}
              <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/50 to-blue-50/50 p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center text-sm font-bold text-indigo-700 bg-white px-3 py-1.5 rounded-xl border border-indigo-100 shadow-sm">
                    <Sparkles className="mr-2 h-4 w-4 text-indigo-500" />
                    KMS AI 助手
                  </span>
                  <button className="rounded-xl border border-indigo-200 bg-white/80 px-4 py-1.5 text-sm font-semibold text-indigo-600 shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-soft" type="button">
                    智能提取摘要
                  </button>
                  <button className="rounded-xl border border-indigo-200 bg-white/80 px-4 py-1.5 text-sm font-semibold text-indigo-600 shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-soft" type="button">
                    文本润色
                  </button>
                  <Link href="/qa" className="ml-auto text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
                    进入独立问答面板 &rarr;
                  </Link>
                </div>
              </div>
            </div>

            {/* 笔记正文 */}
            <div className="min-h-[300px]">
              {renderedHtml ? (
                <article className="prose prose-slate prose-lg max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-indigo-600 prose-a:font-medium prose-img:rounded-2xl prose-img:shadow-soft prose-pre:bg-slate-900 prose-pre:rounded-xl">
                  <div dangerouslySetInnerHTML={{ __html: renderedHtml }} />
                </article>
              ) : (
                <article className="whitespace-pre-wrap text-lg leading-loose text-slate-700">
                  {note.content_text || (
                    <div className="py-20 text-center flex flex-col items-center justify-center">
                      <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4">
                        <FileText className="h-8 w-8 text-slate-300" />
                      </div>
                      <p className="text-slate-400 font-medium">（当前正文为空，请点击左侧编辑添加内容）</p>
                    </div>
                  )}
                </article>
              )}
            </div>

            {/* 附件区域 */}
            <div className="mt-16 border-t border-slate-100 pt-10">
              <h3 className="mb-6 text-lg font-bold text-slate-900 flex items-center gap-2">
                笔记附件 
                <span className="bg-slate-100 text-slate-500 text-xs py-0.5 px-2.5 rounded-full font-bold">{note.attachments.length}</span>
              </h3>
              {note.attachments.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {note.attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="group flex items-center justify-between rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm transition-all hover:border-indigo-200 hover:shadow-soft"
                    >
                      <div className="flex min-w-0 flex-1 items-center">
                        <div className="mr-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-800">{attachment.file_name}</p>
                          <p className="mt-0.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            {attachment.file_type} · {(attachment.file_size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </div>
                      <AttachmentActions
                        repoId={repoId}
                        noteId={noteId}
                        attachmentId={attachment.id}
                        fileType={attachment.file_type}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex w-full items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-12 text-sm text-slate-500">
                  <div className="text-center">
                    <FileText className="mx-auto h-8 w-8 text-slate-300 mb-3" />
                    当前笔记还没有上传任何附件。
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
