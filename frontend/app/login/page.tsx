import { redirect } from "next/navigation";

import { getCurrentUser } from "../../lib/auth";
import { PasswordVisibilityInput } from "@/components/password-visibility-input";
import { loginAction } from "./actions";
import { LoginSubmitButton } from "./login-submit-button";

type LoginPageProps = {
  searchParams?: Promise<{ error?: string; message?: string; remaining?: string; locked_until?: string }>;
};

function formatLockedUntil(lockedUntil?: string) {
  if (!lockedUntil) return "";
  const unlockedAt = new Date(lockedUntil);
  if (Number.isNaN(unlockedAt.getTime())) return lockedUntil;
  return unlockedAt.toLocaleString("zh-CN", {
    hour12: false,
    timeZone: "Asia/Shanghai"
  });
}

function getStatus(error?: string, message?: string, remaining?: string, lockedUntil?: string) {
  if (!error && !message) {
    return {
      state: "ready",
      code: "SYS://READY",
      text: "等待身份校验..."
    };
  }

  if (error === "locked") {
    const unlockedAt = formatLockedUntil(lockedUntil);
    return {
      state: "locked",
      code: "SYS://ACCOUNT_LOCKED",
      text: unlockedAt ? `${message || "账号已锁定，请稍后重试。"} 解锁时间：${unlockedAt} 北京时间` : message || "账号已锁定，请稍后重试。"
    };
  }

  if (error === "required") {
    return {
      state: "error",
      code: "SYS://MISSING_CREDENTIAL",
      text: "请输入识别码和密钥。"
    };
  }

  const suffix = remaining ? ` 剩余 ${remaining} 次。` : "";
  return {
    state: "error",
    code: "SYS://ACCESS_DENIED",
    text: `${message || "账号或密码错误，请重试。"}${suffix}`
  };
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const currentUser = await getCurrentUser();
  if (currentUser) {
    redirect("/");
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const status = getStatus(
    resolvedSearchParams?.error,
    resolvedSearchParams?.message,
    resolvedSearchParams?.remaining,
    resolvedSearchParams?.locked_until
  );
  const hasError = status.state === "error" || status.state === "locked";

  return (
    <main className="kms-login-body">
      <div className="kms-login-bg-text">KNOWLEDGE</div>
      <div className="kms-login-bg-text kms-bottom-text">SYSTEM</div>
      <div className="kms-login-scan-line" />

      <div className="kms-login-wrapper">
        <section className="kms-login-left" aria-label="系统标识">
          <div className="kms-brand-top">
            <span className="kms-sys-version">VER 3.1.4 //</span>
            <span className="kms-sys-name">KMS FORCE</span>
            <div className="kms-brand-line" />
          </div>

          <div className="kms-brand-center">
            <div className="kms-large-slogan">
              DATA
              <br />
              INTEGRATION
              <br />
              PROTOCOL
            </div>
          </div>

          <div className="kms-brand-bottom">
            <div className="kms-warning-box">
              <span className="kms-warning-icon">!</span>
              <div className="kms-warning-content">
                <span className="kms-warning-title">WARNING</span>
                <span className="kms-warning-text">UNAUTHORIZED ACCESS IS STRICTLY PROHIBITED</span>
              </div>
            </div>
          </div>
        </section>

        <section className="kms-login-right" aria-label="登录面板">
          <div className="kms-auth-panel">
            <div className="kms-auth-header">
              <h1 className="kms-auth-title">SYSTEM AUTHENTICATION</h1>
              <span className="kms-auth-subtitle">系统身份校验协议</span>
              <div className="kms-auth-line" />
            </div>

            <form action={loginAction} className="kms-auth-form">
              <div className="kms-edit-field">
                <label className="kms-cyber-label" htmlFor="loginUsername">
                  识别码 (ID / USERNAME)
                </label>
                <input
                  autoComplete="username"
                  className={`kms-cyber-input ${hasError ? "is-error" : ""}`}
                  id="loginUsername"
                  name="username"
                  placeholder="Input access ID..."
                  required
                  type="text"
                />
              </div>

              <div className="kms-edit-field">
                <label className="kms-cyber-label" htmlFor="loginPassword">
                  密钥 (PASSWORD)
                </label>
                <PasswordVisibilityInput
                  autoComplete="current-password"
                  className="kms-cyber-input"
                  hasError={hasError}
                  id="loginPassword"
                  name="password"
                  placeholder="Input secret key..."
                  required
                />
              </div>

              <div className="kms-auth-options">
                <div className="kms-session-policy">
                  <span className="kms-session-dot" />
                  <span>SESSION TTL // 12H 安全会话</span>
                </div>
                <div className="kms-contact-admin">CONTACT ADMIN?</div>
              </div>

              <LoginSubmitButton />

              <div className="kms-auth-status-panel" data-state={status.state} role="status" aria-live="polite">
                <span className="kms-status-code">{status.code}</span>
                <span className="kms-status-text">{status.text}</span>
              </div>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
