import Link from "next/link";
import { FileText, Send } from "lucide-react";

import { AppShell } from "../../components/app-shell";
import { getQaAnswer, getRepositories } from "../../lib/api";

type QaPageProps = {
  searchParams?: Promise<{
    q?: string;
    repository_slug?: string;
  }>;
};

function toPlainText(snippet: string): string {
  return snippet.replace(/<[^>]+>/g, "").trim();
}

export default async function QaPage({ searchParams }: QaPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const query = resolvedSearchParams?.q?.trim() ?? "";
  const repositorySlug = resolvedSearchParams?.repository_slug?.trim() ?? "";

  const [repositories, qaResult] = await Promise.all([
    getRepositories(),
    query ? getQaAnswer(query, repositorySlug || undefined) : Promise.resolve(null)
  ]);

  return (
    <AppShell
      contentClassName=""
      title="知识问答"
      description="问答页现在会先按权限过滤，再从 Elasticsearch 检索可见笔记，最后输出可追溯的答案和来源。"
    >
      <div className="flex min-h-full flex-1 flex-col overflow-hidden bg-white">
        <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-gray-200 bg-gray-50 px-6 shadow-sm">
          <div className="flex items-center gap-3 text-sm font-medium text-gray-700">
            <span>提问范围：</span>
            <form action="/qa" className="flex items-center gap-3">
              <input defaultValue={query} name="q" type="hidden" />
              <select
                className="min-w-[220px] cursor-pointer rounded-md border border-gray-300 bg-white px-3 py-1.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                defaultValue={repositorySlug}
                name="repository_slug"
              >
                <option value="">全站所有知识仓库</option>
                {repositories.map((repository) => (
                  <option key={repository.id} value={repository.slug}>
                    {repository.name}
                  </option>
                ))}
              </select>
              <button
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:border-blue-300 hover:text-blue-600"
                type="submit"
              >
                更新范围
              </button>
            </form>
          </div>
          <p className="text-xs text-gray-400">当前为检索式问答，答案后附原文来源。</p>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          <div className="mx-auto max-w-4xl space-y-6">
            <div className="flex justify-start">
              <div className="flex max-w-[80%]">
                <div className="mr-3 mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-blue-100">
                  <span className="text-sm font-bold text-blue-600">AI</span>
                </div>
                <div className="rounded-2xl rounded-tl-sm border border-gray-100 bg-gray-50 p-4 text-gray-800">
                  <p className="whitespace-pre-line leading-relaxed">
                    你好，我会先在你当前权限可见的知识里检索，再给出可追溯的回答。如果没有命中，我会明确告诉你没有找到。
                  </p>
                </div>
              </div>
            </div>

            {query ? (
              <>
                <div className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-blue-600 p-4 text-white">
                    <p className="whitespace-pre-line leading-relaxed">{query}</p>
                  </div>
                </div>

                <div className="flex justify-start">
                  <div className="flex max-w-[80%]">
                    <div className="mr-3 mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-blue-100">
                      <span className="text-sm font-bold text-blue-600">AI</span>
                    </div>
                    <div className="rounded-2xl rounded-tl-sm border border-gray-100 bg-gray-50 p-4 text-gray-800">
                      <p className="whitespace-pre-line leading-relaxed">
                        {qaResult?.answer ?? "问答结果暂时不可用。"}
                      </p>

                      {qaResult && qaResult.sources.length > 0 && (
                        <div className="mt-4 border-t border-gray-200 pt-4">
                          <p className="mb-3 text-xs text-gray-500">
                            参考来源（{qaResult.source_count} 条，点击后跳转原文）
                          </p>
                          <div className="space-y-3">
                            {qaResult.sources.map((source) => (
                              <Link
                                key={`${source.repository_slug}-${source.note_id}`}
                                className="block rounded-xl border border-blue-100 bg-white p-3 transition-colors hover:border-blue-300 hover:bg-blue-50"
                                href={`/repositories/${source.repository_slug}/notes/${source.note_id}`}
                              >
                                <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                                  <FileText className="h-4 w-4" />
                                  <span>{source.title}</span>
                                </div>
                                <p className="mt-1 text-xs text-gray-500">
                                  {source.repository_name} · L{source.clearance_level} · 附件 {source.attachment_count} 个
                                </p>
                                <p className="mt-2 text-sm leading-6 text-gray-600">{toPlainText(source.snippet)}</p>
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-3xl border border-dashed border-blue-200 bg-blue-50/60 p-6 text-sm text-gray-600">
                <p className="font-medium text-gray-800">可以先试这些问题：</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["考勤制度是什么", "入转调离流程怎么走", "招聘规范有哪些要求"].map((suggestion) => (
                    <Link
                      key={suggestion}
                      className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-sm text-blue-600 transition-colors hover:border-blue-400 hover:bg-blue-100"
                      href={`/qa?q=${encodeURIComponent(suggestion)}`}
                    >
                      {suggestion}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 border-t border-gray-100 bg-white p-6">
          <form
            action="/qa"
            className="relative mx-auto max-w-4xl rounded-2xl border border-gray-300 p-2 shadow-sm transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100"
          >
            <input name="repository_slug" type="hidden" value={repositorySlug} />
            <textarea
              className="min-h-[60px] w-full resize-none bg-transparent p-2 text-gray-700 outline-none"
              defaultValue={query}
              name="q"
              placeholder="基于“当前可见知识”提问..."
            />
            <div className="flex justify-end px-2 pt-2">
              <button
                className="flex items-center rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                type="submit"
              >
                <Send className="mr-2 h-4 w-4" />
                发送
              </button>
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
