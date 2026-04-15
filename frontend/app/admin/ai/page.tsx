import { AppShell } from "../../../components/app-shell";
import { getAdminAiModels, getAdminQaAudit } from "../../../lib/api";
import { hasAnyRole, requireCurrentUser } from "../../../lib/auth";
import { redirect } from "next/navigation";

import {
  createAiModelAction,
  deleteAiModelAction,
  saveAiDefaultsAction,
  toggleAiModelAction,
  updateAiModelAction,
} from "./actions";

export default async function AdminAiPage() {
  const currentUser = await requireCurrentUser();
  if (!hasAnyRole(currentUser, ["admin"])) {
    redirect("/repositories");
  }

  const [modelData, qaAudit] = await Promise.all([getAdminAiModels(), getAdminQaAudit(20)]);

  return (
    <AppShell
      contentClassName="p-6 lg:p-8 bg-slate-50"
      currentUser={currentUser}
      title="AI模型管理"
      description="注册/启停模型、设置系统默认模型、查看问答审计。"
    >
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">系统默认模型</h2>
          <form action={saveAiDefaultsAction} className="mt-4 grid gap-3 md:grid-cols-3">
            <select
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
              defaultValue={modelData.defaults.chat_default_model_id ? String(modelData.defaults.chat_default_model_id) : ""}
              name="chat_default_model_id"
            >
              <option value="">未设置默认聊天模型</option>
              {modelData.models
                .filter((model) => model.capability === "chat" && model.is_enabled)
                .map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
            </select>
            <select
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
              defaultValue={
                modelData.defaults.embedding_default_model_id ? String(modelData.defaults.embedding_default_model_id) : ""
              }
              name="embedding_default_model_id"
            >
              <option value="">未设置默认向量模型</option>
              {modelData.models
                .filter((model) => model.capability === "embedding" && model.is_enabled)
                .map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
            </select>
            <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700" type="submit">
              保存默认配置
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">注册新模型（OpenAI兼容）</h2>
          <form action={createAiModelAction} className="mt-4 grid gap-3 md:grid-cols-2">
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" name="name" placeholder="模型显示名称" required />
            <select className="rounded-xl border border-slate-200 px-3 py-2 text-sm" defaultValue="chat" name="capability">
              <option value="chat">聊天模型(chat)</option>
              <option value="embedding">向量模型(embedding)</option>
            </select>
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" name="api_base_url" placeholder="API Base URL (e.g. https://api.openai.com)" required />
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" name="model_name" placeholder="上游模型名 (e.g. gpt-4o-mini)" required />
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" name="api_key" placeholder="API Key" required />
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" defaultValue="30" name="timeout_seconds" placeholder="超时秒数" />
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" name="max_tokens" placeholder="max_tokens (可留空)" />
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" name="description" placeholder="简介(可选)" />
            <textarea className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono md:col-span-2" defaultValue="{}" name="extra_headers" placeholder='额外 Header(JSON对象), 例如 {"X-Token":"abc"}' />
            <textarea className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono md:col-span-2" defaultValue="{}" name="extra_body" placeholder='额外请求体(JSON对象), 例如 {"temperature":0.1}' />
            <input name="is_enabled" type="hidden" value="true" />
            <button className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 md:col-span-2" type="submit">
              注册模型
            </button>
          </form>
        </section>

        <section className="space-y-4">
          {modelData.models.map((model) => (
            <article key={model.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <form action={updateAiModelAction} className="grid gap-3 md:grid-cols-2">
                <input name="model_id" type="hidden" value={model.id} />
                <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" defaultValue={model.name} name="name" required />
                <select className="rounded-xl border border-slate-200 px-3 py-2 text-sm" defaultValue={model.capability} name="capability">
                  <option value="chat">聊天模型(chat)</option>
                  <option value="embedding">向量模型(embedding)</option>
                </select>
                <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" defaultValue={model.api_base_url} name="api_base_url" required />
                <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" defaultValue={model.model_name} name="model_name" required />
                <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" name="api_key" placeholder={`留空则保持不变（当前: ${model.api_key_masked || "未显示"}）`} />
                <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" defaultValue={model.timeout_seconds} name="timeout_seconds" />
                <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" defaultValue={model.max_tokens ?? ""} name="max_tokens" />
                <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" defaultValue={model.description} name="description" />
                <textarea
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono md:col-span-2"
                  defaultValue={JSON.stringify(model.extra_headers ?? {}, null, 2)}
                  name="extra_headers"
                />
                <textarea
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono md:col-span-2"
                  defaultValue={JSON.stringify(model.extra_body ?? {}, null, 2)}
                  name="extra_body"
                />
                <input name="is_enabled" type="hidden" value={model.is_enabled ? "true" : "false"} />
                <div className="flex flex-wrap gap-2 md:col-span-2">
                  <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700" type="submit">
                    保存模型
                  </button>
                </div>
              </form>
              <form action={toggleAiModelAction} className="mt-3">
                <input name="model_id" type="hidden" value={model.id} />
                <input name="action" type="hidden" value={model.is_enabled ? "disable" : "enable"} />
                <button
                  className={`rounded-xl px-4 py-2 text-sm font-medium text-white ${
                    model.is_enabled ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"
                  }`}
                  type="submit"
                >
                  {model.is_enabled ? "禁用模型" : "启用模型"}
                </button>
              </form>
              <form action={deleteAiModelAction} className="mt-2">
                <input name="model_id" type="hidden" value={model.id} />
                <button className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700" type="submit">
                  删除模型
                </button>
              </form>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">问答审计（最近20条）</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2">时间</th>
                  <th className="px-3 py-2">用户</th>
                  <th className="px-3 py-2">状态</th>
                  <th className="px-3 py-2">模型</th>
                  <th className="px-3 py-2">耗时(ms)</th>
                  <th className="px-3 py-2">错误码</th>
                </tr>
              </thead>
              <tbody>
                {qaAudit.logs.map((log) => (
                  <tr key={log.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{new Date(log.created_at).toLocaleString("zh-CN")}</td>
                    <td className="px-3 py-2">{log.username || "-"}</td>
                    <td className="px-3 py-2">{log.status}</td>
                    <td className="px-3 py-2">{log.model_name || "-"}</td>
                    <td className="px-3 py-2">{log.latency_ms}</td>
                    <td className="px-3 py-2">{log.error_code || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
