"use client";

import { useMemo, useState } from "react";

import { ParallaxCover } from "@/components/parallax-cover";
import type { RepositoryListItem } from "@/lib/api";

const PAGE_SIZE = 6;

const headerColors: Record<string, string> = {
  hr: "bg-gradient-to-br from-rose-500 to-rose-800",
  rnd: "bg-gradient-to-br from-indigo-600 to-blue-900",
  ops: "bg-gradient-to-br from-emerald-500 to-teal-800",
};

type RepositoryCarouselProps = {
  repositories: RepositoryListItem[];
};

function resolveRepositoryCoverImage(repo: Pick<RepositoryListItem, "slug" | "cover_image_url" | "has_cover_image_upload">): string | undefined {
  if (repo.has_cover_image_upload) {
    return `/api/repositories/${repo.slug}/cover`;
  }
  return repo.cover_image_url || undefined;
}

function formatRecentAge(createdAt: string): string {
  const normalizedCreatedAt = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(createdAt) ? createdAt : `${createdAt}Z`;
  const createdMs = new Date(normalizedCreatedAt).getTime();
  if (Number.isNaN(createdMs)) {
    return "刚刚";
  }
  const diffMs = Date.now() - createdMs;
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} 小时前`;
  }
  return `${Math.floor(diffHours / 24)} 天前`;
}

function chunkRepositories(repositories: RepositoryListItem[]): RepositoryListItem[][] {
  const pages: RepositoryListItem[][] = [];
  for (let index = 0; index < repositories.length; index += PAGE_SIZE) {
    pages.push(repositories.slice(index, index + PAGE_SIZE));
  }
  return pages.length > 0 ? pages : [[]];
}

function formatIndex(value: number): string {
  return String(value).padStart(2, "0");
}

export function RepositoryCarousel({ repositories }: RepositoryCarouselProps) {
  const pages = useMemo(() => chunkRepositories(repositories), [repositories]);
  const [currentPage, setCurrentPage] = useState(0);
  const pageCount = pages.length;
  const canPrev = currentPage > 0;
  const canNext = currentPage < pageCount - 1;

  function goPrev() {
    if (canPrev) {
      setCurrentPage((page) => page - 1);
    }
  }

  function goNext() {
    if (canNext) {
      setCurrentPage((page) => page + 1);
    }
  }

  return (
    <div className="kms-repo-viewport">
      <div className="kms-repo-carousel">
        <div className="kms-repo-controls">
          <span className="kms-repo-page-indicator">
            {formatIndex(currentPage + 1)} / {formatIndex(pageCount)}
          </span>
        </div>

        <button
          aria-label="上一页仓库"
          className={`kms-repo-btn prev-btn ${!canPrev ? "disabled" : ""}`}
          onClick={goPrev}
          type="button"
        >
          《
        </button>
        <button
          aria-label="下一页仓库"
          className={`kms-repo-btn next-btn ${!canNext ? "disabled" : ""}`}
          onClick={goNext}
          type="button"
        >
          》
        </button>

        <div className="kms-repo-carousel-container">
          <div
            className="kms-repo-track"
            style={{
              width: `${pageCount * 100}%`,
              transform: `translateX(-${currentPage * (100 / pageCount)}%)`,
            }}
          >
            {pages.map((pageItems, pageIndex) => {
              const fillerCount = Math.max(0, PAGE_SIZE - pageItems.length);
              return (
                <div className="kms-repo-page" key={`repo-page-${pageIndex}`} style={{ width: `${100 / pageCount}%` }}>
                  <div className="kms-repo-grid">
                    {pageItems.map((repo, repoIndex) => {
                      const globalIndex = pageIndex * PAGE_SIZE + repoIndex + 1;
                      const recentNotes = repo.latest_notes.slice(0, 2);
                      return (
                        <a className="kms-repo-card-link" href={`/repositories/${repo.slug}`} key={repo.slug}>
                          <ParallaxCover
                            className="kms-repo-card"
                            coverUrl={resolveRepositoryCoverImage(repo)}
                            fallbackClass={headerColors[repo.slug] ?? "bg-gradient-to-br from-slate-700 to-slate-950"}
                          >
                            <div className="kms-repo-card-inner">
                              <div className="kms-card-bg-number">{formatIndex(globalIndex)}</div>
                              <div className="kms-card-header">
                                <span className="kms-card-title">{repo.name}</span>
                                <span className="kms-card-en">LEVEL {repo.min_clearance_level} / {repo.note_count} NOTES</span>
                              </div>
                              <p className="kms-card-desc">{repo.description || "暂无仓库简介"}</p>

                              <div className="kms-card-latest">
                                {recentNotes.length > 0 ? (
                                  recentNotes.map((note) => (
                                    <div className="kms-card-note" key={note.id}>
                                      <span>{note.title}</span>
                                      <time>{formatRecentAge(note.updated_at || note.created_at)}</time>
                                    </div>
                                  ))
                                ) : (
                                  <div className="kms-card-note muted">
                                    <span>暂无最新笔记</span>
                                  </div>
                                )}
                              </div>

                              <div className="kms-card-footer">
                                <span>{repo.folder_count} DIR</span>
                                <span>{repo.note_count} DOC</span>
                                <strong>ENTER</strong>
                              </div>
                              <div className="kms-card-bottom-line" />
                            </div>
                          </ParallaxCover>
                        </a>
                      );
                    })}

                    {Array.from({ length: fillerCount }).map((_, fillerIndex) => {
                      const fillerNumber = pageIndex * PAGE_SIZE + pageItems.length + fillerIndex + 1;
                      return (
                        <div className="kms-repo-card-filler" key={`filler-${pageIndex}-${fillerIndex}`}>
                          <div className="kms-card-bg-number">{formatIndex(fillerNumber)}</div>
                          <div className="kms-card-header">
                            <span className="kms-card-title">暂无内容</span>
                            <span className="kms-card-en">EMPTY SLOT</span>
                          </div>
                          <div className="kms-card-bottom-line" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
