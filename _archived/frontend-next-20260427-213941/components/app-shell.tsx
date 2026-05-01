"use client";

import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { Bell, Info, LogOut, Menu, Settings, User } from "lucide-react";
import { useState, type ReactNode } from "react";

import type { AuthUser } from "../lib/auth";

type NavigationItem = {
  href: string;
  label: string;
  en: string;
  matchers: string[];
};

const navigationItems: NavigationItem[] = [
  { href: "/", label: "首页", en: "HOME", matchers: ["/"] },
  { href: "/repositories", label: "知识仓库", en: "REPOSITORY", matchers: ["/repositories"] },
  { href: "/search", label: "全文检索", en: "SEARCH", matchers: ["/search"] },
  { href: "/qa", label: "知识问答", en: "Q&A", matchers: ["/qa"] },
  { href: "/profile", label: "个人中心", en: "PROFILE", matchers: ["/profile"] }
];

type AppShellProps = {
  title: string;
  description: string;
  children: ReactNode;
  contentClassName?: string;
  currentUser: AuthUser;
};

function isActive(pathname: string, matchers: string[]) {
  return matchers.some((matcher) => {
    if (matcher === "/") {
      return pathname === "/";
    }
    return pathname === matcher || pathname.startsWith(`${matcher}/`);
  });
}

function resolveCurrentItem(pathname: string) {
  return navigationItems.find((item) => isActive(pathname, item.matchers)) ?? navigationItems[0];
}

export function AppShell({ title, description, children, contentClassName, currentUser }: AppShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const currentItem = resolveCurrentItem(pathname);
  const currentIndex = Math.max(
    0,
    navigationItems.findIndex((item) => item.href === currentItem.href)
  );
  const avatarUrl = currentUser.has_avatar_upload ? "/api/profile/avatar" : null;

  return (
    <div className={clsx("kms-shell", collapsed && "kms-shell-collapsed", mobileMenuOpen && "kms-shell-mobile-open")}>
      <div className="kms-bg-watermark">KNOWLEDGE</div>
      {mobileMenuOpen ? (
        <button
          aria-label="关闭导航遮罩"
          className="kms-mobile-mask"
          onClick={() => setMobileMenuOpen(false)}
          type="button"
        />
      ) : null}

      <div className="kms-layout-wrapper">
        <header className="kms-top-header">
          <div className="kms-header-side kms-left-side">
            <div className="kms-line-drawing kms-left-drawing">
              <div className="kms-h-line" />
              <div className="kms-dot" />
              <div className="kms-d-line" />
            </div>
            <span className="kms-event-tag">
              EVENT <span className="kms-event-num">{String(currentIndex + 1).padStart(2, "0")}</span>
            </span>
          </div>

          <div className="kms-header-center">
            <h1 className="kms-main-title">{title}</h1>
            <div className="kms-sub-title-container">
              <span className="kms-sub-title-lines" />
              <div className="kms-news-pattern">
                <span className="kms-sub-title-text">{currentItem.en}</span>
              </div>
              <span className="kms-sub-title-lines" />
            </div>
            <div className="kms-center-triangle" />
          </div>

          <div className="kms-header-side kms-right-side">
            <span className="kms-event-tag">
              EVENT <span className="kms-event-num">{String(currentIndex + 1).padStart(2, "0")}</span>
            </span>
            <div className="kms-line-drawing kms-right-drawing">
              <div className="kms-d-line" />
              <div className="kms-dot" />
              <div className="kms-h-line" />
            </div>
          </div>
        </header>

        <button className="kms-mobile-floating-menu" onClick={() => setMobileMenuOpen(true)} type="button">
          <Menu className="h-5 w-5" />
          <span>MENU</span>
        </button>

        <div className="kms-body-area">
          <aside className="kms-sidebar">
            <button
              className="kms-hamburger"
              onClick={() => setCollapsed((value) => !value)}
              title={collapsed ? "展开主菜单" : "收起主菜单"}
              type="button"
            >
              <span />
              <span />
              <span />
            </button>

            <nav aria-label="主导航">
              <ul className="kms-nav-list">
                {navigationItems.map((item) => {
                  const active = isActive(pathname, item.matchers);
                  return (
                    <li className={active ? "active" : undefined} key={item.href}>
                      <a href={item.href} title={collapsed ? item.label : undefined} onClick={() => setMobileMenuOpen(false)}>
                        <span data-en={item.en}>{item.label}</span>
                      </a>
                      {active ? (
                        <div className="kms-active-decor">
                          <span className="kms-decor-line" />
                          <span className="kms-decor-text">{item.en}</span>
                          <span className="kms-decor-line" />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="kms-sidebar-footer">
              <button className="kms-mobile-menu-button" onClick={() => setMobileMenuOpen(true)} type="button">
                <Menu className="h-5 w-5" />
                <span>菜单</span>
              </button>

              <button className="kms-notice-button" type="button">
                <Bell className="h-4 w-4" />
                <span>通知</span>
                {currentUser.need_password_change ? <span className="kms-red-dot" /> : null}
              </button>

              <div className="kms-user-panel">
                <div className="kms-user-trigger">
                  <div className="kms-avatar">
                    {avatarUrl ? (
                      <img alt={`${currentUser.full_name} avatar`} src={avatarUrl} />
                    ) : (
                      <span>{currentUser.full_name.slice(0, 1)}</span>
                    )}
                  </div>
                  <div className="kms-user-text">
                    <strong>{currentUser.full_name}</strong>
                    <span>{currentUser.username}</span>
                  </div>
                </div>
                <div className="kms-user-menu">
                  <div className="kms-user-menu-head">
                    <strong>{currentUser.full_name}</strong>
                    <span>{currentUser.email || currentUser.username}</span>
                  </div>
                  <a href="/profile">
                    <User className="h-4 w-4" />
                    个人中心
                  </a>
                  {currentUser.role_codes.includes("admin") ? (
                    <a href="/admin">
                      <Settings className="h-4 w-4" />
                      后台系统
                    </a>
                  ) : null}
                  <span className="kms-user-menu-info">
                    <Info className="h-4 w-4" />
                    密级 L{currentUser.clearance_level}
                  </span>
                  <a className="danger" href="/logout">
                    <LogOut className="h-4 w-4" />
                    退出登录
                  </a>
                </div>
              </div>
            </div>
          </aside>

          <main className="kms-main-content">
            <div className="sr-only">
              <h1>{title}</h1>
              <p>{description}</p>
            </div>
            <div className={clsx("kms-content-scroll custom-scrollbar", contentClassName ?? "kms-content-default")}>
              {children}
            </div>
          </main>
        </div>

        <footer className="kms-bottom-footer">
          <div className="kms-footer-left">
            <span className="kms-arrows">▶ ▶ ▶</span>
            <span className="kms-force-text">KNOWLEDGE FORCE</span>
            <div className="kms-footer-line" />
          </div>
          <div className="kms-footer-center">
            <div className="kms-caution-wrapper">
              <span className="kms-caution-text">CAUTION</span>
              <svg className="kms-caution-triangle" viewBox="0 0 88 64" aria-hidden="true">
                <path d="M2 2 H86 L44 62 Z" />
              </svg>
            </div>
          </div>
          <div className="kms-footer-right">
            <div className="kms-footer-line" />
            <div className="kms-slashes">////////</div>
            <div className="kms-corner-shape" />
          </div>
        </footer>
      </div>
    </div>
  );
}
