import { Lock, ShieldAlert, User } from "lucide-react";
import { redirect } from "next/navigation";

import { getCurrentUser } from "../../lib/auth";
import { loginAction } from "./actions";

type LoginPageProps = {
  searchParams?: Promise<{ error?: string }>;
};

function getErrorMessage(error?: string) {
  if (error === "required") {
    return "请输入账号和密码后再登录。";
  }

  if (error === "invalid") {
    return "账号或密码错误，请重试。";
  }

  return "";
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const currentUser = await getCurrentUser();
  if (currentUser) {
    redirect("/repositories");
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const errorMessage = getErrorMessage(resolvedSearchParams?.error);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F5F7FA] px-4 font-sans">
      <div className="w-full max-w-[400px] overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/20 bg-white/20 shadow-inner backdrop-blur-sm">
            <span className="text-3xl font-bold text-white">K</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">智库 KMS</h1>
          <p className="mt-2 text-sm font-medium tracking-wide text-blue-100/80">企业级知识管理与协作平台</p>
        </div>

        <div className="p-8">
          {errorMessage ? (
            <div className="mb-5 flex items-center rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <ShieldAlert className="mr-2 h-4 w-4 flex-shrink-0" />
              {errorMessage}
            </div>
          ) : (
            <div className="mb-5 flex items-center rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
              <ShieldAlert className="mr-2 h-4 w-4 flex-shrink-0" />
              现在会使用真实后端账号登录，并建立前端会话。
            </div>
          )}

          <form action={loginAction} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">账号</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <User className="h-4.5 w-4.5 text-gray-400" />
                </div>
                <input
                  className="block w-full rounded-xl border border-gray-300 bg-gray-50 py-3 pl-10 pr-3 text-sm text-gray-500 outline-none transition-all"
                  name="username"
                  placeholder="请输入登录账号"
                  type="text"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">密码</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <Lock className="h-4.5 w-4.5 text-gray-400" />
                </div>
                <input
                  className="block w-full rounded-xl border border-gray-300 bg-gray-50 py-3 pl-10 pr-3 text-sm text-gray-500 outline-none transition-all"
                  name="password"
                  placeholder="请输入登录密码"
                  type="password"
                />
              </div>
            </div>

            <button
              className="w-full rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-bold text-white transition-colors hover:bg-blue-700"
              type="submit"
            >
              登录系统
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
