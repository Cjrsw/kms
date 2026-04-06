import Link from "next/link";
import { ArrowLeft, ChevronLeft, Edit3, FileText, FolderOpen, Sparkles } from "lucide-react";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { AppShell } from "../../../components/app-shell";
import { createNoteUser, getRepository } from "../../../lib/api";
import { requireCurrentUser } from "../../../lib/auth";

type RepositoryDetailPageProps = {
  params: Promise<{ repoId: string }>;
};

export default async function RepositoryDetailPage({ params }: RepositoryDetailPageProps) {
  const { repoId } = await params;
  const currentUser = await requireCurrentUser();

  const createNoteAction = async (formData: FormData) => {
    "use server";
    const title = String(formData.get("title") ?? "").trim();
    if (!title) {
      throw new Error("标题必填");
    }
    const note = await createNoteUser(repoId, { title });
    redirect(`/repositories/${repoId}/notes/${note.id}/edit`);
  };

  let repo: Awaited<ReturnType<typeof getRepository>> | null = null;
  try {
    repo = await getRepository(repoId);
  } catch {
    notFound();
  }

  if (!repo) {
    notFound();
  }

  return (
    <AppShell
      contentClassName=""
      currentUser={currentUser}
      title={repo.name}
      description="仓库详情沿用原型里的左树右文结构，后续搜索和问答的来源跳转会直接落到右侧笔记详情页。"
    >
      <div className="flex min-h-full flex-1 overflow-hidden bg-white">
        <aside className="flex w-[280px] flex-shrink-0 flex-col border-r border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between border-b border-gray-200 p-4">
            <div className="mr-2 flex min-w-0 items-center">
              <Link
                href="/repositories"
                className="mr-2 flex flex-shrink-0 items-center text-gray-500 transition-colors hover:text-blue-600"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <h2 className="truncate text-sm font-bold text-gray-800" title={repo.name}>
                {repo.name}
              </h2>
            </div>
            <button
              className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700"
              type="button"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-2">
            {repo.folders.map((folder) => (
              <div
                key={`folder-${folder.id}`}
                className="group flex items-center justify-between rounded-lg px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100"
              >
                <div className="flex min-w-0 items-center">
                  <FolderOpen className="mr-2 h-4 w-4 flex-shrink-0 text-gray-400 group-hover:text-gray-600" />
                  <span className="truncate">{folder.name}</span>
                </div>
                <span className="ml-3 text-xs text-gray-400">L{folder.clearance_level}</span>
              </div>
            ))}

            {repo.notes.map((note) => (
              <Link
                key={`note-${note.id}`}
                href={`/repositories/${repo.slug}/notes/${note.id}`}
                className="group flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors hover:bg-blue-50"
              >
                <div className="flex min-w-0 items-center text-gray-700 group-hover:text-blue-700">
                  <Edit3 className="mr-2 h-4 w-4 flex-shrink-0 text-gray-400 group-hover:text-blue-600" />
                  <span className="truncate">{note.title}</span>
                </div>
                <span className="ml-3 text-xs text-gray-400">{note.attachment_count}</span>
              </Link>
            ))}
          </div>
        </aside>

        <section className="flex-1 bg-white">
          <div className="mx-auto max-w-4xl p-10">
            <div className="mb-8 border-b border-gray-100 pb-6">
              <div className="mb-3 flex items-center justify-between gap-4">
                <h2 className="text-3xl font-bold text-gray-900">{repo.name}</h2>
                <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                  默认密级 L{repo.min_clearance_level}
                </span>
              </div>

              <p className="mb-4 max-w-3xl text-sm leading-7 text-gray-500">{repo.description}</p>

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

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-bold text-gray-800">目录统计</p>
              <p className="mt-2 text-sm leading-6 text-gray-500">
                当前可见目录 {repo.folders.length} 个，可见笔记 {repo.notes.length} 篇。
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-bold text-gray-800">来源跳转约定</p>
              <p className="mt-2 text-sm leading-6 text-gray-500">
                搜索和问答返回的来源统一跳转到笔记详情页，首版不再额外定位到 chunk 片段级别。
              </p>
            </div>
          </div>

          {currentUser.clearance_level >= repo.min_clearance_level && (
            <div className="mt-6 rounded-xl border border-dashed border-blue-200 bg-blue-50/60 p-4">
              <p className="mb-3 text-sm font-semibold text-gray-800">新建笔记</p>
              <form action={createNoteAction} className="flex flex-wrap items-center gap-3">
                <input
                  className="min-w-[240px] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  name="title"
                  placeholder="输入笔记标题"
                  required
                />
                <button
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                  type="submit"
                >
                  创建并进入编辑
                </button>
              </form>
            </div>
          )}

            <div className="mt-8 rounded-xl border border-gray-200 bg-gray-50 p-6 text-sm leading-7 text-gray-500">
              <div className="flex items-start">
                <FileText className="mr-3 mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
                <p>请在左侧选择一篇笔记进入详情，当前页面保持与你原型一致的“左树右文”结构。</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
