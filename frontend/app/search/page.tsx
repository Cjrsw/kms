import Link from "next/link";
import { clsx } from "clsx";
import { ChevronLeft, ChevronRight, FileText, Filter, Search, User, FolderArchive, Clock, SortAsc } from "lucide-react";

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
      contentClassName="p-0"
    >
      <div className="flex h-full flex-col bg-slate-50">
        <form className="flex h-full flex-col overflow-hidden" method="get">
          <div className="z-10 flex h-24 flex-shrink-0 items-center border-b border-slate-200/60 bg-white/80 px-4 backdrop-blur-md lg:px-8">
            <div className="relative mx-auto w-full max-w-5xl">
              <Search className="absolute left-5 top-1/2 h-6 w-6 -translate-y-1/2 text-indigo-500" />
              <input
                className="h-14 w-full rounded-2xl border-none bg-white py-0 pl-14 pr-28 text-lg font-medium text-slate-800 shadow-soft outline-none transition-all placeholder:font-normal placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:shadow-floating"
                defaultValue={normalizedQuery}
                list={suggestions.length > 0 ? "search-suggest-list" : undefined}
                name="q"
                placeholder="搜索笔记标题、正文、PDF/DOCX 等文档..."
                type="text"
              />
              <input name="page" type="hidden" value="1" />
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-indigo-600 px-6 py-2 text-sm font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-indigo-700 hover:shadow-md active:scale-95"
                type="submit"
              >
                搜索
              </button>
              {suggestions.length > 0 && (
                <datalist id="search-suggest-list">
                  {suggestions.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              )}
            </div>
          </div>

          <div className="flex flex-1 overflow-hidden">
            <aside className="w-[300px] flex-shrink-0 border-r border-slate-200/60 bg-slate-50/50 backdrop-blur-sm hidden md:block">
              <div className="h-full overflow-y-auto custom-scrollbar p-6">
                <div className="mb-6 flex items-center border-b border-slate-200/60 pb-4 text-sm font-bold uppercase tracking-wider text-slate-600">
                  <Filter className="mr-2 h-4 w-4 text-indigo-500" />
                  精细化筛选
                </div>
                <input name="page" type="hidden" value="1" />

                <div className="mb-6">
                  <h3 className="mb-2.5 flex items-center text-sm font-semibold text-slate-700">
                    <FolderArchive className="mr-2 h-4 w-4 text-slate-400" />
                    知识仓库
                  </h3>
                  <select
                    className="input-field w-full cursor-pointer"
                    defaultValue={repositorySlug || ""}
                    name="repository_slug"
                  >
                    <option value="">全部分类</option>
                    {repositories.map((repo) => (
                      <option key={repo.slug} value={repo.slug}>
                        {repo.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-6">
                  <h3 className="mb-2.5 flex items-center text-sm font-semibold text-slate-700">
                    <FileText className="mr-2 h-4 w-4 text-slate-400" />
                    文档类型
                  </h3>
                  <select
                    className="input-field w-full cursor-pointer"
                    defaultValue={fileType}
                    name="file_type"
                  >
                    <option value="all">不限类型</option>
                    <option value="note">纯文本笔记</option>
                    <option value="pdf">PDF 附件</option>
                    <option value="docx">DOCX 文档</option>
                  </select>
                </div>

                <div className="mb-6">
                  <h3 className="mb-2.5 flex items-center text-sm font-semibold text-slate-700">
                    <User className="mr-2 h-4 w-4 text-slate-400" />
                    贡献者
                  </h3>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <Search className="h-4 w-4 text-slate-400" />
                    </div>
                    <div className="[&>input]:input-field [&>input]:w-full [&>input]:pl-9">
                      <AuthorAutocompleteInput
                        defaultValue={author}
                        name="author"
                        placeholder="输入人名或拼音"
                        suggestions={authorSuggestions}
                      />
                    </div>
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="mb-2.5 flex items-center text-sm font-semibold text-slate-700">
                    <Clock className="mr-2 h-4 w-4 text-slate-400" />
                    修改时间
                  </h3>
                  <div className="grid gap-2">
                    <input
                      className="input-field"
                      defaultValue={dateFrom}
                      name="date_from"
                      type="date"
                    />
                    <input
                      className="input-field"
                      defaultValue={dateTo}
                      name="date_to"
                      type="date"
                    />
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="mb-2.5 flex items-center text-sm font-semibold text-slate-700">
                    <SortAsc className="mr-2 h-4 w-4 text-slate-400" />
                    结果排序
                  </h3>
                  <select
                    className="input-field w-full cursor-pointer"
                    defaultValue={sortBy}
                    name="sort_by"
                  >
                    <option value="relevance">综合相关度优先</option>
                    <option value="updated_desc">最新更新优先</option>
                    <option value="updated_asc">最早更新优先</option>
                  </select>
                </div>

                <div className="mb-8">
                  <h3 className="mb-2.5 flex items-center text-sm font-semibold text-slate-700">
                    每页展示
                  </h3>
                  <select
                    className="input-field w-full cursor-pointer"
                    defaultValue={String(pageSize)}
                    name="page_size"
                  >
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size} 条 / 页
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  className="btn-secondary w-full"
                  type="submit"
                >
                  应用当前筛选条件
                </button>
              </div>
            </aside>

            <section className="relative flex flex-1 overflow-y-auto custom-scrollbar bg-slate-50 p-4 lg:p-8">
              {normalizedQuery || repositorySlug || fileType !== "all" || author || dateFrom || dateTo ? (
                <div className="mx-auto w-full max-w-4xl">
                  <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
                        {searchResponse.total > 0 ? "检索结果" : "未匹配到内容"}
                      </h2>
                      <p className="mt-1.5 text-sm font-medium text-slate-500">
                        {normalizedQuery
                          ? `找到与“${normalizedQuery}”相关的 ${searchResponse.total} 个文档，当前第 ${safePage}/${totalPages} 页。`
                          : `当前筛选条件共匹配 ${searchResponse.total} 个文档，当前第 ${safePage}/${totalPages} 页。`}
                      </p>
                    </div>
                  </div>

                  <div className="mb-8 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
                    {repositoryName && <span className="rounded-full border border-indigo-100 bg-indigo-50/50 px-3 py-1.5 text-indigo-700">知识库: {repositoryName}</span>}
                    {fileType !== "all" && <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">类型: {humanizeFileType(fileType)}</span>}
                    {author && <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">作者: {author}</span>}
                    {(dateFrom || dateTo) && (
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                        {dateFrom || "..."} 至 {dateTo || "..."}
                      </span>
                    )}
                  </div>

                  {searchResponse.items.length > 0 ? (
                    <div className="space-y-5">
                      {searchResponse.items.map((result) => (
                        <Link
                          key={`${result.repository_slug}-${result.note_id}`}
                          className="group block rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-indigo-300 hover:shadow-floating"
                          href={`/repositories/${result.repository_slug}/notes/${result.note_id}`}
                        >
                          <div className="mb-3 flex items-start justify-between gap-4">
                            <div>
                              <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-500">
                                {result.repository_name}
                              </p>
                              <h3 className="mt-1.5 text-xl font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">
                                {result.title}
                              </h3>
                            </div>
                            <span className="shrink-0 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700 ring-1 ring-inset ring-indigo-600/20">
                              L{result.clearance_level}
                            </span>
                          </div>
                          <p
                            className="text-sm leading-relaxed text-slate-600 [&_em]:rounded-sm [&_em]:bg-indigo-100 [&_em]:px-1 [&_em]:font-semibold [&_em]:not-italic [&_em]:text-indigo-900 [&_mark]:rounded-sm [&_mark]:bg-amber-200 [&_mark]:px-1 [&_mark]:font-semibold [&_mark]:text-amber-900"
                            dangerouslySetInnerHTML={{ __html: result.snippet }}
                          />
                          <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-xs font-medium text-slate-400">
                            <div className="flex items-center gap-4">
                              <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> {result.author_name || "System"}</span>
                              <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {new Date(result.updated_at).toLocaleString("zh-CN", { hour12: false })}</span>
                            </div>
                            {result.attachment_count > 0 && (
                              <span className="flex items-center gap-1.5 text-indigo-500"><FolderArchive className="h-3.5 w-3.5" /> {result.attachment_count} 个附件</span>
                            )}
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white/50 py-24 text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 mb-4">
                        <Search className="h-8 w-8 text-slate-400" />
                      </div>
                      <h3 className="text-lg font-bold text-slate-700">未找到相关结果</h3>
                      <p className="mt-2 text-sm text-slate-500 max-w-sm">
                        您当前的访问权限内，未能找到符合该条件的内容。尝试减少筛选条件或使用更宽泛的关键词。
                      </p>
                    </div>
                  )}

                  {searchResponse.total > 0 && (
                    <div className="mt-8 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                      <span className="text-sm font-medium text-slate-500">
                        共 {searchResponse.total} 条 · 第 {safePage} / {totalPages} 页
                      </span>
                      <div className="flex items-center gap-3">
                        <Link
                          className={clsx(
                            "inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-semibold transition-all",
                            hasPrevPage
                              ? "border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-indigo-600"
                              : "pointer-events-none border-slate-100 text-slate-300"
                          )}
                          href={hasPrevPage ? buildSearchHref({ ...baseParams, page: safePage - 1 }) : "#"}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          上一页
                        </Link>
                        <Link
                          className={clsx(
                            "inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-semibold transition-all",
                            hasNextPage
                              ? "border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-indigo-600"
                              : "pointer-events-none border-slate-100 text-slate-300"
                          )}
                          href={hasNextPage ? buildSearchHref({ ...baseParams, page: safePage + 1 }) : "#"}
                        >
                          下一页
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="m-auto flex max-w-xl flex-col items-center justify-center text-center animate-fade-in">
                  <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white shadow-soft mb-6 text-indigo-500">
                    <Search className="h-10 w-10" />
                  </div>
                  <h2 className="text-2xl font-extrabold text-slate-800">全库深度检索</h2>
                  <p className="mt-3 text-base text-slate-500 leading-relaxed">
                    在上方输入框输入关键词，支持搜索所有知识库的文章标题、正文、PDF/DOCX 附件正文。您还可以使用左侧面板进行精确筛选。
                  </p>
                  <div className="mt-8 flex flex-wrap justify-center gap-3 text-sm text-slate-500">
                    <span className="font-semibold text-slate-700">热门建议:</span>
                    <span className="cursor-pointer rounded-full bg-slate-200/50 px-3 py-1 hover:bg-slate-200 transition-colors">考勤制度</span>
                    <span className="cursor-pointer rounded-full bg-slate-200/50 px-3 py-1 hover:bg-slate-200 transition-colors">前端规范</span>
                    <span className="cursor-pointer rounded-full bg-slate-200/50 px-3 py-1 hover:bg-slate-200 transition-colors">入职指南</span>
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
