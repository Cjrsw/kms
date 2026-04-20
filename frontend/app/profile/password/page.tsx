import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { AppShell } from "../../../components/app-shell";
import { requireCurrentUser } from "../../../lib/auth";
import { changePasswordAction } from "../actions";

type PasswordPageProps = {
  searchParams?: Promise<{ pwd_error?: string }>;
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

export default async function PasswordPage({ searchParams }: PasswordPageProps) {
  const currentUser = await requireCurrentUser();
  const query = searchParams ? await searchParams : undefined;
  const passwordError = getPasswordErrorMessage(query?.pwd_error);

  return (
    <AppShell
      contentClassName="p-8"
      currentUser={currentUser}
      title="修改密码"
      description="更新登录密码。"
    >
      <div className="mx-auto max-w-2xl space-y-6">
        <Link href="/profile" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-700">
          <ChevronLeft className="h-4 w-4" />
          返回个人中心
        </Link>

        {passwordError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {passwordError}
          </div>
        ) : null}

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">修改密码</h2>
          <p className="mt-2 text-sm text-slate-500">密码必须为 6-64 位，且同时包含字母和数字。更新成功后会重新登录。</p>
          <form action={changePasswordAction} className="mt-6 grid gap-4">
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
            <div className="flex justify-end gap-3">
              <Link
                href="/profile"
                className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                取消
              </Link>
              <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black" type="submit">
                更新密码
              </button>
            </div>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
