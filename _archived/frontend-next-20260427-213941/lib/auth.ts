import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { API_BASE_URL, AUTH_COOKIE_NAME, AUTH_COOKIE_SECURE } from "./config";

export type AuthUser = {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
  role_codes: string[];
  clearance_level: number;
  department_id: number | null;
  department_name: string | null;
  phone: string | null;
  position: string | null;
  gender: string | null;
  bio: string | null;
  has_avatar_upload: boolean;
  need_password_change: boolean;
};

type LoginResponse = {
  access_token: string;
};

type LoginErrorDetail = {
  code?: string;
  message?: string;
  remaining_attempts?: number | null;
  locked_until?: string | null;
};

export type LoginResult =
  | { ok: true; token: string }
  | { ok: false; code: string; message: string; remainingAttempts?: number; lockedUntil?: string };

export async function loginWithPassword(username: string, password: string): Promise<LoginResult> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username,
        password
      }),
      cache: "no-store"
    });

    if (response.ok) {
      const data = (await response.json()) as LoginResponse;
      return { ok: true, token: data.access_token };
    }

    const detail = (await response.json().catch(() => ({}))) as { detail?: LoginErrorDetail };
    return {
      ok: false,
      code: detail.detail?.code ?? "invalid",
      message: detail.detail?.message ?? "账号或密码错误，请重试。",
      remainingAttempts:
        typeof detail.detail?.remaining_attempts === "number" ? detail.detail.remaining_attempts : undefined,
      lockedUntil: detail.detail?.locked_until ?? undefined
    };
  } catch {
    return {
      ok: false,
      code: "network",
      message: "登录服务暂时不可用，请稍后重试。"
    };
  }
}

export async function setAuthSession(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: AUTH_COOKIE_SECURE,
    path: "/",
    maxAge: 60 * 60 * 12
  });
}

export async function clearAuthSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: AUTH_COOKIE_SECURE,
    path: "/",
    maxAge: 0
  });
}

export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(AUTH_COOKIE_NAME)?.value ?? null;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = await getSessionToken();
  if (!token) {
    return null;
  }

  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as AuthUser;
}

export async function requireCurrentUser(): Promise<AuthUser> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/login");
  }

  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    cache: "no-store"
  });
  if (response.status === 401) {
    redirect("/logout");
  }
  if (!response.ok) {
    redirect("/login");
  }

  return (await response.json()) as AuthUser;
}

export function hasAnyRole(user: AuthUser, roleCodes: string[]): boolean {
  return roleCodes.some((roleCode) => user.role_codes.includes(roleCode));
}
