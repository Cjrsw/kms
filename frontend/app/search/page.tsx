import Link from "next/link";
import { FileText, Filter, Search, User } from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { getSearchResults } from "../../lib/api";
import { requireCurrentUser } from "../../lib/auth";

const mockAuthors = ["张三（HR）", "李四（财务）", "曹操（研发部）", "曹丕（市场部）"];

type SearchPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q = "" } = await searchParams;
  const normalizedQuery = q.trim();
  const [currentUser, results] = await Promise.all([
    requireCurrentUser(),
    normalizedQuery ? getSearchResults(normalizedQuery) : Promise.resolve([])
  ]);

  return (
    <AppShell
      contentClassName=""
      currentUser={currentUser}
      title="全文检索"
      description="这一页沿用原型里的顶部检索框加左侧筛选栏布局，后续会把这些条件映射到 Elasticsearch 查询。"
    >
      <div className="flex min-h-full flex-1 overflow-hidden bg-white">
        <div className="flex flex-1 flex-col">
          <div className="h-20 flex-shrink-0 border-b border-gray-200 bg-white px-8 shadow-sm">
            <div className="flex h-full items-center">
              <form className="relative w-full max-w-3xl">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                  className="h-12 w-full rounded-lg border border-gray-300 bg-gray-50 pl-12 pr-24 text-base outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500"
                  defaultValue={normalizedQuery}
                  name="q"
                  placeholder="搜索全站文档、笔记、PDF、DOCX 内容..."
                  type="text"
                />
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                  type="submit"
                >
                  搜索
                </button>
              </form>
            </div>
          </div>

          <div className="flex flex-1 overflow-hidden">
            <aside className="w-[280px] flex-shrink-0 border-r border-gray-200 bg-white">
              <div className="h-full overflow-y-auto p-6">
                <div className="mb-6 flex items-center justify-between border-b border-gray-100 pb-4 text-sm font-bold text-gray-800">
                  <div className="flex items-center">
                    <Filter className="mr-2 h-4 w-4" />
                    筛选条件
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="mb-2 text-sm font-semibold text-gray-700">所属组织 / 知识库</h3>
                  <select className="block w-full cursor-pointer rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-700 outline-none transition-colors hover:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500">
                    <option>全部组织</option>
                    <option>人力资源部</option>
                    <option>产品研发部</option>
                    <option>运营支持部</option>
                  </select>
                </div>

                <div className="mb-6">
                  <h3 className="mb-2 text-sm font-semibold text-gray-700">文件类型</h3>
                  <select className="block w-full cursor-pointer rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-700 outline-none transition-colors hover:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500">
                    <option>全部格式</option>
                    <option>在线笔记</option>
                    <option>PDF 文档</option>
                    <option>Word (.docx)</option>
                  </select>
                </div>

                <div className="mb-6">
                  <h3 className="mb-2 text-sm font-semibold text-gray-700">发布时间</h3>
                  <select className="block w-full cursor-pointer rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-700 outline-none transition-colors hover:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500">
                    <option>不限时间</option>
                    <option>近一天</option>
                    <option>近一周</option>
                    <option>近一月</option>
                    <option>近一年</option>
                  </select>
                </div>

                <div className="mb-6">
                  <h3 className="mb-2 text-sm font-semibold text-gray-700">发布人员</h3>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <User className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      className="block w-full rounded-lg border border-gray-300 bg-gray-50 py-2.5 pl-9 pr-3 text-sm text-gray-700 outline-none transition-colors hover:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                      placeholder="输入姓名进行联想"
                      type="text"
                    />
                  </div>

                  <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                    {mockAuthors.map((author) => (
                      <div
                        key={author}
                        className="flex items-center px-3 py-2.5 text-sm text-gray-700 transition-colors hover:bg-blue-50 hover:text-blue-700"
                      >
                        <div className="mr-2 flex h-5 w-5 items-center justify-center rounded bg-blue-100 text-xs font-bold text-blue-600">
                          {author[0]}
                        </div>
                        {author}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </aside>

            <section className="relative flex flex-1 bg-gray-50 p-8">
              <div className="absolute left-5 top-5">
                <button
                  className="flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-blue-50 hover:text-blue-600"
                  type="button"
                >
                  <Filter className="mr-2 h-4 w-4" />
                  筛选
                </button>
              </div>

              {normalizedQuery ? (
                <div className="mx-auto w-full max-w-4xl pt-10">
                  <div className="mb-5 flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-gray-800">搜索结果</h2>
                      <p className="mt-1 text-sm text-gray-500">
                        关键词 “{normalizedQuery}”，当前返回 {results.length} 条可见结果。
                      </p>
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
                      <p>没有找到你当前权限范围内匹配 “{normalizedQuery}” 的结果。</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="m-auto max-w-xl text-center text-gray-400">
                  <Search className="mx-auto mb-4 h-12 w-12 opacity-20" />
                  <p className="text-base">输入关键词开始检索，后续会支持拼音匹配、同义词扩展和权限过滤后的高亮结果。</p>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
