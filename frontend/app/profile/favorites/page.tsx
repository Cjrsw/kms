import Link from "next/link";
import { ChevronLeft, Heart } from "lucide-react";

import { AppShell } from "../../../components/app-shell";
import { requireCurrentUser } from "../../../lib/auth";
import { getMyFavorites } from "../../../lib/api";

export default async function FavoriteNotesPage() {
  const currentUser = await requireCurrentUser();
  const favorites = await getMyFavorites();

  return (
    <AppShell
      contentClassName="p-8"
      currentUser={currentUser}
      title="收藏列表"
      description="查看已收藏的知识笔记。"
    >
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href="/profile" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-700">
          <ChevronLeft className="h-4 w-4" />
          返回个人中心
        </Link>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">我的收藏</h2>
              <p className="mt-1 text-sm text-slate-500">当前共收藏 {favorites.total} 篇笔记。</p>
            </div>
          </div>

          {favorites.items.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-sm text-slate-500">
              暂无收藏笔记。
            </div>
          ) : (
            <div className="mt-6 grid gap-3">
              {favorites.items.map((item) => (
                <Link
                  key={item.note_id}
                  href={item.href}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-4 transition-colors hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">{item.title}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {item.repository_name} · {item.author_name} · L{item.clearance_level} · {new Date(item.updated_at).toLocaleString("zh-CN", { hour12: false })}
                    </div>
                  </div>
                  <Heart className="h-4 w-4 shrink-0 text-rose-500" />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
