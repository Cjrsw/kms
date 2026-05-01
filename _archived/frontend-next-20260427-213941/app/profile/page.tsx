import type { ReactNode } from "react";
import Link from "next/link";
import { Heart, KeyRound, PencilLine, ShieldAlert, Star } from "lucide-react";

import { AppShell } from "../../components/app-shell";
import { requireCurrentUser } from "../../lib/auth";
import { getMyFavorites } from "../../lib/api";

export default async function ProfilePage() {
  const currentUser = await requireCurrentUser();
  const favorites = await getMyFavorites();
  const avatarUrl = currentUser.has_avatar_upload ? "/api/profile/avatar" : null;

  return (
    <AppShell
      contentClassName="p-8"
      currentUser={currentUser}
      title="个人中心"
      description="查看个人信息、收藏与账号设置入口。"
    >
      <div className="mx-auto max-w-5xl space-y-6">
        {currentUser.need_password_change ? (
          <div className="flex items-center rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <ShieldAlert className="mr-2 h-4 w-4 flex-shrink-0" />
            当前仍在使用默认密码，请尽快前往“修改密码”完成更新。
          </div>
        ) : null}

        <section className="grid gap-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:grid-cols-[1.2fr,0.8fr]">
          <div className="flex items-start gap-5">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100">
              {avatarUrl ? (
                <img alt={`${currentUser.full_name} avatar`} className="h-full w-full object-cover" src={avatarUrl} />
              ) : (
                <span className="text-3xl font-bold text-slate-500">{currentUser.full_name.slice(0, 1)}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold text-slate-900">{currentUser.full_name}</h1>
              <p className="mt-1 text-sm text-slate-500">{currentUser.username}</p>
              <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                <div>部门：{currentUser.department_name || "未设置"}</div>
                <div>职位：{currentUser.position || "未设置"}</div>
                <div>电话：{currentUser.phone || "未设置"}</div>
                <div>邮箱：{currentUser.email || "未设置"}</div>
                <div>性别：{currentUser.gender || "未设置"}</div>
                <div>密级：L{currentUser.clearance_level}</div>
              </div>
              <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                简介：{currentUser.bio || "暂无个人简介"}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <ProfileActionCard
              href="/profile/edit"
              icon={<PencilLine className="h-5 w-5 text-blue-600" />}
              title="修改个人资料"
              description="编辑手机号、邮箱、职位、性别、简介与头像。"
            />
            <ProfileActionCard
              href="/profile/password"
              icon={<KeyRound className="h-5 w-5 text-slate-700" />}
              title="修改密码"
              description="更新登录密码，修改后会重新登录。"
            />
            <ProfileActionCard
              href="/profile/favorites"
              icon={<Star className="h-5 w-5 text-amber-500" />}
              title="收藏列表"
              description={`查看已收藏笔记，当前共 ${favorites.total} 篇。`}
            />
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">最近收藏</h2>
              <p className="mt-1 text-sm text-slate-500">点击即可直接进入笔记详情。</p>
            </div>
            <Link className="text-sm font-medium text-blue-600 hover:text-blue-700" href="/profile/favorites">
              查看全部
            </Link>
          </div>

          {favorites.items.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-sm text-slate-500">
              暂无收藏笔记。
            </div>
          ) : (
            <div className="mt-6 grid gap-3">
              {favorites.items.slice(0, 5).map((item) => (
                <Link
                  key={item.note_id}
                  href={item.href}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-4 transition-colors hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">{item.title}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {item.repository_name} · {item.author_name} · L{item.clearance_level}
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

function ProfileActionCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition-colors hover:border-slate-300 hover:bg-slate-100"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-sm">{icon}</div>
        <div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <div className="mt-1 text-xs leading-5 text-slate-500">{description}</div>
        </div>
      </div>
    </Link>
  );
}
