"use client";

import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Menu } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

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
  children: ReactNode;
  currentUser: AuthUser;
};

type RollingTextProps = {
  value: string;
  direction: "up" | "down";
  className: string;
  element?: "h1" | "span";
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

function RollingText({ value, direction, className, element = "span" }: RollingTextProps) {
  const [currentValue, setCurrentValue] = useState(value);
  const elementRef = useRef<HTMLElement | null>(null);
  const currentValueRef = useRef(value);
  const timeoutRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const elementNode = elementRef.current;
    if (!elementNode || value === currentValueRef.current) {
      return undefined;
    }

    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (frameRef.current) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    const previousValue = currentValueRef.current;
    const originalStyle = elementNode.getAttribute("style");
    const height = elementNode.getBoundingClientRect().height || elementNode.offsetHeight;
    const windowHeight = height > 0 ? height : undefined;
    const wrapper = document.createElement("span");
    const oldItem = document.createElement("span");
    const newItem = document.createElement("span");
    const clip = document.createElement("span");

    wrapper.className = "kms-roll-stack-inline";
    oldItem.className = "kms-roll-item-inline";
    newItem.className = "kms-roll-item-inline";
    clip.className = "kms-roll-clip-inline";

    oldItem.textContent = previousValue;
    newItem.textContent = value;

    if (windowHeight) {
      clip.style.height = `${windowHeight}px`;
      oldItem.style.height = `${windowHeight}px`;
      newItem.style.height = `${windowHeight}px`;
    }

    if (direction === "up") {
      wrapper.append(oldItem, newItem);
    } else {
      wrapper.append(newItem, oldItem);
      wrapper.style.transform = windowHeight ? `translateY(-${windowHeight}px)` : "translateY(-100%)";
    }

    clip.append(wrapper);
    elementNode.replaceChildren(clip);

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      wrapper.style.transform =
        direction === "up" ? (windowHeight ? `translateY(-${windowHeight}px)` : "translateY(-50%)") : "translateY(0)";
    });

    timeoutRef.current = window.setTimeout(() => {
      elementNode.textContent = value;
      if (originalStyle === null) {
        elementNode.removeAttribute("style");
      } else {
        elementNode.setAttribute("style", originalStyle);
      }
      currentValueRef.current = value;
      setCurrentValue(value);
      timeoutRef.current = null;
    }, 640);

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [direction, value]);

  const Tag = element;
  return <Tag className={className} ref={(node) => { elementRef.current = node; }}>{currentValue}</Tag>;
}

function resolveContentClassName(pathname: string) {
  if (pathname === "/") {
    return "kms-content-home";
  }
  if (pathname.startsWith("/qa")) {
    return "kms-content-qa";
  }
  if (pathname.startsWith("/search")) {
    return "kms-content-search";
  }
  if (pathname === "/repositories") {
    return "kms-content-repositories";
  }
  if (/^\/repositories\/[^/]+\/notes\/[^/]+$/.test(pathname)) {
    return "kms-content-note-read";
  }
  if (/^\/repositories\/[^/]+\/notes\/[^/]+\/edit$/.test(pathname)) {
    return "kms-content-note-edit";
  }
  if (pathname.startsWith("/profile")) {
    return "kms-content-profile";
  }
  return "kms-content-default";
}

export function AppShell({ children, currentUser }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const currentItem = resolveCurrentItem(pathname);
  const currentIndex = Math.max(
    0,
    navigationItems.findIndex((item) => item.href === currentItem.href)
  );
  const [visualItem, setVisualItem] = useState(currentItem);
  const [visualIndex, setVisualIndex] = useState(currentIndex);
  const [rollDirection, setRollDirection] = useState<"up" | "down">("up");
  const [indicatorTop, setIndicatorTop] = useState<number | null>(null);
  const [activeDecorVisible, setActiveDecorVisible] = useState(false);
  const [navMotion, setNavMotion] = useState<{ from: number | null; to: number | null }>({ from: null, to: null });
  const [pagePhase, setPagePhase] = useState<"idle" | "exiting" | "entering">("entering");
  const navItemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const decorTimeoutRef = useRef<number | null>(null);
  const navMotionTimeoutRef = useRef<number | null>(null);
  const routeTimeoutRef = useRef<number | null>(null);
  const phaseTimeoutRef = useRef<number | null>(null);

  function calculateIndicatorTop(index: number, useFinalActiveLayout: boolean) {
    const targetElement = navItemRefs.current[index];
    const link = targetElement?.querySelector("a") as HTMLElement | null;
    const navList = targetElement?.closest(".kms-nav-list") as HTMLElement | null;
    if (!targetElement || !link || !navList) {
      return null;
    }

    if (!useFinalActiveLayout) {
      const linkRect = link.getBoundingClientRect();
      const listRect = navList.getBoundingClientRect();
      return linkRect.top - listRect.top + linkRect.height / 2;
    }

    const previousActiveItems = Array.from(navList.querySelectorAll("li.active"));
    const disableTransitionStyle = document.createElement("style");
    disableTransitionStyle.textContent = ".kms-nav-list li a { animation: none !important; transition: none !important; }";
    document.head.appendChild(disableTransitionStyle);

    previousActiveItems.forEach((element) => element.classList.remove("active"));
    targetElement.classList.add("active");

    const linkRect = link.getBoundingClientRect();
    const listRect = navList.getBoundingClientRect();
    const top = linkRect.top - listRect.top + linkRect.height / 2;

    targetElement.classList.remove("active");
    previousActiveItems.forEach((element) => element.classList.add("active"));
    void document.body.offsetHeight;
    document.head.removeChild(disableTransitionStyle);

    return top;
  }

  useLayoutEffect(() => {
    setVisualItem(currentItem);
    setVisualIndex(currentIndex);
  }, [currentItem, currentIndex]);

  useEffect(() => {
    navigationItems.forEach((item) => {
      router.prefetch(item.href);
    });
  }, [router]);

  useEffect(() => {
    setActiveDecorVisible(false);
    if (decorTimeoutRef.current) {
      window.clearTimeout(decorTimeoutRef.current);
    }
    decorTimeoutRef.current = window.setTimeout(() => {
      setActiveDecorVisible(true);
      decorTimeoutRef.current = null;
    }, 600);

    return () => {
      if (decorTimeoutRef.current) {
        window.clearTimeout(decorTimeoutRef.current);
        decorTimeoutRef.current = null;
      }
    };
  }, [visualItem.href]);

  useEffect(() => {
    return () => {
      if (routeTimeoutRef.current) {
        window.clearTimeout(routeTimeoutRef.current);
        routeTimeoutRef.current = null;
      }
      if (navMotionTimeoutRef.current) {
        window.clearTimeout(navMotionTimeoutRef.current);
        navMotionTimeoutRef.current = null;
      }
    };
  }, []);

  useLayoutEffect(() => {
    const nextTop = calculateIndicatorTop(visualIndex, true);
    if (nextTop !== null) {
      setIndicatorTop(nextTop);
    }
  }, [visualIndex, collapsed]);

  useEffect(() => {
    setPagePhase("entering");
    if (phaseTimeoutRef.current) {
      window.clearTimeout(phaseTimeoutRef.current);
    }
    phaseTimeoutRef.current = window.setTimeout(() => {
      setPagePhase("idle");
      phaseTimeoutRef.current = null;
    }, 420);
    return () => {
      if (phaseTimeoutRef.current) {
        window.clearTimeout(phaseTimeoutRef.current);
        phaseTimeoutRef.current = null;
      }
    };
  }, [pathname]);

  function handleNavClick(event: MouseEvent<HTMLAnchorElement>, item: NavigationItem, index: number) {
    setMobileMenuOpen(false);
    event.preventDefault();
    if (pathname === item.href) {
      return;
    }

    setRollDirection(index > visualIndex ? "up" : "down");
    const nextTop = calculateIndicatorTop(index, true);
    if (nextTop !== null) {
      setIndicatorTop(nextTop);
    }
    if (navMotionTimeoutRef.current) {
      window.clearTimeout(navMotionTimeoutRef.current);
    }
    setNavMotion({ from: visualIndex, to: index });
    navMotionTimeoutRef.current = window.setTimeout(() => {
      setNavMotion({ from: null, to: null });
      navMotionTimeoutRef.current = null;
    }, 620);
    setVisualItem(item);
    setVisualIndex(index);
    setPagePhase("exiting");
    if (routeTimeoutRef.current) {
      window.clearTimeout(routeTimeoutRef.current);
    }
    routeTimeoutRef.current = window.setTimeout(() => {
      router.push(item.href);
      routeTimeoutRef.current = null;
    }, 220);
  }

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
              EVENT{" "}
              <RollingText
                className="kms-event-num"
                direction={rollDirection}
                value={String(visualIndex + 1).padStart(2, "0")}
              />
            </span>
          </div>

          <div className="kms-header-center">
            <RollingText className="kms-main-title" direction={rollDirection} element="h1" value={visualItem.label} />
            <div className="kms-sub-title-container">
              <span className="kms-sub-title-lines" />
              <div className="kms-news-pattern">
                <RollingText className="kms-sub-title-text" direction={rollDirection} value={visualItem.en} />
              </div>
              <span className="kms-sub-title-lines" />
            </div>
            <div className="kms-center-triangle" />
          </div>

          <div className="kms-header-side kms-right-side">
            <span className="kms-event-tag">
              EVENT{" "}
              <RollingText
                className="kms-event-num"
                direction={rollDirection}
                value={String(visualIndex + 1).padStart(2, "0")}
              />
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
                {indicatorTop !== null ? <span className="kms-nav-indicator" style={{ top: `${indicatorTop}px` }} /> : null}
                {navigationItems.map((item, index) => {
                  const visualActive = visualItem.href === item.href;
                  return (
                    <li
                      className={clsx(
                        visualActive && "active",
                        navMotion.to === index && "kms-nav-entering",
                        navMotion.from === index && "kms-nav-leaving",
                      )}
                      key={item.href}
                      ref={(element) => {
                        navItemRefs.current[index] = element;
                      }}
                    >
                      <a
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        onClick={(event) => handleNavClick(event, item, index)}
                      >
                        <span data-en={item.en}>{item.label}</span>
                      </a>
                      {visualActive && activeDecorVisible ? (
                        <div className="kms-active-decor" key={`decor-${visualItem.href}`}>
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
          </aside>

          <main className="kms-main-content">
            <div className="sr-only">
              <h1>{currentItem.label}</h1>
              <p>企业知识管理系统用户侧页面</p>
            </div>
            <div
              className={clsx(
                "kms-content-scroll custom-scrollbar",
                resolveContentClassName(pathname),
                `kms-page-${pagePhase}`,
              )}
            >
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
