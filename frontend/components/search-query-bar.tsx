"use client";

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
    <div className="kms-search-query-module">
      <div className="kms-search-box">
        <input
          ref={inputRef}
          className="kms-search-input"
          list={datalistId}
          name="q"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="输入关键字进行全库检索..."
          type="text"
          value={query}
        />
        <input name="page" type="hidden" value="1" />
        <button
          className="kms-search-btn"
          type="submit"
        >
          <span className="btn-text">检索</span>
          <span className="btn-icon">///</span>
        </button>
        <div className="kms-search-energy-line" />
        {datalistId ? (
          <datalist id={datalistId}>
            {suggestions.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        ) : null}
      </div>

      {history.length > 0 ? (
        <div className="kms-search-history-chips">
          <span>RECENT</span>
          {history.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => submitHistoryQuery(item)}
              className="kms-search-history-chip"
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
