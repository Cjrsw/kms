"use client";

import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { Bell, Database, Info, LogOut, Menu, MessageSquare, Search, Settings, User } from "lucide-react";
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
  { href: "/qa", label: "知识问答", matchers: ["/qa"], icon: MessageSquare }
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const avatarUrl = currentUser.has_avatar_upload ? "/api/profile/avatar" : null;

  const visibleNavigationItems = navigationItems.filter((item) => {
    if (!item.requiredRoles) return true;
    return item.requiredRoles.some((roleCode) => currentUser.role_codes.includes(roleCode));
  });

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 font-sans text-slate-800">
      {/* 移动端遮罩层 */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm transition-opacity lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* 侧边栏 */}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 flex flex-col justify-between border-r border-slate-200/60 bg-white/80 backdrop-blur-md shadow-glass transition-all duration-300 ease-in-out lg:static",
          collapsed ? "w-[72px]" : "w-64",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div>
          <div
            className={clsx(
              "mb-4 flex h-16 items-center border-b border-slate-100",
              collapsed ? "justify-center px-0" : "px-4"
            )}
          >
            <button
              onClick={() => setCollapsed((value) => !value)}
              className="hidden rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-indigo-600 lg:block"
              title={collapsed ? "展开主菜单" : "收起主菜单"}
              type="button"
            >
              <Menu className="h-5 w-5" />
            </button>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-indigo-600"
              type="button"
            >
              <Menu className="h-5 w-5" />
            </button>

            {!collapsed && (
              <a href="/repositories" className="ml-2 flex items-center overflow-hidden">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 shadow-sm">
                  <span className="text-sm font-bold text-white">K</span>
                </div>
                <span className="ml-3 whitespace-nowrap text-lg font-extrabold tracking-tight text-slate-800">
                  智库 KMS
                </span>
              </a>
            )}
          </div>

          <nav className="space-y-1.5 px-3">
            {visibleNavigationItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.matchers);

              return (
                <a
                  key={item.href}
                  className={clsx(
                    "group flex items-center rounded-xl py-3 transition-all duration-300",
                    collapsed ? "justify-center px-0" : "px-3",
                    active
                      ? "bg-gradient-to-r from-indigo-50/80 to-blue-50/50 font-semibold text-indigo-700 shadow-sm"
                      : "font-medium text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
                  )}
                  title={collapsed ? item.label : undefined}
                  href={item.href}
                >
                  <Icon
                    className={clsx(
                      "h-5 w-5 transition-transform duration-300",
                      active ? "text-indigo-600 scale-110" : "text-slate-400 group-hover:text-slate-600 group-hover:scale-110",
                      collapsed ? "" : "mr-3"
                    )}
                  />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </a>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-col space-y-2 border-t border-slate-100 p-4">
          <button
            title={collapsed ? "通知" : undefined}
            className={clsx(
              "relative flex items-center rounded-xl py-2 text-slate-600 transition-colors hover:bg-slate-100",
              collapsed ? "justify-center px-0" : "px-3"
            )}
            type="button"
          >
            <Bell className={clsx("h-5 w-5", collapsed ? "" : "mr-3")} />
            {!collapsed && <span className="truncate text-sm font-medium">通知</span>}
            {currentUser.need_password_change ? (
              <span
                className={clsx(
                  "absolute h-2 w-2 rounded-full bg-rose-500 shadow-sm",
                  collapsed ? "right-6 top-2" : "right-3 top-2"
                )}
              />
            ) : null}
          </button>

          <div className="group relative cursor-pointer">
            <div
              className={clsx(
                "flex items-center rounded-xl py-2 transition-colors hover:bg-slate-100",
                collapsed ? "justify-center px-0" : "px-3"
              )}
            >
              <div
                className={clsx(
                  "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-500 to-blue-600 font-bold text-white shadow-sm ring-2 ring-white",
                  collapsed ? "" : "mr-3"
                )}
              >
                {avatarUrl ? (
                  <img alt={`${currentUser.full_name} avatar`} className="h-full w-full rounded-full object-cover" src={avatarUrl} />
                ) : (
                  currentUser.full_name.slice(0, 1)
                )}
              </div>
              {!collapsed && (
                <div className="flex-1 overflow-hidden">
                  <p className="truncate text-sm font-bold text-slate-800">{currentUser.full_name}</p>
                  <p className="truncate text-xs font-medium text-slate-500">{currentUser.username}</p>
                </div>
              )}
            </div>

            <div
              className={clsx(
                "invisible absolute z-50 w-56 rounded-2xl border border-slate-100/50 bg-white/95 backdrop-blur-md opacity-0 shadow-floating transition-all duration-300 group-hover:visible group-hover:opacity-100",
                collapsed ? "bottom-0 left-full ml-3" : "bottom-full left-0 mb-3"
              )}
            >
              <div className="border-b border-slate-100/60 p-4">
                <p className="text-sm font-bold text-slate-800">{currentUser.full_name}</p>
                <p className="truncate text-xs font-medium text-slate-500">{currentUser.email}</p>
              </div>
              <div className="space-y-1 p-2">
                <MenuButton icon={<User className="h-4 w-4" />} label="个人中心" href="/profile" />
                {currentUser.role_codes.includes("admin") ? (
                  <MenuButton icon={<Settings className="h-4 w-4" />} label="后台系统" href="/admin" />
                ) : null}
                <MenuButton icon={<Info className="h-4 w-4" />} label={`密级 L${currentUser.clearance_level}`} />
              </div>
              <div className="border-t border-slate-100/60 p-2">
                <MenuButton
                  className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                  href="/logout"
                  icon={<LogOut className="h-4 w-4" />}
                  label="退出登录"
                />
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="relative flex flex-1 flex-col overflow-hidden bg-slate-50">
        {/* 移动端顶栏 */}
        <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-slate-200/60 bg-white/80 px-4 backdrop-blur-md lg:hidden">
          <div className="flex items-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 shadow-sm">
              <span className="text-sm font-bold text-white">K</span>
            </div>
            <span className="ml-3 text-lg font-extrabold tracking-tight text-slate-800">
              智库 KMS
            </span>
          </div>
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-indigo-600"
            type="button"
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>

        <div className="sr-only">
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className={clsx("flex-1 overflow-auto custom-scrollbar relative", contentClassName ?? "p-4 lg:p-8")}>{children}</div>
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
        "flex w-full items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300",
        className ?? "text-slate-700 hover:bg-slate-50 hover:text-indigo-600"
      )}
    >
      <span className="mr-3 opacity-80">{icon}</span>
      <span>{label}</span>
    </div>
  );

  if (href) {
    return <a href={href}>{content}</a>;
  }

  return <button type="button" className="w-full text-left">{content}</button>;
}
