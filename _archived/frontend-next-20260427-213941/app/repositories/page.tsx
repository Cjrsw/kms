import Link from "next/link";
import { Clock, Layers3, FileText, ChevronRight } from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { ParallaxCover } from "../../components/parallax-cover";
import { getRepositories } from "../../lib/api";
import { requireCurrentUser } from "../../lib/auth";

const headerColors: Record<string, string> = {
  hr: "bg-gradient-to-br from-rose-500 to-rose-700",
  rnd: "bg-gradient-to-br from-indigo-600 to-blue-800",
  ops: "bg-gradient-to-br from-emerald-500 to-teal-700"
};

function resolveRepositoryCoverImage(repo: { slug: string; cover_image_url: string; has_cover_image_upload: boolean }): string | undefined {
  if (repo.has_cover_image_upload) {
    return `/api/repositories/${repo.slug}/cover`;
  }
  return repo.cover_image_url || undefined;
}

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
      description="汇聚企业核心知识库，您可以在此查阅各领域的文档与规范。"
    >
      <div className="mb-8 flex items-center justify-between">
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">企业知识仓库</h2>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {repositories.map((repo) => (
          <Link
            href={`/repositories/${repo.slug}`}
            key={repo.slug}
            className="group block h-full outline-none"
          >
            <ParallaxCover 
              coverUrl={resolveRepositoryCoverImage(repo)} 
              fallbackClass={headerColors[repo.slug] ?? "bg-gradient-to-br from-slate-700 to-slate-900"}
              className="flex flex-col h-[400px] rounded-3xl shadow-soft hover:shadow-floating transition-shadow duration-300 ring-1 ring-black/5"
            >
              <div className="flex flex-col h-full p-8">
                
                {/* 顶部：仓库名称与徽章 */}
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-white/10 backdrop-blur-md rounded-xl text-white shadow-sm ring-1 ring-white/20 group-hover:scale-110 transition-transform">
                      <Layers3 className="h-5 w-5" />
                    </div>
                    <h3 className="text-2xl font-bold text-white tracking-tight drop-shadow-md transition-colors group-hover:text-indigo-100">
                      {repo.name}
                    </h3>
                  </div>
                  <span className="shrink-0 rounded-full bg-white/10 backdrop-blur-md px-3 py-1.5 text-xs font-bold text-white ring-1 ring-inset ring-white/20 drop-shadow-sm">
                    L{repo.min_clearance_level} 密级
                  </span>
                </div>

                {/* 描述信息 */}
                <p className="text-sm font-medium leading-relaxed text-slate-200/90 drop-shadow line-clamp-2 mb-auto">
                  {repo.description}
                </p>

                {/* 底部区：最新笔记与统计数据 */}
                <div className="mt-8 border-t border-white/10 pt-6">
                  {repo.latest_notes.length > 0 ? (
                    <ul className="mb-5 space-y-3">
                      {repo.latest_notes.map((item) => (
                        <li key={`${repo.slug}-${item.id}`} className="flex items-center justify-between gap-3 text-sm">
                          <div className="flex min-w-0 flex-1 items-center font-medium text-slate-200 transition-colors group-hover/item:text-white">
                            <FileText className="mr-2.5 h-4 w-4 shrink-0 text-slate-400 group-hover/item:text-indigo-300" />
                            <span className="truncate drop-shadow-sm">{item.title}</span>
                          </div>
                          <span className="shrink-0 text-xs font-semibold text-slate-400 drop-shadow-sm">
                            {formatRecentAge(item.created_at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mb-5 flex h-[72px] items-center justify-center rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
                      <p className="text-sm font-medium text-slate-400">暂无笔记内容</p>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-1.5 text-slate-300 font-medium bg-white/10 px-3 py-1.5 rounded-lg backdrop-blur-sm">
                      <Clock className="h-4 w-4" />
                      <span>{repo.note_count} 篇文档 / {repo.folder_count} 个目录</span>
                    </div>
                    <span className="flex items-center gap-1 text-sm font-bold text-white opacity-80 group-hover:opacity-100 transition-opacity">
                      立即访问 <ChevronRight className="h-4 w-4" />
                    </span>
                  </div>
                </div>

              </div>
            </ParallaxCover>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
