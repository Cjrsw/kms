"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FileText, Send } from "lucide-react";

import type { QaAvailableModels, RepositoryListItem } from "../../lib/api";
import { askQaAction } from "./actions";

const initialQaInteractionState = {
  question: "",
  repositorySlug: "",
  modelId: null,
  response: null,
  notice: null,
};

type QaClientProps = {
  repositories: RepositoryListItem[];
  availableModels: QaAvailableModels;
};

function toPlainText(snippet: string): string {
  return snippet.replace(/<[^>]+>/g, "").trim();
}

export function QaClient({ repositories, availableModels }: QaClientProps) {
  const [state, formAction, isPending] = useActionState(askQaAction, {
    ...initialQaInteractionState,
    modelId: availableModels.user_default_model_id ?? availableModels.system_default_model_id ?? null,
  });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <form action={formAction} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <select
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
            defaultValue={state.repositorySlug}
            name="repository_slug"
          >
            <option value="">全部知识库</option>
            {repositories.map((repository) => (
              <option key={repository.id} value={repository.slug}>
                {repository.name}
              </option>
            ))}
          </select>
          <select
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
            defaultValue={state.modelId ? String(state.modelId) : ""}
            name="model_id"
          >
            <option value="">自动选择（用户默认/系统默认）</option>
            {availableModels.models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name} ({model.model_name})
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
            <input className="accent-blue-600" name="save_as_default" type="checkbox" />
            设为我的默认模型
          </label>
        </div>

        <textarea
          className="mt-3 min-h-[110px] w-full resize-y rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
          defaultValue={state.question}
          name="question"
          placeholder="输入你的问题（不会出现在 URL 中）"
          required
        />
        <div className="mt-3 flex justify-end">
          <button
            className="inline-flex items-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            disabled={isPending}
            type="submit"
          >
            <Send className="mr-2 h-4 w-4" />
            {isPending ? "发送中..." : "提问"}
          </button>
        </div>
      </form>

      {state.notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {state.notice}
        </div>
      )}

      {state.response?.status === "failed" && state.response.error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-semibold">{state.response.error.user_message}</p>
          <p className="mt-1 text-red-600">{state.response.error.hint}</p>
          {state.response.error.trace_id && <p className="mt-1 text-xs text-red-500">trace_id: {state.response.error.trace_id}</p>}
        </div>
      )}

      {state.response?.status === "ok" && state.response.data && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {state.response.data.model_name && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">{state.response.data.model_name}</span>
            )}
            <span className="rounded-full bg-slate-100 px-2 py-0.5">召回: {state.response.data.recall_mode}</span>
            {state.response.data.trace_id && <span>trace_id: {state.response.data.trace_id}</span>}
          </div>
          <p className="whitespace-pre-line text-sm leading-7 text-slate-800">{state.response.data.answer}</p>
          {state.response.data.sources.length > 0 && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <p className="mb-3 text-xs text-slate-500">参考来源（{state.response.data.source_count}）</p>
              <div className="space-y-3">
                {state.response.data.sources.map((source) => (
                  <Link
                    key={`${source.repository_slug}-${source.note_id}`}
                    href={`/repositories/${source.repository_slug}/notes/${source.note_id}`}
                    className="block rounded-xl border border-blue-100 bg-blue-50/30 p-3 hover:border-blue-300"
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                      <FileText className="h-4 w-4" />
                      {source.title}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {source.repository_name} · L{source.clearance_level} · 附件 {source.attachment_count}
                    </p>
                    <p className="mt-2 text-sm text-slate-700">{toPlainText(source.snippet)}</p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
