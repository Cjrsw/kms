"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { updateAdminQaSystemPrompt } from "../../../lib/api";

function parseString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function saveSystemPromptAction(formData: FormData) {
  const systemPrompt = parseString(formData, "system_prompt");
  if (!systemPrompt) {
    throw new Error("system_prompt is required");
  }
  await updateAdminQaSystemPrompt({ system_prompt: systemPrompt });
  revalidatePath("/admin");
  revalidatePath("/admin/ai/prompt");
  revalidatePath("/qa");
  redirect("/admin/ai/prompt");
}
