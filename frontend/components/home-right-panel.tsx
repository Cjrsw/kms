"use client";

import { type CSSProperties, useState } from "react";

import type { HomeActivityItem, HomeAnnouncement, HomeNoteItem } from "@/lib/api";

type HomeTab = "latest" | "announcement" | "activity";

const tabs: Array<{ key: HomeTab; label: string }> = [
  { key: "latest", label: "最新" },
  { key: "announcement", label: "公告" },
  { key: "activity", label: "动态" },
];

export function HomeRightPanel({
  latestNotes,
  announcement,
  activities,
}: {
  latestNotes: HomeNoteItem[];
  announcement: HomeAnnouncement;
  activities: HomeActivityItem[];
}) {
  const [activeTab, setActiveTab] = useState<HomeTab>("latest");
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const activeIndex = tabs.findIndex((tab) => tab.key === activeTab);

  function selectTab(nextTab: HomeTab) {
    if (nextTab === activeTab) {
      return;
    }
    const nextIndex = tabs.findIndex((tab) => tab.key === nextTab);
    setDirection(nextIndex > activeIndex ? "next" : "prev");
    setActiveTab(nextTab);
  }

  return (
    <section className="kms-home-news">
      <header className="kms-news-tabs kms-home-tabs" style={{ "--home-tab-index": activeIndex } as CSSProperties}>
        <span className="kms-home-tab-indicator" aria-hidden="true">
          <span>➔</span>
          <b key={activeTab}>{String(activeIndex + 1).padStart(2, "0")}</b>
        </span>
        {tabs.map((tab) => (
          <button
            className={activeTab === tab.key ? "active" : undefined}
            key={tab.key}
            onClick={() => selectTab(tab.key)}
            type="button"
          >
            <span>{tab.label}</span>
          </button>
        ))}
      </header>

      <div className="kms-home-panel-frame">
        <div className={`kms-home-panel-body kms-home-panel-body-${direction}`} key={activeTab}>
          {activeTab === "latest" ? <LatestNotesPanel notes={latestNotes} /> : null}
          {activeTab === "announcement" ? <AnnouncementPanel announcement={announcement} /> : null}
          {activeTab === "activity" ? <ActivityPanel activities={activities} /> : null}
        </div>
      </div>
    </section>
  );
}

function LatestNotesPanel({ notes }: { notes: HomeNoteItem[] }) {
  if (notes.length === 0) {
    return <EmptyPanel text="暂无可见笔记。" />;
  }

  return (
    <>
      <ul className="kms-news-list kms-home-note-list">
        {notes.map((note) => (
          <li key={note.id}>
            <a href={note.href}>
              <div>
                <span className="kms-news-tag">【{note.repository_name}】</span>
                <span>{note.title}</span>
              </div>
              <time>{formatDate(note.updated_at)}</time>
            </a>
          </li>
        ))}
      </ul>
      <MoreLink href="/repositories" label="REPOSITORIES" />
    </>
  );
}

function AnnouncementPanel({ announcement }: { announcement: HomeAnnouncement }) {
  return (
    <div className="kms-home-announcement">
      <div className="kms-home-announcement-title">
        <span>NOTICE BOARD</span>
        <strong>{announcement.title}</strong>
      </div>
      <p>{announcement.content}</p>
      <time>UPDATED {announcement.updated_at ? formatDate(announcement.updated_at) : "--"}</time>
    </div>
  );
}

function ActivityPanel({ activities }: { activities: HomeActivityItem[] }) {
  if (activities.length === 0) {
    return <EmptyPanel text="暂无索引或附件处理异常。" />;
  }

  return (
    <>
      <ul className="kms-news-list kms-home-activity-list">
        {activities.map((item) => (
          <li key={item.id}>
            <a href={item.href}>
              <div>
                <span className={`kms-home-status kms-home-status-${item.status}`}>{resolveActivityLabel(item)}</span>
                <span>{item.note_title}</span>
                <p>{item.message}</p>
              </div>
              <time>{formatDate(item.updated_at)}</time>
            </a>
          </li>
        ))}
      </ul>
      <MoreLink href="/repositories" label="CHECK" />
    </>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return <div className="kms-home-empty">{text}</div>;
}

function MoreLink({ href, label }: { href: string; label: string }) {
  return (
    <div className="kms-more-container">
      <a className="kms-more-btn" href={href}>
        {label} <b>+</b>
      </a>
    </div>
  );
}

function resolveActivityLabel(item: HomeActivityItem): string {
  if (item.kind === "attachment") {
    return "附件失败";
  }
  if (item.status === "failed") {
    return "索引失败";
  }
  if (item.status === "indexing") {
    return "正在索引";
  }
  return "等待索引";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }
  return date.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });
}
