import { Lock, ShieldAlert, User } from "lucide-react";

export default function LoginPage() {
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
          <div className="mb-5 flex items-center rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
            <ShieldAlert className="mr-2 h-4 w-4 flex-shrink-0" />
            当前登录页仅保留原型样式，下一轮接入真实前端登录态。
          </div>

          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">账号</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <User className="h-4.5 w-4.5 text-gray-400" />
                </div>
                <input
                  disabled
                  className="block w-full rounded-xl border border-gray-300 bg-gray-50 py-3 pl-10 pr-3 text-sm text-gray-500 outline-none transition-all"
                  placeholder="前端登录表单待接入"
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
                  disabled
                  className="block w-full rounded-xl border border-gray-300 bg-gray-50 py-3 pl-10 pr-3 text-sm text-gray-500 outline-none transition-all"
                  placeholder="当前由开发种子账号自动联调"
                  type="password"
                />
              </div>
            </div>

            <button
              className="w-full rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-bold text-white transition-colors hover:bg-blue-700"
              type="button"
            >
              登录接口待接入
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
