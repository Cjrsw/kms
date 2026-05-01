import { clsx } from "clsx";

import { AuthorAutocompleteInput } from "@/components/author-autocomplete-input";
import { SearchQueryBar } from "@/components/search-query-bar";
import {
  getRepositories,
  getSearchAuthorSuggestions,
  getSearchResults,
  getSearchSuggestions,
} from "@/lib/api";

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
  return "全部类型";
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
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

  const [repositories, searchResponse, suggestions, authorSuggestions] = await Promise.all([
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
  const hasActiveSearch = Boolean(normalizedQuery || repositorySlug || fileType !== "all" || author || dateFrom || dateTo);

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
    <form className="kms-search-layout" method="get">
      <aside className="kms-search-sidebar">
        <div className="kms-filter-group">
          <div className="kms-filter-group-title">
            <span className="title-icon" />
            知识仓库
          </div>
          <select className="kms-cyber-select" defaultValue={repositorySlug || ""} name="repository_slug">
            <option value="">全部分类</option>
            {repositories.map((repo) => (
              <option key={repo.slug} value={repo.slug}>
                {repo.name}
              </option>
            ))}
          </select>
        </div>

        <div className="kms-filter-group">
          <div className="kms-filter-group-title">
            <span className="title-icon" />
            文档类型
          </div>
          <select className="kms-cyber-select" defaultValue={fileType} name="file_type">
            <option value="all">不限类型</option>
            <option value="note">无附件笔记</option>
            <option value="pdf">PDF 附件</option>
            <option value="docx">DOCX 文档</option>
          </select>
        </div>

        <div className="kms-filter-group">
          <div className="kms-filter-group-title">
            <span className="title-icon" />
            发布人员
          </div>
          <AuthorAutocompleteInput
            defaultValue={author}
            name="author"
            placeholder="输入姓名关键字"
            suggestions={authorSuggestions}
          />
        </div>

        <div className="kms-filter-group">
          <div className="kms-filter-group-title">
            <span className="title-icon" />
            修改时间
          </div>
          <div className="kms-date-range">
            <input className="kms-cyber-input" defaultValue={dateFrom} name="date_from" type="date" />
            <span className="date-separator" />
            <input className="kms-cyber-input" defaultValue={dateTo} name="date_to" type="date" />
          </div>
        </div>

        <div className="kms-filter-group">
          <div className="kms-filter-group-title">
            <span className="title-icon" />
            结果排序
          </div>
          <select className="kms-cyber-select" defaultValue={sortBy} name="sort_by">
            <option value="relevance">综合相关度优先</option>
            <option value="updated_desc">最新修改优先</option>
            <option value="updated_asc">最早修改优先</option>
          </select>
        </div>

        <div className="kms-filter-group">
          <div className="kms-filter-group-title">
            <span className="title-icon" />
            每页展示
          </div>
          <select className="kms-cyber-select" defaultValue={String(pageSize)} name="page_size">
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size} 条 / 页
              </option>
            ))}
          </select>
        </div>

        <button className="kms-filter-apply-btn" type="submit">
          应用当前筛选条件
        </button>
      </aside>

      <section className="kms-search-main">
        <div className="kms-search-header-module">
          <div className="kms-search-title-en">GLOBAL SEARCH //</div>
          <SearchQueryBar currentQuery={normalizedQuery} suggestions={suggestions} />
        </div>

        <div className="kms-search-results-wrapper">
          <div className="kms-search-meta">
            <span>
              {hasActiveSearch
                ? normalizedQuery
                  ? `检索到 ${searchResponse.total} 条与 "${normalizedQuery}" 相关的结果`
                  : `当前筛选条件匹配 ${searchResponse.total} 条结果`
                : "输入关键词或使用左侧筛选条件开始检索"}
            </span>
            <span className="time-cost">
              PAGE {safePage}/{totalPages}
            </span>
          </div>

          {hasActiveSearch ? (
            <>
              <div className="kms-search-active-tags">
                {repositoryName ? <span>知识库: {repositoryName}</span> : null}
                {fileType !== "all" ? <span>类型: {humanizeFileType(fileType)}</span> : null}
                {author ? <span>发布人员: {author}</span> : null}
                {dateFrom || dateTo ? <span>{dateFrom || "..."} 至 {dateTo || "..."}</span> : null}
              </div>

              {searchResponse.items.length > 0 ? (
                <ul className="kms-search-results-list">
                  {searchResponse.items.map((result) => (
                    <li className="kms-search-result-item" key={`${result.repository_slug}-${result.note_id}`}>
                      <a className="kms-search-result-link" href={`/repositories/${result.repository_slug}/notes/${result.note_id}`}>
                        <div className="kms-result-icon" aria-hidden="true">
                          <div className="kms-icon-square" />
                          <div className="kms-icon-line" />
                        </div>
                        <div className="kms-result-content">
                          <div className="kms-result-title">{result.title}</div>
                          <div
                            className="kms-result-desc"
                            dangerouslySetInnerHTML={{ __html: result.snippet }}
                          />
                          <div className="kms-result-footer">
                            <span className="kms-result-tag">{result.repository_name}</span>
                            <span>更新于 {formatDateTime(result.updated_at)}</span>
                            <span>@{result.author_name || "System"}</span>
                            <span>L{result.clearance_level}</span>
                            {result.attachment_count > 0 ? <span>{result.attachment_count} 个附件</span> : null}
                          </div>
                        </div>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="kms-search-empty">
                  <div className="kms-empty-title">未找到相关结果</div>
                  <p>当前访问权限内没有符合条件的内容。可以减少筛选条件，或换一个更宽泛的关键词。</p>
                </div>
              )}
            </>
          ) : (
            <div className="kms-search-empty is-guide">
              <div className="kms-empty-title">全库深度检索</div>
              <p>支持搜索笔记标题、正文、PDF/DOCX 附件正文，并可按知识仓库、文档类型、发布人员和修改时间筛选。</p>
              <div className="kms-search-guide-chips">
                <span>考勤制度</span>
                <span>前端规范</span>
                <span>入职指南</span>
              </div>
            </div>
          )}

          {searchResponse.total > 0 ? (
            <div className="kms-search-pagination">
              <span>
                共 {searchResponse.total} 条 · 第 {safePage} / {totalPages} 页
              </span>
              <div>
                <a
                  className={clsx("kms-page-btn", !hasPrevPage && "disabled")}
                  href={hasPrevPage ? buildSearchHref({ ...baseParams, page: safePage - 1 }) : "#"}
                >
                  上一页
                </a>
                <a
                  className={clsx("kms-page-btn", !hasNextPage && "disabled")}
                  href={hasNextPage ? buildSearchHref({ ...baseParams, page: safePage + 1 }) : "#"}
                >
                  下一页
                </a>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </form>
  );
}
