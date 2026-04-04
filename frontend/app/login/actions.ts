"use server";

import { redirect } from "next/navigation";

import { loginWithPassword, setAuthSession } from "../../lib/auth";

export async function loginAction(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();

  if (!username || !password) {
    redirect("/login?error=required");
  }

  const token = await loginWithPassword(username, password);
  if (!token) {
    redirect("/login?error=invalid");
  }

  await setAuthSession(token);
  redirect("/repositories");
}
