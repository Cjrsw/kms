"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  ArrowLeftRight,
  Building2,
  ChevronDown,
  LayoutDashboard,
  LibraryBig,
  Menu,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

import type { AuthUser } from "../lib/auth";

type AdminNavItem = {
  href: string;
  label: string;
};

type AdminNavGroup = {
  key: string;
  label: string;
  icon: ReactNode;
  items: AdminNavItem[];
};

const adminGroups: AdminNavGroup[] = [
  {
    key: "overview",
    label: "总览",
    icon: <LayoutDashboard className="h-4 w-4" />,
    items: [{ href: "/admin", label: "后台总览" }],
  },
  {
    key: "org",
    label: "组织中心",
    icon: <Users className="h-4 w-4" />,
    items: [
      { href: "/admin/users", label: "用户管理" },
      { href: "/admin/departments", label: "部门管理" },
    ],
  },
  {
    key: "content",
    label: "内容中心",
    icon: <LibraryBig className="h-4 w-4" />,
    items: [{ href: "/admin/repositories", label: "仓库管理" }],
  },
  {
    key: "security",
    label: "安全中心",
    icon: <ShieldCheck className="h-4 w-4" />,
    items: [
      { href: "/admin/security/cors", label: "CORS 设置" },
      { href: "/admin/security/auth-audit", label: "认证审计" },
    ],
  },
  {
    key: "ai",
    label: "AI 中心",
    icon: <Sparkles className="h-4 w-4" />,
    items: [
      { href: "/admin/ai/prompt", label: "Sys Prompt" },
      { href: "/admin/ai/qa-audit", label: "QA 审计" },
    ],
  },
];

function isItemActive(pathname: string, href: string): boolean {
  if (href === "/admin") {
    return pathname === "/admin";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({
  currentUser,
  children,
}: {
  currentUser: AuthUser;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const activeGroups = useMemo(
    () =>
      adminGroups
        .filter((group) => group.items.some((item) => isItemActive(pathname, item.href)))
        .map((group) => group.key),
    [pathname],
  );

  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  useEffect(() => {
    setExpandedGroups((previous) => {
      const merged = new Set(previous);
      activeGroups.forEach((groupKey) => merged.add(groupKey));
      return Array.from(merged);
    });
  }, [activeGroups]);

  function toggleGroup(groupKey: string) {
    setExpandedGroups((previous) => {
      if (previous.includes(groupKey)) {
        return previous.filter((key) => key !== groupKey);
      }
      return [...previous, groupKey];
    });
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100 text-slate-800">
      <aside
        className={clsx(
          "hidden h-screen shrink-0 flex-col border-r border-slate-800/40 bg-[radial-gradient(circle_at_top,_rgba(82,109,255,0.28),_transparent_38%),linear-gradient(180deg,_#18265A_0%,_#101B46_55%,_#0D1638_100%)] text-white shadow-2xl lg:flex",
          collapsed ? "w-[92px]" : "w-[264px]",
        )}
      >
        <div className="flex h-16 shrink-0 items-center border-b border-white/10 px-4">
          <button
            className="rounded-lg p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            onClick={() => setCollapsed((value) => !value)}
            title={collapsed ? "展开主菜单" : "收起主菜单"}
            type="button"
          >
            <Menu className="h-5 w-5" />
          </button>
          {!collapsed ? (
            <div className="ml-3 overflow-hidden">
              <p className="truncate text-sm font-semibold tracking-[0.28em] text-white/60">KMS ADMIN</p>
              <p className="truncate text-lg font-semibold text-white">后台系统</p>
            </div>
          ) : null}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5">
          <div className="space-y-6">
            {adminGroups.map((group) => {
              const groupActive = group.items.some((item) => isItemActive(pathname, item.href));
              const open = groupActive || expandedGroups.includes(group.key);

              return (
                <div key={group.key}>
                  <button
                    className={clsx(
                      "flex w-full items-center rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition-colors",
                      groupActive ? "bg-white/12 text-white" : "text-white/55 hover:bg-white/8 hover:text-white/80",
                      collapsed ? "justify-center" : "justify-between",
                    )}
                    onClick={() => toggleGroup(group.key)}
                    type="button"
                  >
                    <div className={clsx("flex items-center", collapsed ? "" : "gap-2")}>
                      {group.icon}
                      {!collapsed ? <span>{group.label}</span> : null}
                    </div>
                    {!collapsed ? (
                      <ChevronDown className={clsx("h-4 w-4 transition-transform", open ? "rotate-180" : "")} />
                    ) : null}
                  </button>

                  <div className={clsx("mt-2 space-y-1", collapsed || !open ? "hidden" : "block")}>
                    {group.items.map((item) => {
                      const active = isItemActive(pathname, item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={clsx(
                            "flex items-center rounded-xl px-4 py-3 text-sm transition-colors",
                            active
                              ? "bg-[#6678FF] text-white shadow-[0_8px_22px_rgba(83,107,255,0.28)]"
                              : "text-white/72 hover:bg-white/10 hover:text-white",
                          )}
                        >
                          <span className="truncate">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </nav>

        <div className="shrink-0 border-t border-white/10 p-4">
          <div className={clsx("rounded-2xl bg-white/8 px-3 py-3", collapsed ? "text-center" : "")}>
            <div className={clsx("flex items-center", collapsed ? "justify-center" : "gap-3")}>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/16 text-sm font-bold text-white">
                {currentUser.full_name.slice(0, 1)}
              </div>
              {!collapsed ? (
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{currentUser.full_name}</p>
                  <p className="truncate text-xs text-white/60">管理员</p>
                </div>
              ) : null}
            </div>
            {!collapsed ? (
              <Link
                href="/repositories"
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/12 px-3 py-2 text-xs font-medium text-white/75 transition-colors hover:bg-white/10 hover:text-white"
              >
                <ArrowLeftRight className="h-4 w-4" />
                返回业务系统
              </Link>
            ) : null}
          </div>
        </div>
      </aside>

      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-30 shrink-0 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="flex h-16 items-center justify-between px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">KMS 管理后台</p>
                <p className="text-xs text-slate-500">独立管理页，和业务系统导航隔离</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-right">
              <div>
                <p className="text-sm font-semibold text-slate-900">{currentUser.full_name}</p>
                <p className="text-xs text-slate-500">{currentUser.username}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700">
                {currentUser.full_name.slice(0, 1)}
              </div>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto px-6 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
