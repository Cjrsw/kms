"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { Bell, Database, Info, LayoutDashboard, LogOut, Menu, MessageSquare, Search, Settings, User } from "lucide-react";
import { useState, type ReactNode } from "react";

import type { AuthUser } from "../lib/auth";

type NavigationItem = {
  href: string;
  label: string;
  matchers: string[];
  icon: typeof Database;
  requiredRoles?: string[];
};

const navigationItems: NavigationItem[] = [
  { href: "/repositories", label: "知识仓库", matchers: ["/repositories"], icon: Database },
  { href: "/search", label: "全文检索", matchers: ["/search"], icon: Search },
  { href: "/qa", label: "知识问答", matchers: ["/qa"], icon: MessageSquare },
  { href: "/admin", label: "后台系统", matchers: ["/admin"], icon: LayoutDashboard, requiredRoles: ["platform_admin", "repo_admin"] }
];

type AppShellProps = {
  title: string;
  description: string;
  children: ReactNode;
  contentClassName?: string;
  currentUser: AuthUser;
};

function isActive(pathname: string, matchers: string[]) {
  return matchers.some((matcher) => pathname === matcher || pathname.startsWith(`${matcher}/`));
}

export function AppShell({ title, description, children, contentClassName, currentUser }: AppShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const visibleNavigationItems = navigationItems.filter((item) => {
    if (!item.requiredRoles) {
      return true;
    }

    return item.requiredRoles.some((roleCode) => currentUser.role_codes.includes(roleCode));
  });

  return (
    <div className="flex h-screen bg-[#F5F7FA] font-sans text-gray-800">
      <aside
        className={clsx(
          "relative hidden flex-shrink-0 flex-col justify-between border-r border-gray-200 bg-white shadow-sm transition-all duration-300 ease-in-out lg:flex",
          collapsed ? "w-[72px]" : "w-64"
        )}
      >
        <div>
          <div
            className={clsx(
              "mb-4 flex h-16 items-center border-b border-gray-100",
              collapsed ? "justify-center px-0" : "px-4"
            )}
          >
            <button
              onClick={() => setCollapsed((value) => !value)}
              className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-blue-600"
              title={collapsed ? "展开主菜单" : "收起主菜单"}
              type="button"
            >
              <Menu className="h-5 w-5" />
            </button>

            {!collapsed && (
              <Link href="/repositories" className="ml-2 flex items-center overflow-hidden">
                <div className="flex h-7 w-7 items-center justify-center rounded bg-blue-600">
                  <span className="text-sm font-bold text-white">K</span>
                </div>
                <span className="ml-2 whitespace-nowrap text-lg font-bold tracking-tight text-gray-800">
                  智库 KMS
                </span>
              </Link>
            )}
          </div>

          <nav className="space-y-2 px-3">
            {visibleNavigationItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.matchers);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "flex items-center rounded-lg py-3 transition-all",
                    collapsed ? "justify-center px-0" : "px-3",
                    active
                      ? "bg-blue-50 font-semibold text-blue-700"
                      : "font-medium text-gray-600 hover:bg-gray-100"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon
                    className={clsx(
                      "h-5 w-5",
                      active ? "text-blue-600" : "text-gray-500",
                      collapsed ? "" : "mr-3"
                    )}
                  />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-col space-y-2 border-t border-gray-100 p-4">
          <button
            title={collapsed ? "通知" : undefined}
            className={clsx(
              "relative flex items-center rounded-lg py-2 text-gray-600 transition-colors hover:bg-gray-100",
              collapsed ? "justify-center px-0" : "px-3"
            )}
            type="button"
          >
            <Bell className={clsx("h-5 w-5", collapsed ? "" : "mr-3")} />
            {!collapsed && <span className="truncate text-sm font-medium">通知</span>}
            <span
              className={clsx(
                "absolute h-2 w-2 rounded-full bg-red-500",
                collapsed ? "right-6 top-2" : "right-3 top-2"
              )}
            />
          </button>

          <div className="group relative cursor-pointer">
            <div
              className={clsx(
                "flex items-center rounded-lg py-2 transition-colors hover:bg-gray-100",
                collapsed ? "justify-center px-0" : "px-3"
              )}
            >
              <div
                className={clsx(
                  "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 font-bold text-white shadow-sm",
                  collapsed ? "" : "mr-3"
                )}
              >
                {currentUser.full_name.slice(0, 1)}
              </div>
              {!collapsed && (
                <div className="flex-1 overflow-hidden">
                  <p className="truncate text-sm font-medium text-gray-800">{currentUser.full_name}</p>
                  <p className="truncate text-xs text-gray-500">{currentUser.username}</p>
                </div>
              )}
            </div>

            <div
              className={clsx(
                "invisible absolute z-50 w-56 rounded-xl border border-gray-100 bg-white opacity-0 shadow-lg transition-all duration-200 group-hover:visible group-hover:opacity-100",
                collapsed ? "bottom-0 left-full ml-2" : "bottom-full left-0 mb-2"
              )}
            >
              <div className="border-b border-gray-100 p-4">
                <p className="text-sm font-bold text-gray-800">{currentUser.full_name}</p>
                <p className="truncate text-xs text-gray-500">{currentUser.email}</p>
              </div>
              <div className="space-y-1 p-2">
                <MenuButton icon={<User className="h-4 w-4" />} label="个人中心" />
                {currentUser.role_codes.some((roleCode) => ["platform_admin", "repo_admin"].includes(roleCode)) ? (
                  <MenuButton icon={<Settings className="h-4 w-4" />} label="后台系统" href="/admin" />
                ) : null}
                <MenuButton icon={<Info className="h-4 w-4" />} label={`密级 L${currentUser.clearance_level}`} />
              </div>
              <div className="border-t border-gray-100 p-2">
                <MenuButton
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  href="/logout"
                  icon={<LogOut className="h-4 w-4" />}
                  label="退出登录"
                />
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main className="relative flex flex-1 flex-col overflow-hidden">
        <div className="sr-only">
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className={clsx("flex-1 overflow-auto", contentClassName ?? "p-8")}>{children}</div>
      </main>
    </div>
  );
}

type MenuButtonProps = {
  icon: ReactNode;
  label: string;
  href?: string;
  className?: string;
};

function MenuButton({ icon, label, href, className }: MenuButtonProps) {
  const content = (
    <div
      className={clsx(
        "flex w-full items-center rounded-md px-3 py-2 text-sm transition-colors",
        className ?? "text-gray-700 hover:bg-gray-50"
      )}
    >
      <span className="mr-3 opacity-70">{icon}</span>
      <span>{label}</span>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return <button type="button">{content}</button>;
}
