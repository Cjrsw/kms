import Link from "next/link";
import { ChevronLeft, ShieldAlert } from "lucide-react";

import { ProfileAvatarInput } from "../../../components/profile-avatar-input";
import { AppShell } from "../../../components/app-shell";
import { requireCurrentUser } from "../../../lib/auth";
import { updateProfileAction } from "../actions";

type EditProfilePageProps = {
  searchParams?: Promise<{ saved?: string }>;
};

export default async function EditProfilePage({ searchParams }: EditProfilePageProps) {
  const currentUser = await requireCurrentUser();
  const query = searchParams ? await searchParams : undefined;
  const avatarUrl = currentUser.has_avatar_upload ? "/api/profile/avatar" : null;

  return (
    <AppShell
      contentClassName="p-8"
      currentUser={currentUser}
      title="修改个人资料"
      description="编辑个人资料与头像。"
    >
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href="/profile" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-700">
          <ChevronLeft className="h-4 w-4" />
          返回个人中心
        </Link>

        {query?.saved === "1" ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            个人资料已保存。
          </div>
        ) : null}

        {currentUser.need_password_change ? (
          <div className="flex items-center rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <ShieldAlert className="mr-2 h-4 w-4 flex-shrink-0" />
            账号仍在使用默认密码，建议同时前往“修改密码”页面处理。
          </div>
        ) : null}

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <form action={updateProfileAction} className="space-y-6">
            <ProfileAvatarInput defaultPreviewUrl={avatarUrl} displayName={currentUser.full_name} />

            <div className="grid gap-4 md:grid-cols-2">
              <input
                className="rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500"
                defaultValue={currentUser.full_name}
                disabled
              />
              <input
                className="rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500"
                defaultValue={currentUser.username}
                disabled
              />
              <input
                className="rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500"
                defaultValue={currentUser.department_name || "未设置"}
                disabled
              />
              <input
                className="rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500"
                defaultValue={`L${currentUser.clearance_level}`}
                disabled
              />
              <input
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                defaultValue={currentUser.phone || ""}
                name="phone"
                placeholder="手机号（可留空）"
              />
              <input
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                defaultValue={currentUser.email || ""}
                name="email"
                placeholder="邮箱（可留空）"
              />
              <input
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                defaultValue={currentUser.position || ""}
                name="position"
                placeholder="职位（可留空）"
              />
              <select
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                defaultValue={currentUser.gender || ""}
                name="gender"
              >
                <option value="">性别未设置</option>
                <option value="男">男</option>
                <option value="女">女</option>
              </select>
            </div>

            <textarea
              className="min-h-[120px] w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              defaultValue={currentUser.bio || ""}
              name="bio"
              placeholder="个人简介（可留空）"
            />

            <div className="flex justify-end gap-3">
              <Link
                href="/profile"
                className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                取消
              </Link>
              <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700" type="submit">
                保存资料
              </button>
            </div>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
