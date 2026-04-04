"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createFolderAdmin,
  createNoteAdmin,
  createRepository,
  createUserAdmin,
  deleteFolderAdmin,
  deleteNoteAdmin,
  deleteRepositoryAdmin,
  deleteUserAdmin,
  updateFolderAdmin,
  updateNoteAdmin,
  updateRepositoryAdmin,
  updateUserAdmin
} from "../../lib/api";

function parseRequiredString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function parseRequiredNumber(formData: FormData, key: string): number {
  const value = Number(String(formData.get(key) ?? "").trim());
  if (Number.isNaN(value)) {
    throw new Error(`${key} is invalid.`);
  }
  return value;
}

function parseOptionalNumber(formData: FormData, key: string): number | null {
  const rawValue = String(formData.get(key) ?? "").trim();
  if (!rawValue) {
    return null;
  }

  const value = Number(rawValue);
  if (Number.isNaN(value)) {
    throw new Error(`${key} is invalid.`);
  }
  return value;
}

function parseBoolean(formData: FormData, key: string): boolean {
  return String(formData.get(key) ?? "").trim() === "true";
}

function parseStringList(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .map((item) => String(item).trim())
    .filter(Boolean);
}

function finishAdminMutation() {
  revalidatePath("/admin");
  revalidatePath("/repositories");
  revalidatePath("/search");
  revalidatePath("/qa");
  redirect("/admin");
}

export async function createRepositoryAction(formData: FormData) {
  await createRepository({
    slug: parseRequiredString(formData, "slug"),
    name: parseRequiredString(formData, "name"),
    description: parseRequiredString(formData, "description"),
    min_clearance_level: parseRequiredNumber(formData, "min_clearance_level")
  });

  finishAdminMutation();
}

export async function updateRepositoryAction(formData: FormData) {
  await updateRepositoryAdmin(String(formData.get("repository_id")), {
    slug: parseRequiredString(formData, "slug"),
    name: parseRequiredString(formData, "name"),
    description: parseRequiredString(formData, "description"),
    min_clearance_level: parseRequiredNumber(formData, "min_clearance_level")
  });

  finishAdminMutation();
}

export async function deleteRepositoryAction(formData: FormData) {
  await deleteRepositoryAdmin(String(formData.get("repository_id")));
  finishAdminMutation();
}

export async function createFolderAction(formData: FormData) {
  await createFolderAdmin({
    repository_id: parseRequiredNumber(formData, "repository_id"),
    parent_id: parseOptionalNumber(formData, "parent_id"),
    name: parseRequiredString(formData, "name"),
    min_clearance_level: parseRequiredNumber(formData, "min_clearance_level")
  });

  finishAdminMutation();
}

export async function updateFolderAction(formData: FormData) {
  await updateFolderAdmin(String(formData.get("folder_id")), {
    parent_id: parseOptionalNumber(formData, "parent_id"),
    name: parseRequiredString(formData, "name"),
    min_clearance_level: parseRequiredNumber(formData, "min_clearance_level")
  });

  finishAdminMutation();
}

export async function deleteFolderAction(formData: FormData) {
  await deleteFolderAdmin(String(formData.get("folder_id")));
  finishAdminMutation();
}

export async function createNoteAction(formData: FormData) {
  await createNoteAdmin({
    repository_id: parseRequiredNumber(formData, "repository_id"),
    folder_id: parseOptionalNumber(formData, "folder_id"),
    title: parseRequiredString(formData, "title"),
    content_text: parseRequiredString(formData, "content_text"),
    min_clearance_level: parseRequiredNumber(formData, "min_clearance_level")
  });

  finishAdminMutation();
}

export async function updateNoteAction(formData: FormData) {
  await updateNoteAdmin(String(formData.get("note_id")), {
    folder_id: parseOptionalNumber(formData, "folder_id"),
    title: parseRequiredString(formData, "title"),
    content_text: parseRequiredString(formData, "content_text"),
    min_clearance_level: parseRequiredNumber(formData, "min_clearance_level")
  });

  finishAdminMutation();
}

export async function deleteNoteAction(formData: FormData) {
  await deleteNoteAdmin(String(formData.get("note_id")));
  finishAdminMutation();
}

export async function createUserAction(formData: FormData) {
  await createUserAdmin({
    username: parseRequiredString(formData, "username"),
    full_name: parseRequiredString(formData, "full_name"),
    email: parseRequiredString(formData, "email"),
    password: parseRequiredString(formData, "password"),
    clearance_level: parseRequiredNumber(formData, "clearance_level"),
    is_active: parseBoolean(formData, "is_active"),
    role_codes: parseStringList(formData, "role_codes")
  });

  finishAdminMutation();
}

export async function updateUserAction(formData: FormData) {
  const password = parseRequiredString(formData, "password");

  await updateUserAdmin(String(formData.get("user_id")), {
    full_name: parseRequiredString(formData, "full_name"),
    email: parseRequiredString(formData, "email"),
    password: password || undefined,
    clearance_level: parseRequiredNumber(formData, "clearance_level"),
    is_active: parseBoolean(formData, "is_active"),
    role_codes: parseStringList(formData, "role_codes")
  });

  finishAdminMutation();
}

export async function deleteUserAction(formData: FormData) {
  await deleteUserAdmin(String(formData.get("user_id")));
  finishAdminMutation();
}
