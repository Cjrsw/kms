"use client";

import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const SEARCH_HISTORY_KEY = "kms_search_history_v1";
const SEARCH_HISTORY_LIMIT = 5;

type SearchQueryBarProps = {
  currentQuery: string;
  suggestions: string[];
};

function normalizeQuery(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function readSearchHistory(): string[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(SEARCH_HISTORY_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map(normalizeQuery)
      .filter(Boolean)
      .slice(0, SEARCH_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function writeSearchHistory(history: string[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, SEARCH_HISTORY_LIMIT)));
}

function mergeSearchHistory(nextQuery: string, existing: string[]): string[] {
  const normalized = normalizeQuery(nextQuery);
  if (!normalized) {
    return existing;
  }
  const next = [normalized, ...existing.filter((item) => item !== normalized)];
  return next.slice(0, SEARCH_HISTORY_LIMIT);
}

export function SearchQueryBar({ currentQuery, suggestions }: SearchQueryBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(currentQuery);
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    setQuery(currentQuery);
  }, [currentQuery]);

  useEffect(() => {
    const existingHistory = readSearchHistory();
    const nextHistory = mergeSearchHistory(currentQuery, existingHistory);
    writeSearchHistory(nextHistory);
    setHistory(nextHistory);
  }, [currentQuery]);

  const datalistId = useMemo(
    () => (suggestions.length > 0 ? `search-suggest-list-${Math.abs(currentQuery.length + suggestions.length)}` : undefined),
    [currentQuery.length, suggestions.length],
  );

  function submitHistoryQuery(historyQuery: string) {
    const form = inputRef.current?.form;
    if (!form) {
      return;
    }
    const formData = new FormData(form);
    formData.set("q", historyQuery);
    formData.set("page", "1");
    const params = new URLSearchParams();
    formData.forEach((value, key) => {
      const text = typeof value === "string" ? value.trim() : "";
      if (!text) {
        return;
      }
      params.set(key, text);
    });
    window.location.href = `/search?${params.toString()}`;
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="relative">
        <Search className="absolute left-5 top-1/2 h-6 w-6 -translate-y-1/2 text-indigo-500" />
        <input
          ref={inputRef}
          className="h-14 w-full rounded-2xl border-none bg-white py-0 pl-14 pr-28 text-lg font-medium text-slate-800 shadow-soft outline-none transition-all placeholder:font-normal placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:shadow-floating"
          list={datalistId}
          name="q"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索笔记标题、正文、PDF/DOCX 等文档..."
          type="text"
          value={query}
        />
        <input name="page" type="hidden" value="1" />
        <button
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-indigo-600 px-6 py-2 text-sm font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-indigo-700 hover:shadow-md active:scale-95"
          type="submit"
        >
          搜索
        </button>
        {datalistId ? (
          <datalist id={datalistId}>
            {suggestions.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        ) : null}
      </div>

      {history.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 px-1">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">最近搜索</span>
          {history.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => submitHistoryQuery(item)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
