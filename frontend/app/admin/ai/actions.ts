"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createAdminAiModel,
  deleteAdminAiModel,
  disableAdminAiModel,
  enableAdminAiModel,
  updateAdminAiDefaults,
  updateAdminAiModel,
} from "../../../lib/api";

function parseString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function parseOptionalNumber(formData: FormData, key: string): number | null {
  const raw = parseString(formData, key);
  if (!raw) {
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${key} invalid`);
  }
  return value;
}

function parseJsonObject(formData: FormData, key: string): Record<string, unknown> {
  const raw = parseString(formData, key);
  if (!raw) {
    return {};
  }
  const parsed = JSON.parse(raw);
  if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) {
    throw new Error(`${key} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function finish() {
  revalidatePath("/admin/ai");
  revalidatePath("/qa");
  redirect("/admin/ai");
}

export async function createAiModelAction(formData: FormData) {
  await createAdminAiModel({
    name: parseString(formData, "name"),
    provider: "openai_compatible",
    capability: parseString(formData, "capability") as "chat" | "embedding",
    api_base_url: parseString(formData, "api_base_url"),
    model_name: parseString(formData, "model_name"),
    api_key: parseString(formData, "api_key"),
    max_tokens: parseOptionalNumber(formData, "max_tokens"),
    timeout_seconds: parseOptionalNumber(formData, "timeout_seconds") ?? 30,
    description: parseString(formData, "description"),
    is_enabled: parseString(formData, "is_enabled") !== "false",
    extra_headers: parseJsonObject(formData, "extra_headers") as Record<string, string>,
    extra_body: parseJsonObject(formData, "extra_body"),
  });
  finish();
}

export async function updateAiModelAction(formData: FormData) {
  const modelId = Number(parseString(formData, "model_id"));
  if (!Number.isFinite(modelId)) {
    throw new Error("model_id invalid");
  }
  const apiKey = parseString(formData, "api_key");
  await updateAdminAiModel(modelId, {
    name: parseString(formData, "name"),
    provider: "openai_compatible",
    capability: parseString(formData, "capability") as "chat" | "embedding",
    api_base_url: parseString(formData, "api_base_url"),
    model_name: parseString(formData, "model_name"),
    api_key: apiKey || undefined,
    max_tokens: parseOptionalNumber(formData, "max_tokens"),
    timeout_seconds: parseOptionalNumber(formData, "timeout_seconds") ?? 30,
    description: parseString(formData, "description"),
    is_enabled: parseString(formData, "is_enabled") !== "false",
    extra_headers: parseJsonObject(formData, "extra_headers") as Record<string, string>,
    extra_body: parseJsonObject(formData, "extra_body"),
  });
  finish();
}

export async function toggleAiModelAction(formData: FormData) {
  const modelId = Number(parseString(formData, "model_id"));
  const action = parseString(formData, "action");
  if (!Number.isFinite(modelId)) {
    throw new Error("model_id invalid");
  }
  if (action === "enable") {
    await enableAdminAiModel(modelId);
  } else {
    await disableAdminAiModel(modelId);
  }
  finish();
}

export async function saveAiDefaultsAction(formData: FormData) {
  await updateAdminAiDefaults({
    chat_default_model_id: parseOptionalNumber(formData, "chat_default_model_id"),
    embedding_default_model_id: parseOptionalNumber(formData, "embedding_default_model_id"),
  });
  finish();
}

export async function deleteAiModelAction(formData: FormData) {
  const modelId = Number(parseString(formData, "model_id"));
  if (!Number.isFinite(modelId)) {
    throw new Error("model_id invalid");
  }
  await deleteAdminAiModel(modelId);
  finish();
}
