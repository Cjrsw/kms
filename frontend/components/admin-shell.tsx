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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-800">
      {/* 移动端遮罩层 */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm transition-opacity lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 flex h-screen shrink-0 flex-col bg-slate-900 text-slate-300 shadow-2xl transition-all duration-300 ease-in-out lg:static",
          collapsed ? "w-[92px]" : "w-[264px]",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex h-16 shrink-0 items-center border-b border-slate-800 px-4">
          <button
            className="hidden rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white lg:block"
            onClick={() => setCollapsed((value) => !value)}
            title={collapsed ? "展开主菜单" : "收起主菜单"}
            type="button"
          >
            <Menu className="h-5 w-5" />
          </button>
          <button
            className="lg:hidden rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            onClick={() => setMobileMenuOpen(false)}
            type="button"
          >
            <Menu className="h-5 w-5" />
          </button>
          
          {!collapsed ? (
            <div className="ml-3 overflow-hidden">
              <p className="truncate text-sm font-semibold tracking-[0.28em] text-indigo-400">KMS ADMIN</p>
              <p className="truncate text-lg font-bold text-white">后台管理系统</p>
            </div>
          ) : null}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5 custom-scrollbar">
          <div className="space-y-6">
            {adminGroups.map((group) => {
              const groupActive = group.items.some((item) => isItemActive(pathname, item.href));
              const open = groupActive || expandedGroups.includes(group.key);

              return (
                <div key={group.key}>
                  <button
                    className={clsx(
                      "flex w-full items-center rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition-colors",
                      groupActive ? "bg-slate-800 text-indigo-300" : "text-slate-500 hover:bg-slate-800 hover:text-slate-300",
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
                          onClick={() => setMobileMenuOpen(false)}
                          className={clsx(
                            "flex items-center rounded-xl px-4 py-3 text-sm font-medium transition-all duration-300",
                            active
                              ? "bg-indigo-600 text-white shadow-floating shadow-indigo-600/20"
                              : "text-slate-400 hover:bg-slate-800 hover:text-white",
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

        <div className="shrink-0 border-t border-slate-800 p-4">
          <div className={clsx("rounded-2xl bg-slate-800/50 px-3 py-3", collapsed ? "text-center" : "")}>
            <div className={clsx("flex items-center", collapsed ? "justify-center" : "gap-3")}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-sm font-bold text-white shadow-sm ring-2 ring-slate-800">
                {currentUser.full_name.slice(0, 1)}
              </div>
              {!collapsed ? (
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">{currentUser.full_name}</p>
                  <p className="truncate text-xs font-medium text-slate-400">管理员</p>
                </div>
              ) : null}
            </div>
            {!collapsed ? (
              <Link
                href="/repositories"
                className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2.5 text-xs font-semibold text-slate-300 transition-all hover:bg-slate-700 hover:text-white"
              >
                <ArrowLeftRight className="h-4 w-4" />
                返回业务系统
              </Link>
            ) : null}
          </div>
        </div>
      </aside>

      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden bg-slate-50">
        <header className="z-30 shrink-0 border-b border-slate-200/60 bg-white/80 backdrop-blur-md">
          <div className="flex h-16 items-center justify-between px-4 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
              >
                <Menu className="h-6 w-6" />
              </button>
              <div className="hidden h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 text-white shadow-sm lg:flex">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="hidden lg:block">
                <p className="text-sm font-bold text-slate-900">KMS 管理后台</p>
                <p className="text-xs font-medium text-slate-500">独立管理页，和业务系统导航隔离</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-right">
              <div className="hidden lg:block">
                <p className="text-sm font-bold text-slate-900">{currentUser.full_name}</p>
                <p className="text-xs font-medium text-slate-500">{currentUser.username}</p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700 shadow-sm">
                {currentUser.full_name.slice(0, 1)}
              </div>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 custom-scrollbar lg:px-8 relative">{children}</main>
      </div>
    </div>
  );
}
