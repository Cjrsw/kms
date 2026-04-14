import Link from "next/link";
import { ChevronLeft, ChevronRight, FileText, Filter, Search, User } from "lucide-react";

import { AuthorAutocompleteInput } from "../../components/author-autocomplete-input";
import { AppShell } from "../../components/app-shell";
import {
  getRepositories,
  getSearchAuthorSuggestions,
  getSearchResults,
  getSearchSuggestions,
} from "../../lib/api";
import { requireCurrentUser } from "../../lib/auth";

type SearchPageProps = {
  searchParams: Promise<{
    q?: string;
    repository_slug?: string;
    author?: string;
    file_type?: string;
    date_from?: string;
    date_to?: string;
    sort_by?: string;
    page?: string;
    page_size?: string;
  }>;
};

const PAGE_SIZE_OPTIONS = [10, 20, 50];

function toPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function buildSearchHref(params: Record<string, string | number | undefined | null>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || String(value).trim() === "") {
      return;
    }
    query.set(key, String(value));
  });
  return `/search?${query.toString()}`;
}

function humanizeFileType(fileType: "all" | "note" | "pdf" | "docx"): string {
  if (fileType === "note") return "无附件笔记";
  if (fileType === "pdf") return "PDF";
  if (fileType === "docx") return "DOCX";
  return "全部";
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const sp = await searchParams;
  const normalizedQuery = (sp.q || "").trim();
  const repositorySlug = (sp.repository_slug || "").trim() || undefined;
  const author = (sp.author || "").trim();
  const fileType = (sp.file_type || "all") as "all" | "note" | "pdf" | "docx";
  const dateFrom = (sp.date_from || "").trim();
  const dateTo = (sp.date_to || "").trim();
  const sortBy = (sp.sort_by || "relevance") as "relevance" | "updated_desc" | "updated_asc";
  const pageSizeRaw = toPositiveInt(sp.page_size, 10);
  const pageSize = PAGE_SIZE_OPTIONS.includes(pageSizeRaw) ? pageSizeRaw : 10;
  const page = toPositiveInt(sp.page, 1);

  const [currentUser, repositories, searchResponse, suggestions, authorSuggestions] = await Promise.all([
    requireCurrentUser(),
    getRepositories(),
    getSearchResults({
      q: normalizedQuery,
      repository_slug: repositorySlug,
      author: author || undefined,
      file_type: fileType,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      sort_by: sortBy,
      page,
      page_size: pageSize,
    }),
    normalizedQuery ? getSearchSuggestions(normalizedQuery, repositorySlug) : Promise.resolve([]),
    getSearchAuthorSuggestions(author || undefined, repositorySlug),
  ]);

  const totalPages = Math.max(1, Math.ceil(searchResponse.total / pageSize));
  const safePage = Math.min(page, totalPages);
  const hasPrevPage = safePage > 1;
  const hasNextPage = safePage < totalPages;
  const repositoryName = repositories.find((repo) => repo.slug === repositorySlug)?.name;

  const baseParams = {
    q: normalizedQuery || undefined,
    repository_slug: repositorySlug,
    author: author || undefined,
    file_type: fileType !== "all" ? fileType : undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    sort_by: sortBy !== "relevance" ? sortBy : undefined,
    page_size: pageSize !== 10 ? pageSize : undefined,
  };

  return (
    <AppShell
      currentUser={currentUser}
      title="全文检索"
      description="支持关键词检索、分页、排序与多条件筛选；结果会按当前账号权限自动过滤。"
    >
      <div className="flex min-h-full flex-1 overflow-hidden bg-white">
        <form className="flex flex-1 flex-col" method="get">
          <div className="h-20 flex-shrink-0 border-b border-gray-200 bg-white px-8 shadow-sm">
            <div className="flex h-full items-center">
              <div className="relative w-full max-w-4xl">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                  className="h-12 w-full rounded-lg border border-gray-300 bg-gray-50 pl-12 pr-24 text-base outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500"
                  defaultValue={normalizedQuery}
                  list={suggestions.length > 0 ? "search-suggest-list" : undefined}
                  name="q"
                  placeholder="搜索笔记标题、正文、PDF/DOCX 正文..."
                  type="text"
                />
                <input name="page" type="hidden" value="1" />
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                  type="submit"
                >
                  搜索
                </button>
                {suggestions.length > 0 ? (
                  <datalist id="search-suggest-list">
                    {suggestions.map((item) => (
                      <option key={item} value={item} />
                    ))}
                  </datalist>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-1 overflow-hidden">
            <aside className="w-[300px] flex-shrink-0 border-r border-gray-200 bg-white">
              <div className="h-full overflow-y-auto p-6">
                <div className="mb-6 flex items-center border-b border-gray-100 pb-4 text-sm font-bold text-gray-800">
                  <Filter className="mr-2 h-4 w-4" />
                  筛选条件
                </div>
                <input name="page" type="hidden" value="1" />

                <div className="mb-6">
                  <h3 className="mb-2 text-sm font-semibold text-gray-700">知识库</h3>
                  <select
                    className="block w-full cursor-pointer rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-700 outline-none transition-colors hover:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    defaultValue={repositorySlug || ""}
                    name="repository_slug"
                  >
                    <option value="">全部知识库</option>
                    {repositories.map((repo) => (
                      <option key={repo.slug} value={repo.slug}>
                        {repo.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-6">
                  <h3 className="mb-2 text-sm font-semibold text-gray-700">文件类型</h3>
                  <select
                    className="block w-full cursor-pointer rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-700 outline-none transition-colors hover:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    defaultValue={fileType}
                    name="file_type"
                  >
                    <option value="all">全部</option>
                    <option value="note">无附件笔记</option>
                    <option value="pdf">PDF</option>
                    <option value="docx">DOCX</option>
                  </select>
                </div>

                <div className="mb-6">
                  <h3 className="mb-2 text-sm font-semibold text-gray-700">发布人员</h3>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <User className="h-4 w-4 text-gray-400" />
                    </div>
                    <AuthorAutocompleteInput
                      defaultValue={author}
                      name="author"
                      placeholder="输入发布人员姓名（支持模糊联想）"
                      suggestions={authorSuggestions}
                    />
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="mb-2 text-sm font-semibold text-gray-700">时间范围</h3>
                  <div className="grid gap-2">
                    <input
                      className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 outline-none transition-colors hover:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                      defaultValue={dateFrom}
                      name="date_from"
                      type="date"
                    />
                    <input
                      className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 outline-none transition-colors hover:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                      defaultValue={dateTo}
                      name="date_to"
                      type="date"
                    />
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="mb-2 text-sm font-semibold text-gray-700">排序方式</h3>
                  <select
                    className="block w-full cursor-pointer rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-700 outline-none transition-colors hover:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    defaultValue={sortBy}
                    name="sort_by"
                  >
                    <option value="relevance">相关度优先</option>
                    <option value="updated_desc">更新时间（新到旧）</option>
                    <option value="updated_asc">更新时间（旧到新）</option>
                  </select>
                </div>

                <div className="mb-8">
                  <h3 className="mb-2 text-sm font-semibold text-gray-700">每页条数</h3>
                  <select
                    className="block w-full cursor-pointer rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-700 outline-none transition-colors hover:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    defaultValue={String(pageSize)}
                    name="page_size"
                  >
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size} 条
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                  type="submit"
                >
                  应用筛选
                </button>
              </div>
            </aside>

            <section className="relative flex flex-1 bg-gray-50 p-8">
              {normalizedQuery || repositorySlug || fileType !== "all" || author || dateFrom || dateTo ? (
                <div className="mx-auto w-full max-w-4xl">
                  <div className="mb-5 flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-gray-800">搜索结果</h2>
                      <p className="mt-1 text-sm text-gray-500">
                        {normalizedQuery
                          ? `关键词“${normalizedQuery}”，共 ${searchResponse.total} 条，当前第 ${safePage}/${totalPages} 页。`
                          : `未输入关键词，共 ${searchResponse.total} 条筛选结果，当前第 ${safePage}/${totalPages} 页。`}
                      </p>
                    </div>
                  </div>

                  <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span className="rounded-full border border-gray-200 bg-white px-3 py-1">知识库：{repositoryName || "全部"}</span>
                    <span className="rounded-full border border-gray-200 bg-white px-3 py-1">文件类型：{humanizeFileType(fileType)}</span>
                    <span className="rounded-full border border-gray-200 bg-white px-3 py-1">发布人员：{author || "全部"}</span>
                    <span className="rounded-full border border-gray-200 bg-white px-3 py-1">
                      时间：{dateFrom || "不限"} ~ {dateTo || "不限"}
                    </span>
                  </div>

                  {searchResponse.items.length > 0 ? (
                    <div className="space-y-4">
                      {searchResponse.items.map((result) => (
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
                            className="text-sm leading-7 text-gray-600 [&_em]:rounded-sm [&_em]:bg-amber-200 [&_em]:px-1 [&_em]:font-semibold [&_em]:not-italic [&_em]:text-amber-900 [&_mark]:rounded-sm [&_mark]:bg-amber-200 [&_mark]:px-1 [&_mark]:font-semibold [&_mark]:text-amber-900"
                            dangerouslySetInnerHTML={{ __html: result.snippet }}
                          />
                          <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4 text-xs text-gray-500">
                            <span>发布：{result.author_name || "系统"}</span>
                            <span>{new Date(result.updated_at).toLocaleString("zh-CN", { hour12: false })}</span>
                            <span>{result.attachment_count} 个附件</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center text-gray-400">
                      <FileText className="mx-auto mb-4 h-10 w-10 opacity-30" />
                      <p>没有找到你当前权限范围内匹配“{normalizedQuery}”的结果。</p>
                    </div>
                  )}

                  {searchResponse.total > 0 ? (
                    <div className="mt-6 flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm">
                      <span className="text-gray-500">
                        共 {searchResponse.total} 条 · 第 {safePage} / {totalPages} 页
                      </span>
                      <div className="flex items-center gap-2">
                        <Link
                          className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 ${
                            hasPrevPage
                              ? "border-gray-300 text-gray-700 hover:bg-gray-50"
                              : "cursor-not-allowed border-gray-200 text-gray-300"
                          }`}
                          href={hasPrevPage ? buildSearchHref({ ...baseParams, page: safePage - 1 }) : "#"}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          上一页
                        </Link>
                        <Link
                          className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 ${
                            hasNextPage
                              ? "border-gray-300 text-gray-700 hover:bg-gray-50"
                              : "cursor-not-allowed border-gray-200 text-gray-300"
                          }`}
                          href={hasNextPage ? buildSearchHref({ ...baseParams, page: safePage + 1 }) : "#"}
                        >
                          下一页
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="m-auto max-w-xl text-center text-gray-400">
                  <Search className="mx-auto mb-4 h-12 w-12 opacity-20" />
                  <p className="text-base">
                    输入关键词开始检索。现在支持分页、排序、时间、文件类型、知识库、发布人员筛选，并提供基础搜索建议。
                  </p>
                  <div className="mt-4 text-sm text-gray-500">
                    <p>试试：考勤、制度、kaoqin、hr、系统管理员</p>
                  </div>
                </div>
              )}
            </section>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
