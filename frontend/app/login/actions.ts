"use server";

import { redirect } from "next/navigation";

import { loginWithPassword, setAuthSession } from "../../lib/auth";

export async function loginAction(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();

  if (!username || !password) {
    redirect("/login?error=required");
  }

  const result = await loginWithPassword(username, password);
  if (!result.ok) {
    const params = new URLSearchParams({
      error: result.code,
      message: result.message
    });
    if (typeof result.remainingAttempts === "number") {
      params.set("remaining", String(result.remainingAttempts));
    }
    if (result.lockedUntil) {
      params.set("locked_until", result.lockedUntil);
    }
    redirect(`/login?${params.toString()}`);
  }

  await setAuthSession(result.token);
  redirect("/");
}
