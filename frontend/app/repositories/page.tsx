import Link from "next/link";
import { Clock } from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { getRepositories } from "../../lib/api";
import { requireCurrentUser } from "../../lib/auth";

const headerColors: Record<string, string> = {
  hr: "bg-blue-800",
  rnd: "bg-indigo-900",
  ops: "bg-sky-700"
};

function formatRecentAge(createdAt: string): string {
  const createdMs = new Date(createdAt).getTime();
  const diffMs = Date.now() - createdMs;
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  return `${diffHours} 小时前`;
}

export default async function RepositoriesPage() {
  const [currentUser, repositories] = await Promise.all([requireCurrentUser(), getRepositories()]);

  return (
    <AppShell
      currentUser={currentUser}
      title="知识仓库"
      description="沿用原型里的白底卡片加彩色头图布局，当前仓库列表已经改为由 FastAPI 实时提供数据。"
    >
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">所有知识仓库</h2>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {repositories.map((repo) => (
          <div
            key={repo.slug}
            className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
          >
            <div
              className={`relative h-24 flex-shrink-0 transition-transform duration-500 group-hover:scale-105 ${
                headerColors[repo.slug] ?? "bg-slate-700"
              }`}
            />

            <div className="z-10 flex flex-1 flex-col bg-white p-5">
              <div className="mb-2 flex items-start justify-between gap-3">
                <Link href={`/repositories/${repo.slug}`} className="text-lg font-bold text-gray-800 hover:text-blue-700">
                  {repo.name}
                </Link>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                  L{repo.min_clearance_level}
                </span>
              </div>

              <p className="mb-4 flex-1 text-sm leading-6 text-gray-500">{repo.description}</p>

              <div className="border-t border-gray-100 pt-4">
                {repo.latest_notes.length > 0 ? (
                  <ul className="space-y-2">
                    {repo.latest_notes.map((item) => (
                      <li key={`${repo.slug}-${item.id}`} className="flex items-center justify-between gap-3 text-sm group/item">
                        <Link
                          href={`/repositories/${repo.slug}/notes/${item.id}`}
                          className="flex min-w-0 items-center text-gray-600 transition-colors group-hover/item:text-blue-600 hover:text-blue-600"
                        >
                          <span className="mr-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300" />
                          <span className="truncate">{item.title}</span>
                        </Link>
                        <span className="shrink-0 text-xs text-gray-400">{formatRecentAge(item.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <ul className={`${repo.latest_notes.length > 0 ? "mt-2" : ""} space-y-2`}>
                  <li className="flex items-center justify-between pt-1 text-sm text-gray-500">
                    <div className="flex items-center">
                      <Clock className="mr-2 h-3.5 w-3.5 text-gray-400" />
                      <span>{repo.note_count} 篇文档</span>
                    </div>
                    <Link href={`/repositories/${repo.slug}`} className="text-xs text-gray-400 hover:text-blue-600">
                      进入详情
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
