import Link from "next/link";
import { Clock } from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { getRepositories } from "../../lib/api";

const headerColors: Record<string, string> = {
  hr: "bg-blue-800",
  rnd: "bg-indigo-900",
  ops: "bg-sky-700"
};

const recentItemsByRepo: Record<string, Array<{ title: string; time: string }>> = {
  hr: [
    { title: "员工制度与考勤规范", time: "3 分钟前" },
    { title: "培训与招聘流程", time: "5 分钟前" }
  ],
  rnd: [
    { title: "技术方案与设计评审", time: "8 分钟前" },
    { title: "架构复盘与沉淀", time: "12 分钟前" }
  ],
  ops: [
    { title: "客服 FAQ 与 SOP", time: "6 分钟前" },
    { title: "活动复盘与投放记录", time: "10 分钟前" }
  ]
};

export default async function RepositoriesPage() {
  const repositories = await getRepositories();

  return (
    <AppShell
      title="知识仓库"
      description="沿用原型里的白底卡片加彩色头图布局，当前仓库列表已经改为由 FastAPI 实时提供数据。"
    >
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">所有知识仓库</h2>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {repositories.map((repo) => (
          <Link
            key={repo.slug}
            href={`/repositories/${repo.slug}`}
            className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
          >
            <div
              className={`relative h-24 flex-shrink-0 transition-transform duration-500 group-hover:scale-105 ${
                headerColors[repo.slug] ?? "bg-slate-700"
              }`}
            />

            <div className="z-10 flex flex-1 flex-col bg-white p-5">
              <div className="mb-2 flex items-start justify-between gap-3">
                <h3 className="text-lg font-bold text-gray-800">{repo.name}</h3>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                  L{repo.min_clearance_level}
                </span>
              </div>

              <p className="mb-4 flex-1 text-sm leading-6 text-gray-500">{repo.description}</p>

              <div className="border-t border-gray-100 pt-4">
                <ul className="space-y-2">
                  {(recentItemsByRepo[repo.slug] ?? []).map((item) => (
                    <li key={`${repo.slug}-${item.title}`} className="flex items-center justify-between text-sm group/item">
                      <div className="flex items-center text-gray-600 transition-colors group-hover/item:text-blue-600">
                        <span className="mr-2 h-1.5 w-1.5 rounded-full bg-gray-300" />
                        <span className="max-w-[150px] truncate">{item.title}</span>
                      </div>
                      <span className="text-xs text-gray-400">{item.time}</span>
                    </li>
                  ))}
                  <li className="flex items-center justify-between pt-1 text-sm text-gray-500">
                    <div className="flex items-center">
                      <Clock className="mr-2 h-3.5 w-3.5 text-gray-400" />
                      <span>{repo.note_count} 篇文档</span>
                    </div>
                    <span className="text-xs text-gray-400">进入详情</span>
                  </li>
                </ul>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
