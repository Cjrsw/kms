import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { API_BASE_URL, AUTH_COOKIE_NAME, AUTH_COOKIE_SECURE } from "./config";

export type AuthUser = {
  id: number;
  username: string;
  full_name: string;
  email: string;
  role_codes: string[];
  clearance_level: number;
};

type LoginResponse = {
  access_token: string;
};

export async function loginWithPassword(username: string, password: string): Promise<string | null> {
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

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as LoginResponse;
  return data.access_token;
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
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return user;
}

export function hasAnyRole(user: AuthUser, roleCodes: string[]): boolean {
  return roleCodes.some((roleCode) => user.role_codes.includes(roleCode));
}
