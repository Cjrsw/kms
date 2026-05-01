"use client";

import { useEffect, useRef, useState } from "react";

type NoteIndexStatusPayload = {
  note_id: number;
  status: string;
  error: string | null;
  indexed_at: string | null;
};

type NoteIndexStatusProps = {
  repoSlug: string;
  noteId: number | string;
  initialStatus: string;
  initialError?: string | null;
  variant?: "inline" | "banner";
};

const ACTIVE_STATUSES = new Set(["pending", "indexing"]);

function getMessage(status: string, error?: string | null) {
  if (status === "pending" || status === "indexing") {
    return "上传中，后台正在索引";
  }
  if (status === "indexed") {
    return "索引完成";
  }
  if (status === "failed") {
    return `索引失败：${error || "请查看后端日志。"}`;
  }
  return "";
}

export function NoteIndexStatus({
  repoSlug,
  noteId,
  initialStatus,
  initialError = null,
  variant = "inline",
}: NoteIndexStatusProps) {
  const [status, setStatus] = useState(initialStatus || "indexed");
  const [error, setError] = useState<string | null>(initialError);
  const [visible, setVisible] = useState(ACTIVE_STATUSES.has(initialStatus) || initialStatus === "failed");
  const sawActiveStatusRef = useRef(ACTIVE_STATUSES.has(initialStatus));

  useEffect(() => {
    if (!ACTIVE_STATUSES.has(status)) {
      return;
    }

    let cancelled = false;
    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(
          `/api/repositories/${encodeURIComponent(repoSlug)}/notes/${encodeURIComponent(String(noteId))}/index-status`,
          { cache: "no-store" }
        );
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as NoteIndexStatusPayload;
        if (cancelled) {
          return;
        }
        setStatus(payload.status || "indexed");
        setError(payload.error || null);
      } catch {
        // Keep the current state visible; backend logs carry the actionable error.
      }
    }, 1400);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [noteId, repoSlug, status]);

  useEffect(() => {
    if (ACTIVE_STATUSES.has(status)) {
      sawActiveStatusRef.current = true;
      setVisible(true);
    }
    if (status === "failed") {
      setVisible(true);
    }
    if (status === "indexed" && sawActiveStatusRef.current) {
      setVisible(true);
      const timeout = window.setTimeout(() => setVisible(false), 2400);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [status]);

  if (!visible) {
    return null;
  }

  const message = getMessage(status, error);
  if (!message) {
    return null;
  }

  if (variant === "banner") {
    return (
      <div className={`kms-note-error ${status === "failed" ? "" : "info"}`}>
        <span>{message}</span>
      </div>
    );
  }

  return (
    <span className={`kms-index-status ${status === "failed" ? "failed" : "pending"}`}>
      {message}
    </span>
  );
}
