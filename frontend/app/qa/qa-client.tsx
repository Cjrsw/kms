"use client";

import Link from "next/link";
import { FormEvent, useState, useRef, useEffect } from "react";
import { FileText, Send, Bot, User, Sparkles, Loader2, ArrowRight } from "lucide-react";
import { clsx } from "clsx";

import type { RepositoryListItem } from "../../lib/api";

type QaSourceItem = {
  note_id: number;
  repository_slug: string;
  repository_name: string;
  title: string;
  snippet: string;
  clearance_level: number;
  attachment_count: number;
  updated_at: string;
};

type QaAnswer = {
  model_id: number | null;
  model_name: string;
  recall_mode: string;
  citation_status: "ok" | "partial" | "missing";
  trace_id: string;
  question: string;
  answer: string;
  source_count: number;
  sources: QaSourceItem[];
};

type QaFailure = {
  error_code: string;
  error_category: string;
  user_message: string;
  hint: string;
  trace_id: string;
};

type QaResponseEnvelope = {
  status: "ok" | "failed";
  data: QaAnswer | null;
  error: QaFailure | null;
};

type QaClientProps = {
  repositories: RepositoryListItem[];
};

type QaStreamMeta = {
  trace_id: string;
  recall_mode: string;
  model_name: string;
  source_count: number;
  sources: QaSourceItem[];
};

type QaInteraction = {
  id: string;
  question: string;
  repositorySlug?: string;
  status: "pending" | "success" | "error";
  answer: string;
  streamMeta: QaStreamMeta | null;
  response: QaResponseEnvelope | null;
};

function toPlainText(snippet: string): string {
  return snippet.replace(/<[^>]+>/g, "").trim();
}

function parseSseFrame(rawFrame: string): { event: string; data: string } {
  const lines = rawFrame.split(/\r?\n/);
  let event = "message";
  const dataParts: string[] = [];
  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataParts.push(line.slice("data:".length).trim());
    }
  }
  return { event, data: dataParts.join("\n") };
}

export function QaClient({ repositories }: QaClientProps) {
  const [question, setQuestion] = useState("");
  const [repositorySlug, setRepositorySlug] = useState("");
  const [interactions, setInteractions] = useState<QaInteraction[]>([]);
  const [isPending, setIsPending] = useState(false);
  
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [interactions]);

  function updateLastInteraction(updater: (interaction: QaInteraction) => QaInteraction) {
    setInteractions((prev) => {
      if (prev.length === 0) return prev;
      const newArray = [...prev];
      newArray[newArray.length - 1] = updater(newArray[newArray.length - 1]);
      return newArray;
    });
  }

  async function askByFallback(payload: { question: string; repository_slug?: string }): Promise<void> {
    const res = await fetch("/api/qa/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      window.location.href = "/logout";
      return;
    }
    const body = (await res.json()) as QaResponseEnvelope;
    updateLastInteraction((interaction) => ({
      ...interaction,
      status: body.status === "ok" ? "success" : "error",
      response: body,
      answer: body.status === "ok" ? (body.data?.answer || "") : "",
    }));
  }

  async function askByStreaming(payload: { question: string; repository_slug?: string }): Promise<boolean> {
    const res = await fetch("/api/qa/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      window.location.href = "/logout";
      return true;
    }
    if (!res.ok || !res.body) {
      return false;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let currentAnswer = "";
    let finalEnvelope: QaResponseEnvelope | null = null;
    let gotDone = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const delimiterIndex = buffer.indexOf("\n\n");
        if (delimiterIndex < 0) break;
        
        const frame = buffer.slice(0, delimiterIndex).trim();
        buffer = buffer.slice(delimiterIndex + 2);
        if (!frame) continue;

        const parsed = parseSseFrame(frame);
        if (!parsed.data) continue;

        if (parsed.event === "meta") {
          const meta = JSON.parse(parsed.data) as QaStreamMeta;
          updateLastInteraction((interaction) => ({ ...interaction, streamMeta: meta }));
          continue;
        }
        if (parsed.event === "delta") {
          const delta = JSON.parse(parsed.data) as { content?: string };
          if (delta.content) {
            currentAnswer += delta.content;
            updateLastInteraction((interaction) => ({ ...interaction, answer: currentAnswer }));
          }
          continue;
        }
        if (parsed.event === "error") {
          const failure = JSON.parse(parsed.data) as QaFailure;
          finalEnvelope = { status: "failed", data: null, error: failure };
          updateLastInteraction((interaction) => ({
            ...interaction,
            status: "error",
            response: finalEnvelope
          }));
          return true;
        }
        if (parsed.event === "done") {
          const donePayload = JSON.parse(parsed.data) as QaResponseEnvelope;
          finalEnvelope = donePayload;
          gotDone = true;
          break;
        }
      }
      if (gotDone) break;
    }

    if (!finalEnvelope) return false;
    
    updateLastInteraction((interaction) => ({
      ...interaction,
      status: finalEnvelope?.status === "ok" ? "success" : "error",
      response: finalEnvelope,
      answer: finalEnvelope?.status === "ok" ? (finalEnvelope.data?.answer || "") : ""
    }));
    return true;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedQuestion = question.trim();
    if (!normalizedQuestion) return;

    const newId = Math.random().toString(36).substring(7);
    
    setInteractions((prev) => [
      ...prev,
      {
        id: newId,
        question: normalizedQuestion,
        repositorySlug: repositorySlug || undefined,
        status: "pending",
        answer: "",
        streamMeta: null,
        response: null,
      }
    ]);
    
    setQuestion("");
    setIsPending(true);

    const payload = {
      question: normalizedQuestion,
      repository_slug: repositorySlug || undefined,
    };
    try {
      const streamed = await askByStreaming(payload);
      if (!streamed) {
        await askByFallback(payload);
      }
    } catch {
      await askByFallback(payload);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="relative flex h-full flex-col">
      {/* 消息流区域 */}
      <div className="flex-1 overflow-y-auto pb-32">
        <div className="mx-auto w-full max-w-4xl space-y-8 py-6">
          {interactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center pt-20 text-center animate-fade-in">
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-tr from-indigo-500 to-blue-600 shadow-floating text-white mb-6">
                <Sparkles className="h-10 w-10" />
              </div>
              <h2 className="text-2xl font-extrabold text-slate-800">您好，我是 KMS 智能助手</h2>
              <p className="mt-3 text-slate-500 max-w-md leading-relaxed">
                您可以选择特定的知识仓库，或者在全局范围内向我提问。我将基于企业内部知识为您生成精准的解答。
              </p>
            </div>
          ) : (
            interactions.map((interaction) => (
              <div key={interaction.id} className="space-y-6 animate-fade-in">
                {/* 用户消息 */}
                <div className="flex items-start justify-end gap-4 px-4">
                  <div className="rounded-2xl rounded-tr-sm bg-indigo-600 px-5 py-3.5 text-sm text-white shadow-soft">
                    {interaction.question}
                  </div>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600">
                    <User className="h-5 w-5" />
                  </div>
                </div>

                {/* AI 回复 */}
                <div className="flex items-start gap-4 px-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-soft">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div className="flex-1 max-w-3xl">
                    <div className="rounded-2xl rounded-tl-sm border border-slate-200/60 bg-white p-5 shadow-soft">
                      {/* 状态与元数据信息 */}
                      {(interaction.status === "pending" || interaction.streamMeta) && (
                        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
                          {interaction.streamMeta?.model_name && (
                            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-indigo-700">
                              {interaction.streamMeta.model_name}
                            </span>
                          )}
                          {interaction.streamMeta?.recall_mode && (
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                              检索模式: {interaction.streamMeta.recall_mode}
                            </span>
                          )}
                          {interaction.response?.data?.citation_status && (
                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                              引用状态: {interaction.response.data.citation_status}
                            </span>
                          )}
                        </div>
                      )}

                      {/* 回答正文 */}
                      <div className="prose prose-sm prose-slate max-w-none whitespace-pre-line leading-7">
                        {interaction.answer || (interaction.status === "pending" ? (
                          <div className="flex items-center text-indigo-600">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            正在思考...
                          </div>
                        ) : null)}
                      </div>

                      {/* 错误提示 */}
                      {interaction.status === "error" && interaction.response?.error && (
                        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm">
                          <p className="font-semibold text-rose-800">{interaction.response.error.user_message}</p>
                          <p className="mt-1 text-rose-600">{interaction.response.error.hint}</p>
                        </div>
                      )}

                      {/* 引用来源卡片 */}
                      {interaction.status === "success" && interaction.response?.data && interaction.response.data.sources.length > 0 && (
                        <div className="mt-6 border-t border-slate-100 pt-5">
                          <p className="mb-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                            参考来源 ({interaction.response.data.source_count})
                          </p>
                          <div className="grid gap-3 sm:grid-cols-2">
                            {interaction.response.data.sources.map((source) => (
                              <Link
                                key={`${source.repository_slug}-${source.note_id}-${source.updated_at}`}
                                href={`/repositories/${source.repository_slug}/notes/${source.note_id}`}
                                className="group block rounded-xl border border-slate-200 bg-slate-50 p-3.5 transition-all duration-300 hover:border-indigo-300 hover:bg-indigo-50/50 hover:shadow-soft"
                              >
                                <div className="flex items-center gap-2 text-sm font-bold text-slate-700 group-hover:text-indigo-700">
                                  <FileText className="h-4 w-4 text-indigo-500" />
                                  <span className="truncate">{source.title}</span>
                                </div>
                                <div className="mt-1.5 flex items-center gap-2 text-xs font-medium text-slate-500">
                                  <span className="truncate">{source.repository_name}</span>
                                  <span>•</span>
                                  <span>密级 L{source.clearance_level}</span>
                                </div>
                                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-600">
                                  {toPlainText(source.snippet)}
                                </p>
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* 底部输入区 */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent pb-6 pt-10">
        <div className="mx-auto w-full max-w-4xl px-4">
          <form 
            onSubmit={handleSubmit} 
            className="glass-panel overflow-hidden transition-all duration-300 focus-within:ring-4 focus-within:ring-indigo-500/10 focus-within:border-indigo-300"
          >
            <div className="flex items-center border-b border-slate-200/50 bg-slate-50/50 px-4 py-2.5">
              <select
                className="rounded-lg border-none bg-transparent px-2 py-1 text-xs font-medium text-slate-600 outline-none hover:text-slate-900 focus:ring-0 cursor-pointer"
                value={repositorySlug}
                onChange={(event) => setRepositorySlug(event.target.value)}
                name="repository_slug"
              >
                <option value="">全库检索模式</option>
                {repositories.map((repository) => (
                  <option key={repository.id} value={repository.slug}>
                    {repository.name}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="relative flex items-end gap-2 p-3">
              <textarea
                className="custom-scrollbar max-h-48 min-h-[56px] w-full resize-none border-none bg-transparent px-3 py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:ring-0"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (question.trim() && !isPending) {
                      const form = e.currentTarget.form;
                      if (form) form.requestSubmit();
                    }
                  }
                }}
                name="question"
                placeholder="在此输入您的问题，按 Enter 发送，Shift + Enter 换行..."
                required
              />
              <button
                className="mb-1 mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-soft transition-all duration-300 hover:bg-indigo-700 hover:shadow-floating active:scale-95 disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-none"
                disabled={isPending || !question.trim()}
                type="submit"
                title="发送问题"
              >
                {isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ArrowRight className="h-5 w-5" />
                )}
              </button>
            </div>
          </form>
          <div className="mt-3 text-center text-xs text-slate-400">
            KMS AI 生成的内容可能包含不准确的信息，请以原文档为准。
          </div>
        </div>
      </div>
    </div>
  );
}
