import { ShieldAlert } from "lucide-react";

import { AppShell } from "../../components/app-shell";
import { requireCurrentUser } from "../../lib/auth";
import { changePasswordAction, updateProfileAction } from "./actions";

type ProfilePageProps = {
  searchParams?: Promise<{ saved?: string; pwd_error?: string }>;
};

function getPasswordErrorMessage(code?: string): string {
  if (code === "required") {
    return "请填写当前密码和新密码。";
  }
  if (code === "rule") {
    return "新密码必须为 6-64 位且包含字母和数字。";
  }
  return "";
}

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const currentUser = await requireCurrentUser();
  const query = searchParams ? await searchParams : undefined;
  const passwordError = getPasswordErrorMessage(query?.pwd_error);
  const profileSaved = query?.saved === "1";

  return (
    <AppShell
      contentClassName="p-8"
      currentUser={currentUser}
      title="个人中心"
      description="维护个人资料和账号安全设置。"
    >
      <div className="mx-auto max-w-3xl space-y-6">
        {currentUser.need_password_change ? (
          <div className="flex items-center rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <ShieldAlert className="mr-2 h-4 w-4 flex-shrink-0" />
            账号仍在使用默认密码，请尽快修改密码。
          </div>
        ) : null}

        {profileSaved ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            个人资料已保存。
          </div>
        ) : null}

        {passwordError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {passwordError}
          </div>
        ) : null}

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">个人资料</h2>
          <p className="mt-1 text-xs text-gray-500">姓名、账号、部门由管理员维护；手机号、邮箱、职位、性别、简介可自行维护。</p>
          <form action={updateProfileAction} className="mt-4 grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
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
            </div>
            <div className="grid gap-3 md:grid-cols-2">
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
            </div>
            <div className="grid gap-3 md:grid-cols-2">
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
              className="min-h-[90px] rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              defaultValue={currentUser.bio || ""}
              name="bio"
              placeholder="个人简介（可留空）"
            />
            <button className="w-fit rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700" type="submit">
              保存资料
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">修改密码</h2>
          <p className="mt-1 text-xs text-gray-500">密码必须为 6-64 位，且同时包含字母和数字。修改后会自动退出重新登录。</p>
          <form action={changePasswordAction} className="mt-4 grid gap-3 md:max-w-lg">
            <input
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              name="current_password"
              placeholder="当前密码"
              type="password"
              required
            />
            <input
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              name="new_password"
              placeholder="新密码（字母+数字）"
              type="password"
              required
            />
            <button className="w-fit rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black" type="submit">
              更新密码
            </button>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
