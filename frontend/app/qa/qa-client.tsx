"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import {
  ArrowUp,
  Database,
  Loader2,
  MessageSquarePlus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";

import type {
  QaConversationDetail,
  QaConversationListResponse,
  QaConversationMessage,
  QaConversationSummary,
  QaFailure,
  QaResponseEnvelope,
  QaSourceItem,
  RepositoryListItem,
} from "../../lib/api";

type QaClientProps = {
  repositories: RepositoryListItem[];
};

type QaStreamMeta = {
  trace_id: string;
  recall_mode: string;
  model_name: string;
  source_count: number;
  conversation_id?: number;
  conversation_title?: string;
  sources: QaSourceItem[];
};

type UiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "pending" | "success" | "failed";
  traceId: string;
  modelName: string;
  citationStatus: "ok" | "partial" | "missing" | "";
  sources: QaSourceItem[];
  errorCode: string;
  errorCategory: string;
  hint: string;
  createdAt: string;
};

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

function toPlainText(snippet: string): string {
  return snippet.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function mapPersistedMessage(message: QaConversationMessage): UiMessage {
  return {
    id: `db-${message.id}`,
    role: message.role,
    content: message.content,
    status: message.status,
    traceId: message.trace_id,
    modelName: message.model_name,
    citationStatus: message.citation_status,
    sources: message.sources,
    errorCode: message.error_code,
    errorCategory: message.error_category,
    hint: "",
    createdAt: message.created_at,
  };
}

export function QaClient({ repositories }: QaClientProps) {
  const [question, setQuestion] = useState("");
  const [selectedRepositorySlug, setSelectedRepositorySlug] = useState("");
  const [conversations, setConversations] = useState<QaConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [activeConversationTitle, setActiveConversationTitle] = useState("新对话");
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isDeletingConversationId, setIsDeletingConversationId] = useState<number | null>(null);
  const [listError, setListError] = useState("");
  const [conversationError, setConversationError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const repositoryMap = useMemo(
    () => new Map(repositories.map((repository) => [repository.slug, repository.name])),
    [repositories],
  );

  useEffect(() => {
    void initialize();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isSending]);

  async function initialize() {
    setIsLoadingList(true);
    setListError("");
    try {
      const response = await fetch("/api/qa/conversations", { cache: "no-store" });
      if (response.status === 401) {
        window.location.href = "/logout";
        return;
      }
      if (!response.ok) {
        throw new Error("会话列表加载失败。");
      }
      const body = (await response.json()) as QaConversationListResponse;
      setConversations(body.items);
      if (body.items.length > 0) {
        await loadConversation(body.items[0].id);
      } else {
        setActiveConversationId(null);
        setActiveConversationTitle("新对话");
        setMessages([]);
        setSelectedRepositorySlug("");
      }
    } catch (error) {
      setListError(error instanceof Error ? error.message : "会话列表加载失败。");
    } finally {
      setIsLoadingList(false);
    }
  }

  async function refreshConversationList(preferredConversationId?: number | null) {
    const response = await fetch("/api/qa/conversations", { cache: "no-store" });
    if (response.status === 401) {
      window.location.href = "/logout";
      return;
    }
    if (!response.ok) {
      return;
    }
    const body = (await response.json()) as QaConversationListResponse;
    setConversations(body.items);

    const targetConversationId = preferredConversationId ?? activeConversationId;
    if (targetConversationId == null) {
      if (body.items.length === 0) {
        setActiveConversationTitle("新对话");
      }
      return;
    }

    const matchedConversation = body.items.find((item) => item.id === targetConversationId);
    if (matchedConversation) {
      setActiveConversationTitle(matchedConversation.title);
      return;
    }
    if (body.items.length > 0) {
      await loadConversation(body.items[0].id);
      return;
    }
    setActiveConversationId(null);
    setActiveConversationTitle("新对话");
    setMessages([]);
    setSelectedRepositorySlug("");
  }

  async function loadConversation(conversationId: number) {
    setIsLoadingConversation(true);
    setConversationError("");
    try {
      const response = await fetch(`/api/qa/conversations/${conversationId}`, { cache: "no-store" });
      if (response.status === 401) {
        window.location.href = "/logout";
        return;
      }
      if (response.status === 404) {
        await refreshConversationList(null);
        return;
      }
      if (!response.ok) {
        throw new Error("会话内容加载失败。");
      }
      const detail = (await response.json()) as QaConversationDetail;
      setActiveConversationId(detail.id);
      setActiveConversationTitle(detail.title);
      setSelectedRepositorySlug(detail.repository_slug ?? "");
      setMessages(detail.messages.map(mapPersistedMessage));
    } catch (error) {
      setConversationError(error instanceof Error ? error.message : "会话内容加载失败。");
    } finally {
      setIsLoadingConversation(false);
    }
  }

  function startNewConversation() {
    if (isSending) {
      return;
    }
    setActiveConversationId(null);
    setActiveConversationTitle("新对话");
    setMessages([]);
    setConversationError("");
  }

  function upsertConversationSummary(summary: QaConversationSummary) {
    setConversations((previous) => {
      const next = previous.filter((item) => item.id !== summary.id);
      return [summary, ...next];
    });
  }

  function updatePendingAssistant(
    pendingMessageId: string,
    updater: (message: UiMessage) => UiMessage,
  ) {
    setMessages((previous) =>
      previous.map((message) => (message.id === pendingMessageId ? updater(message) : message)),
    );
  }

  async function askByFallback(payload: {
    question: string;
    repository_slug?: string;
    conversation_id?: number;
  }): Promise<QaResponseEnvelope> {
    const response = await fetch("/api/qa/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.status === 401) {
      window.location.href = "/logout";
      throw new Error("unauthorized");
    }
    return (await response.json()) as QaResponseEnvelope;
  }

  async function askByStreaming(
    payload: {
      question: string;
      repository_slug?: string;
      conversation_id?: number;
    },
    pendingMessageId: string,
  ): Promise<{ streamed: boolean; envelope: QaResponseEnvelope | null }> {
    const response = await fetch("/api/qa/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.status === 401) {
      window.location.href = "/logout";
      throw new Error("unauthorized");
    }
    if (!response.ok || !response.body) {
      return { streamed: false, envelope: null };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let currentAnswer = "";
    let finalEnvelope: QaResponseEnvelope | null = null;
    let gotDone = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const delimiterIndex = buffer.indexOf("\n\n");
        if (delimiterIndex < 0) {
          break;
        }
        const frame = buffer.slice(0, delimiterIndex).trim();
        buffer = buffer.slice(delimiterIndex + 2);
        if (!frame) {
          continue;
        }
        const parsed = parseSseFrame(frame);
        if (!parsed.data) {
          continue;
        }

        if (parsed.event === "meta") {
          const meta = JSON.parse(parsed.data) as QaStreamMeta;
          if (meta.conversation_id) {
            setActiveConversationId(meta.conversation_id);
            setActiveConversationTitle(meta.conversation_title || "新对话");
            upsertConversationSummary({
              id: meta.conversation_id,
              title: meta.conversation_title || "新对话",
              repository_slug: payload.repository_slug ?? null,
              last_question: payload.question,
              message_count: 2,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          }
          updatePendingAssistant(pendingMessageId, (message) => ({
            ...message,
            traceId: meta.trace_id,
            modelName: meta.model_name,
            sources: meta.sources,
          }));
          continue;
        }

        if (parsed.event === "delta") {
          const delta = JSON.parse(parsed.data) as { content?: string };
          if (delta.content) {
            currentAnswer += delta.content;
            updatePendingAssistant(pendingMessageId, (message) => ({
              ...message,
              content: currentAnswer,
            }));
          }
          continue;
        }

        if (parsed.event === "error") {
          const failure = JSON.parse(parsed.data) as QaFailure;
          updatePendingAssistant(pendingMessageId, (message) => ({
            ...message,
            status: "failed",
            content: failure.user_message,
            errorCode: failure.error_code,
            errorCategory: failure.error_category,
            hint: failure.hint,
            traceId: failure.trace_id,
          }));
          if (failure.conversation_id) {
            setActiveConversationId(failure.conversation_id);
            setActiveConversationTitle(failure.conversation_title || "新对话");
          }
          finalEnvelope = { status: "failed", data: null, error: failure };
          return { streamed: true, envelope: finalEnvelope };
        }

        if (parsed.event === "done") {
          finalEnvelope = JSON.parse(parsed.data) as QaResponseEnvelope;
          gotDone = true;
          break;
        }
      }

      if (gotDone) {
        break;
      }
    }

    if (finalEnvelope?.status === "ok" && finalEnvelope.data) {
      updatePendingAssistant(pendingMessageId, (message) => ({
        ...message,
        status: "success",
        content: finalEnvelope?.data?.answer || "",
        traceId: finalEnvelope?.data?.trace_id || "",
        modelName: finalEnvelope?.data?.model_name || "",
        citationStatus: finalEnvelope?.data?.citation_status || "",
        sources: finalEnvelope?.data?.sources || [],
      }));
      if (finalEnvelope.data.conversation_id) {
        setActiveConversationId(finalEnvelope.data.conversation_id);
        setActiveConversationTitle(finalEnvelope.data.conversation_title || "新对话");
      }
    }
    return { streamed: true, envelope: finalEnvelope };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedQuestion = question.trim();
    if (!normalizedQuestion || isSending) {
      return;
    }

    const pendingUserId = `user-${Date.now()}`;
    const pendingAssistantId = `assistant-${Date.now()}`;
    const now = new Date().toISOString();
    setMessages((previous) => [
      ...previous,
      {
        id: pendingUserId,
        role: "user",
        content: normalizedQuestion,
        status: "success",
        traceId: "",
        modelName: "",
        citationStatus: "",
        sources: [],
        errorCode: "",
        errorCategory: "",
        hint: "",
        createdAt: now,
      },
      {
        id: pendingAssistantId,
        role: "assistant",
        content: "",
        status: "pending",
        traceId: "",
        modelName: "",
        citationStatus: "",
        sources: [],
        errorCode: "",
        errorCategory: "",
        hint: "",
        createdAt: now,
      },
    ]);

    setQuestion("");
    setIsSending(true);
    setConversationError("");

    const payload = {
      question: normalizedQuestion,
      repository_slug: selectedRepositorySlug || undefined,
      conversation_id: activeConversationId || undefined,
    };

    let finalEnvelope: QaResponseEnvelope | null = null;
    try {
      const streamedResult = await askByStreaming(payload, pendingAssistantId);
      if (!streamedResult.streamed) {
        finalEnvelope = await askByFallback(payload);
        if (finalEnvelope.status === "ok" && finalEnvelope.data) {
          updatePendingAssistant(pendingAssistantId, (message) => ({
            ...message,
            status: "success",
            content: finalEnvelope?.data?.answer || "",
            traceId: finalEnvelope?.data?.trace_id || "",
            modelName: finalEnvelope?.data?.model_name || "",
            citationStatus: finalEnvelope?.data?.citation_status || "",
            sources: finalEnvelope?.data?.sources || [],
          }));
          if (finalEnvelope.data.conversation_id) {
            setActiveConversationId(finalEnvelope.data.conversation_id);
            setActiveConversationTitle(finalEnvelope.data.conversation_title || "新对话");
          }
        } else if (finalEnvelope.error) {
          updatePendingAssistant(pendingAssistantId, (message) => ({
            ...message,
            status: "failed",
            content: finalEnvelope?.error?.user_message || "问答失败。",
            traceId: finalEnvelope?.error?.trace_id || "",
            errorCode: finalEnvelope?.error?.error_code || "",
            errorCategory: finalEnvelope?.error?.error_category || "",
            hint: finalEnvelope?.error?.hint || "",
          }));
          if (finalEnvelope.error.conversation_id) {
            setActiveConversationId(finalEnvelope.error.conversation_id);
            setActiveConversationTitle(finalEnvelope.error.conversation_title || "新对话");
          }
        }
      } else {
        finalEnvelope = streamedResult.envelope;
      }
    } catch (error) {
      if ((error as Error)?.message !== "unauthorized") {
        updatePendingAssistant(pendingAssistantId, (message) => ({
          ...message,
          status: "failed",
          content: "问答请求失败，请稍后重试。",
          errorCode: "request_failed",
          errorCategory: "network",
          hint: "请检查前端代理、后端服务和当前网络状态。",
        }));
      }
    } finally {
      setIsSending(false);
      const nextConversationId =
        finalEnvelope?.data?.conversation_id ??
        finalEnvelope?.error?.conversation_id ??
        activeConversationId;
      if (nextConversationId) {
        await refreshConversationList(nextConversationId);
        await loadConversation(nextConversationId);
      } else {
        await refreshConversationList();
      }
    }
  }

  async function handleDeleteConversation(conversationId: number) {
    if (isSending || isDeletingConversationId === conversationId) {
      return;
    }
    setIsDeletingConversationId(conversationId);
    try {
      const response = await fetch(`/api/qa/conversations/${conversationId}`, {
        method: "DELETE",
      });
      if (response.status === 401) {
        window.location.href = "/logout";
        return;
      }
      if (!response.ok) {
        throw new Error("删除会话失败。");
      }

      const remainingConversations = conversations.filter((item) => item.id !== conversationId);
      setConversations(remainingConversations);

      if (activeConversationId === conversationId) {
        if (remainingConversations.length > 0) {
          await loadConversation(remainingConversations[0].id);
        } else {
          setActiveConversationId(null);
          setActiveConversationTitle("新对话");
          setMessages([]);
          setSelectedRepositorySlug("");
        }
      }
    } catch (error) {
      setConversationError(error instanceof Error ? error.message : "删除会话失败。");
    } finally {
      setIsDeletingConversationId(null);
    }
  }

  function handleQuestionKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!isSending && question.trim()) {
        event.currentTarget.form?.requestSubmit();
      }
    }
  }

  return (
    <div className="flex h-full min-h-[calc(100vh-4rem)] bg-[#212121] text-white">
      <aside className="hidden w-[300px] flex-col border-r border-white/10 bg-[#171717] md:flex">
        <div className="border-b border-white/10 p-3">
          <button
            type="button"
            onClick={startNewConversation}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-medium text-white transition hover:bg-white/10"
          >
            <MessageSquarePlus className="h-4 w-4" />
            新对话
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-3">
          {isLoadingList ? (
            <div className="flex items-center justify-center py-8 text-sm text-white/60">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载会话...
            </div>
          ) : null}

          {listError ? <div className="px-2 py-3 text-sm text-rose-300">{listError}</div> : null}

          {!isLoadingList && conversations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-5 text-sm text-white/45">
              还没有历史问答，会在第一条提问后自动生成会话。
            </div>
          ) : null}

          <div className="space-y-1">
            {conversations.map((conversation) => {
              const active = conversation.id === activeConversationId;
              return (
                <div
                  key={conversation.id}
                  className={clsx(
                    "group rounded-2xl border px-3 py-3 transition",
                    active
                      ? "border-white/15 bg-white/10"
                      : "border-transparent bg-transparent hover:border-white/10 hover:bg-white/[0.05]",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => void loadConversation(conversation.id)}
                    className="w-full text-left"
                  >
                    <div className="line-clamp-1 text-sm font-medium text-white">{conversation.title}</div>
                    <div className="mt-1 line-clamp-2 text-xs leading-5 text-white/45">
                      {conversation.last_question || "暂无问题"}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-white/35">
                      {conversation.repository_slug ? (
                        <span className="rounded-full border border-white/10 px-2 py-0.5 text-white/45">
                          {repositoryMap.get(conversation.repository_slug) || conversation.repository_slug}
                        </span>
                      ) : null}
                      <span>{formatDateTime(conversation.updated_at)}</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleDeleteConversation(conversation.id)}
                    className="mt-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-white/35 opacity-0 transition hover:bg-white/10 hover:text-rose-300 group-hover:opacity-100"
                  >
                    {isDeletingConversationId === conversation.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    删除
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-[#212121]">
        <header className="border-b border-white/10 bg-[#212121]/95 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm text-white/50">
                <Sparkles className="h-4 w-4" />
                知识问答
              </div>
              <h2 className="mt-1 text-lg font-semibold text-white">{activeConversationTitle}</h2>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                value={selectedRepositorySlug}
                onChange={(event) => setSelectedRepositorySlug(event.target.value)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition focus:border-white/20"
              >
                <option value="">全部知识库</option>
                {repositories.map((repository) => (
                  <option key={repository.id} value={repository.slug} className="bg-[#212121] text-white">
                    {repository.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={startNewConversation}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-white/10 md:hidden"
              >
                <MessageSquarePlus className="h-4 w-4" />
                新对话
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-4 pb-28 pt-8 md:px-6">
            {conversationError ? (
              <div className="mb-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {conversationError}
              </div>
            ) : null}

            {messages.length === 0 && !isLoadingConversation ? (
              <div className="mx-auto mt-14 w-full max-w-3xl">
                <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-8 shadow-2xl shadow-black/20">
                  <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
                    <Sparkles className="h-7 w-7 text-white" />
                  </div>
                  <h3 className="text-center text-3xl font-semibold tracking-tight text-white">
                    今天想查什么
                  </h3>
                  <p className="mt-3 text-center text-sm leading-6 text-white/50">
                    支持流式回答、来源回溯和会话历史。首问后会自动生成会话标题。
                  </p>

                  <div className="mt-8 grid gap-3 md:grid-cols-2">
                    {[
                      "危机公关 SOP 里要求把握哪两个关键时间窗口？",
                      "供应商 ESG 审计发现使用童工会怎么处理？",
                      "KMS 系统的 Hybrid Recall 是怎么做的？",
                      "2026年Q2 市场增长与渠道投放策略里的总预算和 ROI 是什么？",
                    ].map((sample) => (
                      <button
                        key={sample}
                        type="button"
                        onClick={() => setQuestion(sample)}
                        className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-left text-sm text-white/75 transition hover:bg-white/[0.08] hover:text-white"
                      >
                        {sample}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {isLoadingConversation ? (
              <div className="flex flex-1 items-center justify-center text-sm text-white/50">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                加载会话内容...
              </div>
            ) : (
              <div className="space-y-8">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={clsx(
                      "flex w-full",
                      message.role === "user" ? "justify-end" : "justify-start",
                    )}
                  >
                    <div className={clsx("w-full max-w-3xl", message.role === "user" ? "max-w-2xl" : "")}>
                      <div
                        className={clsx(
                          "rounded-3xl px-5 py-4 shadow-lg shadow-black/10",
                          message.role === "user"
                            ? "ml-auto bg-[#303030] text-white"
                            : message.status === "failed"
                              ? "border border-rose-500/30 bg-rose-500/10 text-rose-100"
                              : "bg-transparent text-white",
                        )}
                      >
                        <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/35">
                          <span>{message.role === "user" ? "You" : "Assistant"}</span>
                          {message.createdAt ? <span>{formatDateTime(message.createdAt)}</span> : null}
                          {message.modelName && message.role === "assistant" ? (
                            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] tracking-normal text-white/50">
                              {message.modelName}
                            </span>
                          ) : null}
                        </div>

                        <div className="whitespace-pre-wrap text-[15px] leading-7 text-white/90">
                          {message.content || (message.status === "pending" ? "正在生成回答..." : "")}
                        </div>

                        {message.status === "pending" ? (
                          <div className="mt-4 flex items-center text-sm text-white/45">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            模型正在生成回答...
                          </div>
                        ) : null}

                        {message.status === "failed" && message.hint ? (
                          <div className="mt-4 rounded-2xl border border-rose-400/20 bg-black/10 px-4 py-3 text-sm text-rose-100/90">
                            <div className="font-medium">{message.errorCode || "request_failed"}</div>
                            <div className="mt-1 text-rose-100/75">{message.hint}</div>
                          </div>
                        ) : null}

                        {message.role === "assistant" && message.sources.length > 0 ? (
                          <div className="mt-5 space-y-3">
                            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/35">
                              <Search className="h-3.5 w-3.5" />
                              来源
                            </div>
                            {message.sources.map((source, index) => (
                              <a
                                key={`${message.id}-${source.note_id}-${index}`}
                                href={`/repositories/${source.repository_slug}/notes/${source.note_id}`}
                                className="block rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 transition hover:border-white/20 hover:bg-white/[0.08]"
                              >
                                <div className="flex items-center gap-2 text-sm font-medium text-white">
                                  <Database className="h-4 w-4 text-white/50" />
                                  <span className="line-clamp-1">{source.title}</span>
                                </div>
                                <div className="mt-1 text-xs text-white/45">
                                  {repositoryMap.get(source.repository_slug) || source.repository_name}
                                </div>
                                <div className="mt-2 text-sm leading-6 text-white/65">
                                  {toPlainText(source.snippet)}
                                </div>
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-white/10 bg-[#212121]/95 px-4 py-4 backdrop-blur md:px-6">
          <div className="mx-auto w-full max-w-4xl">
            <form onSubmit={handleSubmit}>
              <div className="rounded-[28px] border border-white/10 bg-[#2b2b2b] p-3 shadow-2xl shadow-black/20">
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  onKeyDown={handleQuestionKeyDown}
                  rows={3}
                  placeholder="输入问题，Enter 发送，Shift + Enter 换行"
                  className="min-h-[88px] w-full resize-none bg-transparent px-3 py-2 text-[15px] leading-7 text-white outline-none placeholder:text-white/30"
                  disabled={isSending}
                />

                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="text-xs text-white/35">
                    {selectedRepositorySlug
                      ? `当前范围：${repositoryMap.get(selectedRepositorySlug) || selectedRepositorySlug}`
                      : "当前范围：全部知识库"}
                  </div>

                  <button
                    type="submit"
                    disabled={isSending || !question.trim()}
                    className={clsx(
                      "inline-flex h-11 w-11 items-center justify-center rounded-2xl transition",
                      isSending || !question.trim()
                        ? "cursor-not-allowed bg-white/10 text-white/25"
                        : "bg-white text-[#212121] hover:bg-white/90",
                    )}
                  >
                    {isSending ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <ArrowUp className="h-4.5 w-4.5" />}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
