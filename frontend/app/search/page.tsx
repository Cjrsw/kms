import Link from "next/link";
import { CalendarDays, FileText, Filter, Search, SlidersHorizontal, User } from "lucide-react";

import { AppShell } from "../../components/app-shell";
import { requireCurrentUser } from "../../lib/auth";
import { getRepositories, getSearchResults } from "../../lib/api";

const fileTypeOptions = [
  { value: "", label: "全部格式" },
  { value: "note", label: "在线笔记" },
  { value: "pdf", label: "PDF 文档" },
  { value: "docx", label: "Word (.docx)" }
];

const updatedWithinOptions = [
  { value: "", label: "不限时间" },
  { value: "1d", label: "近一天" },
  { value: "7d", label: "近一周" },
  { value: "30d", label: "近一月" },
  { value: "365d", label: "近一年" }
];

type SearchPageProps = {
  searchParams: Promise<{
    q?: string;
    repository_slug?: string;
    file_type?: string;
    updated_within?: string;
  }>;
};

function getSelectedLabel(value: string, options: Array<{ value: string; label: string }>) {
  return options.find((option) => option.value === value)?.label ?? "";
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const resolvedSearchParams = await searchParams;
  const query = resolvedSearchParams.q?.trim() ?? "";
  const repositorySlug = resolvedSearchParams.repository_slug?.trim() ?? "";
  const fileType = resolvedSearchParams.file_type?.trim().toLowerCase() ?? "";
  const updatedWithin = resolvedSearchParams.updated_within?.trim().toLowerCase() ?? "";

  const [currentUser, repositories, results] = await Promise.all([
    requireCurrentUser(),
    getRepositories(),
    query
      ? getSearchResults(query, {
          repositorySlug: repositorySlug || undefined,
          fileType: fileType || undefined,
          updatedWithin: updatedWithin || undefined
        })
      : Promise.resolve([])
  ]);

  const selectedRepository = repositories.find((repository) => repository.slug === repositorySlug);
  const activeFilters = [
    selectedRepository ? `知识库：${selectedRepository.name}` : "",
    fileType ? `文件类型：${getSelectedLabel(fileType, fileTypeOptions)}` : "",
    updatedWithin ? `时间范围：${getSelectedLabel(updatedWithin, updatedWithinOptions)}` : ""
  ].filter(Boolean);

  return (
    <AppShell
      contentClassName=""
      currentUser={currentUser}
      title="全文搜索"
      description="搜索页已经接入真实筛选条件，当前支持按知识库、文件类型和更新时间过滤，同时保持权限过滤与 chunk 级命中高亮。"
    >
      <div className="flex min-h-full flex-1 overflow-hidden bg-white">
        <div className="flex flex-1 flex-col">
          <div className="border-b border-gray-200 bg-white px-8 py-6 shadow-sm">
            <form action="/search" className="relative w-full max-w-4xl">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                className="h-12 w-full rounded-lg border border-gray-300 bg-gray-50 pl-12 pr-64 text-base outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500"
                defaultValue={query}
                name="q"
                placeholder="搜索全站文档、笔记、PDF、DOCX 内容..."
                type="text"
              />
              {repositorySlug ? <input name="repository_slug" type="hidden" value={repositorySlug} /> : null}
              {fileType ? <input name="file_type" type="hidden" value={fileType} /> : null}
              {updatedWithin ? <input name="updated_within" type="hidden" value={updatedWithin} /> : null}
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                type="submit"
              >
                搜索
              </button>
            </form>

            {activeFilters.length > 0 ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {activeFilters.map((filterLabel) => (
                  <span
                    key={filterLabel}
                    className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700"
                  >
                    {filterLabel}
                  </span>
                ))}
                <Link
                  className="text-xs font-medium text-gray-500 transition-colors hover:text-blue-600"
                  href={query ? `/search?q=${encodeURIComponent(query)}` : "/search"}
                >
                  清空筛选
                </Link>
              </div>
            ) : null}
          </div>

          <div className="flex flex-1 overflow-hidden">
            <aside className="w-[320px] flex-shrink-0 border-r border-gray-200 bg-white">
              <div className="h-full overflow-y-auto p-6">
                <div className="mb-6 flex items-center justify-between border-b border-gray-100 pb-4 text-sm font-bold text-gray-800">
                  <div className="flex items-center">
                    <Filter className="mr-2 h-4 w-4" />
                    筛选条件
                  </div>
                </div>

                <form action="/search" className="space-y-6">
                  <input name="q" type="hidden" value={query} />

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700">所属知识库</label>
                    <select
                      className="block w-full cursor-pointer rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-700 outline-none transition-colors hover:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                      defaultValue={repositorySlug}
                      name="repository_slug"
                    >
                      <option value="">全部知识库</option>
                      {repositories.map((repository) => (
                        <option key={repository.id} value={repository.slug}>
                          {repository.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700">文件类型</label>
                    <select
                      className="block w-full cursor-pointer rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-700 outline-none transition-colors hover:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                      defaultValue={fileType}
                      name="file_type"
                    >
                      {fileTypeOptions.map((option) => (
                        <option key={option.value || "all"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs leading-5 text-gray-500">
                      “在线笔记” 会优先筛正文内容；PDF 和 Word 会筛带对应附件类型的笔记。
                    </p>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700">更新时间</label>
                    <select
                      className="block w-full cursor-pointer rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-700 outline-none transition-colors hover:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                      defaultValue={updatedWithin}
                      name="updated_within"
                    >
                      {updatedWithinOptions.map((option) => (
                        <option key={option.value || "all"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800">
                      <User className="h-4 w-4 text-gray-500" />
                      <span>发布人员</span>
                    </div>
                    <p className="text-sm leading-6 text-gray-500">
                      当前数据模型里还没有笔记作者字段，这项筛选会在补齐作者信息后接入。
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                      type="submit"
                    >
                      <SlidersHorizontal className="mr-2 h-4 w-4" />
                      应用筛选
                    </button>
                    <Link
                      className="inline-flex items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                      href={query ? `/search?q=${encodeURIComponent(query)}` : "/search"}
                    >
                      重置
                    </Link>
                  </div>
                </form>
              </div>
            </aside>

            <section className="flex flex-1 bg-gray-50 p-8">
              {query ? (
                <div className="mx-auto w-full max-w-4xl">
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-gray-800">搜索结果</h2>
                      <p className="mt-1 text-sm text-gray-500">
                        关键词“{query}”，当前返回 {results.length} 条可见结果。
                      </p>
                    </div>
                    <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500">
                      <CalendarDays className="h-3.5 w-3.5" />
                      权限过滤与筛选条件同时生效
                    </div>
                  </div>

                  {results.length > 0 ? (
                    <div className="space-y-4">
                      {results.map((result) => (
                        <Link
                          key={`${result.repository_slug}-${result.note_id}`}
                          className="block rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
                          href={`/repositories/${result.repository_slug}/notes/${result.note_id}`}
                        >
                          <div className="mb-2 flex items-center justify-between gap-4">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
                                {result.repository_name}
                              </p>
                              <h3 className="mt-2 text-lg font-bold text-gray-900">{result.title}</h3>
                            </div>
                            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                              L{result.clearance_level}
                            </span>
                          </div>
                          <p
                            className="text-sm leading-7 text-gray-600"
                            dangerouslySetInnerHTML={{ __html: result.snippet }}
                          />
                          <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4 text-xs text-gray-400">
                            <span>{new Date(result.updated_at).toLocaleString("zh-CN", { hour12: false })}</span>
                            <span>{result.attachment_count} 个附件</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center text-gray-400">
                      <FileText className="mx-auto mb-4 h-10 w-10 opacity-30" />
                      <p>没有找到你当前权限范围内匹配“{query}”的结果。</p>
                      {activeFilters.length > 0 ? (
                        <p className="mt-2 text-sm text-gray-400">可以尝试清空部分筛选条件后重新搜索。</p>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : (
                <div className="m-auto max-w-2xl rounded-3xl border border-dashed border-gray-200 bg-white p-12 text-center text-gray-500 shadow-sm">
                  <Search className="mx-auto mb-4 h-12 w-12 opacity-20" />
                  <h2 className="text-lg font-semibold text-gray-800">输入关键词开始检索</h2>
                  <p className="mt-3 text-sm leading-7">
                    当前支持按知识库、文件类型和更新时间筛选，结果会继续遵循权限过滤，并优先展示 chunk 级命中片段。
                  </p>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
