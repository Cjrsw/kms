"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import {
  Database,
  Loader2,
  MessageSquarePlus,
  Search,
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
} from "@/lib/api";

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
    <div className="kms-qa-layout">
      <aside className="kms-qa-sidebar">
        <button className="kms-qa-new-btn" type="button" onClick={startNewConversation} disabled={isSending}>
          <span className="btn-text">
            <MessageSquarePlus className="h-4 w-4" />
            NEW CHAT // 新对话
          </span>
          <span className="btn-icon">+</span>
        </button>

        <div className="kms-qa-history-list custom-scrollbar">
          {isLoadingList ? (
            <div className="kms-qa-loading">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载会话...
            </div>
          ) : null}

          {listError ? <div className="kms-qa-error">{listError}</div> : null}

          {!isLoadingList && conversations.length === 0 ? (
            <div className="kms-qa-empty-history">
              <span>NO HISTORY</span>
              <p>首条提问后会自动生成会话。</p>
            </div>
          ) : null}

          {conversations.map((conversation, index) => {
            const active = conversation.id === activeConversationId;
            return (
              <div
                key={conversation.id}
                className={clsx("kms-qa-history-item", active && "active")}
                style={{ "--item-index": index } as React.CSSProperties}
              >
                <button
                  type="button"
                  className="history-content"
                  onClick={() => void loadConversation(conversation.id)}
                  disabled={isSending}
                >
                  <div className="history-title">{conversation.title}</div>
                  <div className="history-question">{conversation.last_question || "暂无问题"}</div>
                  <div className="history-date">
                    {conversation.repository_slug
                      ? `${repositoryMap.get(conversation.repository_slug) || conversation.repository_slug} // `
                      : ""}
                    {formatDateTime(conversation.updated_at)}
                  </div>
                </button>
                <button
                  className="history-delete-btn"
                  title="删除对话"
                  type="button"
                  onClick={() => void handleDeleteConversation(conversation.id)}
                  disabled={isSending || isDeletingConversationId === conversation.id}
                >
                  {isDeletingConversationId === conversation.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "✕"}
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      <section className="kms-qa-main">
        <div className="kms-qa-header">
          <div>
            <span className="kms-qa-header-label">KNOWLEDGE BASE //</span>
            <h2>{activeConversationTitle}</h2>
          </div>
          <select
            value={selectedRepositorySlug}
            onChange={(event) => setSelectedRepositorySlug(event.target.value)}
            className="kms-cyber-select kms-qa-repo-select"
          >
            <option value="">全局知识库 (Global)</option>
            {repositories.map((repository) => (
              <option key={repository.id} value={repository.slug}>
                {repository.name}
              </option>
            ))}
          </select>
        </div>

        <div className="kms-qa-chat-area custom-scrollbar">
          {conversationError ? <div className="kms-qa-error">{conversationError}</div> : null}

          {messages.length === 0 && !isLoadingConversation ? (
            <div className="kms-chat-bubble ai-bubble is-empty">
              <div className="bubble-header">KMS-AI // ASSISTANT</div>
              <div className="bubble-content">
                您好，我是 KMS 智能知识助手。您可以向我提问关于企业知识库中的任何问题。
              </div>
              <div className="kms-qa-samples">
                {[
                  "危机公关 SOP 里要求把握哪两个关键时间窗口？",
                  "供应商 ESG 审计发现使用童工会怎么处理？",
                  "KMS 系统的 Hybrid Recall 是怎么做的？",
                  "2026年Q2 市场增长与渠道投放策略里的总预算和 ROI 是什么？",
                ].map((sample) => (
                  <button key={sample} type="button" onClick={() => setQuestion(sample)}>
                    {sample}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {isLoadingConversation ? (
            <div className="kms-qa-loading center">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载会话内容...
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={clsx(
                  "kms-chat-bubble",
                  message.role === "user" ? "user-bubble" : "ai-bubble",
                  message.status === "failed" && "failed",
                )}
              >
                <div className="bubble-header">
                  {message.role === "user" ? "USER // OPERATOR" : "KMS-AI // ASSISTANT"}
                  {message.modelName && message.role === "assistant" ? <span> // {message.modelName}</span> : null}
                </div>
                <div className="bubble-content">
                  {message.content || (message.status === "pending" ? "正在生成回答..." : "")}
                </div>

                {message.status === "pending" ? (
                  <div className="kms-qa-thinking">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    STREAMING RESPONSE...
                  </div>
                ) : null}

                {message.status === "failed" && message.hint ? (
                  <div className="kms-qa-failure">
                    <strong>{message.errorCode || "request_failed"}</strong>
                    <span>{message.hint}</span>
                  </div>
                ) : null}

                {message.role === "assistant" && message.sources.length > 0 ? (
                  <div className="kms-qa-source-list">
                    <div className="kms-qa-source-title">
                      <Search className="h-3.5 w-3.5" />
                      SOURCES // 来源
                    </div>
                    {message.sources.map((source, index) => (
                      <a
                        key={`${message.id}-${source.note_id}-${index}`}
                        href={`/repositories/${source.repository_slug}/notes/${source.note_id}`}
                        className="kms-qa-source-card"
                      >
                        <div>
                          <Database className="h-4 w-4" />
                          <span>{source.title}</span>
                        </div>
                        <small>{repositoryMap.get(source.repository_slug) || source.repository_name}</small>
                        <p>{toPlainText(source.snippet)}</p>
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <form className="kms-qa-input-area" onSubmit={handleSubmit}>
          <div className="kms-qa-input-wrapper">
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={handleQuestionKeyDown}
              className="kms-qa-textarea"
              placeholder="输入您的问题 (Shift+Enter 换行)..."
              disabled={isSending}
            />
            <div className="input-energy-line" />
            <div className="kms-qa-scope">
              {selectedRepositorySlug
                ? `SCOPE // ${repositoryMap.get(selectedRepositorySlug) || selectedRepositorySlug}`
                : "SCOPE // GLOBAL"}
            </div>
          </div>
          <button className="kms-qa-send-btn" type="submit" disabled={isSending || !question.trim()}>
            <span className="btn-text">{isSending ? "发送中" : "发送"}</span>
            <span className="btn-icon">
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : "➤"}
            </span>
          </button>
        </form>
      </section>
    </div>
  );
}
