"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { FileText, Send } from "lucide-react";

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
  const [isPending, setIsPending] = useState(false);
  const [streamingAnswer, setStreamingAnswer] = useState("");
  const [streamMeta, setStreamMeta] = useState<QaStreamMeta | null>(null);
  const [response, setResponse] = useState<QaResponseEnvelope | null>(null);

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
    setResponse(body);
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
    let answer = "";
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
          setStreamMeta(meta);
          continue;
        }
        if (parsed.event === "delta") {
          const delta = JSON.parse(parsed.data) as { content?: string };
          if (delta.content) {
            answer += delta.content;
            setStreamingAnswer(answer);
          }
          continue;
        }
        if (parsed.event === "error") {
          const failure = JSON.parse(parsed.data) as QaFailure;
          finalEnvelope = { status: "failed", data: null, error: failure };
          setResponse(finalEnvelope);
          return true;
        }
        if (parsed.event === "done") {
          const donePayload = JSON.parse(parsed.data) as QaResponseEnvelope;
          finalEnvelope = donePayload;
          gotDone = true;
          break;
        }
      }

      if (gotDone) {
        break;
      }
    }

    if (!finalEnvelope) {
      return false;
    }
    setResponse(finalEnvelope);
    return true;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedQuestion = question.trim();
    if (!normalizedQuestion) {
      setResponse({
        status: "failed",
        data: null,
        error: {
          error_code: "empty_question",
          error_category: "validation",
          user_message: "Question must not be empty.",
          hint: "Please input a question and retry.",
          trace_id: "",
        },
      });
      return;
    }

    setIsPending(true);
    setStreamingAnswer("");
    setStreamMeta(null);
    setResponse(null);

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

  const answerData = response?.status === "ok" ? response.data : null;
  const failureData = response?.status === "failed" ? response.error : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2">
          <select
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
            value={repositorySlug}
            onChange={(event) => setRepositorySlug(event.target.value)}
            name="repository_slug"
          >
            <option value="">All repositories</option>
            {repositories.map((repository) => (
              <option key={repository.id} value={repository.slug}>
                {repository.name}
              </option>
            ))}
          </select>
          <div className="rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-500">
            Model is fixed by system policy.
          </div>
        </div>

        <textarea
          className="mt-3 min-h-[110px] w-full resize-y rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          name="question"
          placeholder="Ask your question here."
          required
        />
        <div className="mt-3 flex justify-end">
          <button
            className="inline-flex items-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            disabled={isPending}
            type="submit"
          >
            <Send className="mr-2 h-4 w-4" />
            {isPending ? "Asking..." : "Ask"}
          </button>
        </div>
      </form>

      {isPending && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {streamMeta?.model_name && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">{streamMeta.model_name}</span>
            )}
            {streamMeta?.recall_mode && <span className="rounded-full bg-slate-100 px-2 py-0.5">Recall: {streamMeta.recall_mode}</span>}
            {streamMeta?.trace_id && <span>trace_id: {streamMeta.trace_id}</span>}
          </div>
          <p className="whitespace-pre-line text-sm leading-7 text-slate-800">{streamingAnswer || "Waiting for model response..."}</p>
        </div>
      )}

      {failureData && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-semibold">{failureData.user_message}</p>
          <p className="mt-1 text-red-600">{failureData.hint}</p>
          {failureData.trace_id && <p className="mt-1 text-xs text-red-500">trace_id: {failureData.trace_id}</p>}
        </div>
      )}

      {answerData && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {answerData.model_name && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">{answerData.model_name}</span>
            )}
            <span className="rounded-full bg-slate-100 px-2 py-0.5">Recall: {answerData.recall_mode}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5">Citation: {answerData.citation_status}</span>
            {answerData.trace_id && <span>trace_id: {answerData.trace_id}</span>}
          </div>
          <p className="whitespace-pre-line text-sm leading-7 text-slate-800">{answerData.answer}</p>
          {answerData.sources.length > 0 && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <p className="mb-3 text-xs text-slate-500">Sources ({answerData.source_count})</p>
              <div className="space-y-3">
                {answerData.sources.map((source) => (
                  <Link
                    key={`${source.repository_slug}-${source.note_id}-${source.updated_at}`}
                    href={`/repositories/${source.repository_slug}/notes/${source.note_id}`}
                    className="block rounded-xl border border-blue-100 bg-blue-50/30 p-3 hover:border-blue-300"
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                      <FileText className="h-4 w-4" />
                      {source.title}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {source.repository_name} | L{source.clearance_level} | Attachments {source.attachment_count}
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
