"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionToken } from "../../lib/auth";
import { API_BASE_URL } from "../../lib/config";
import {
  createDepartmentAdmin,
  createFolderAdmin,
  createNoteAdmin,
  createRepository,
  createUserAdmin,
  deleteFolderAdmin,
  deleteNoteAdmin,
  deleteRepositoryAdmin,
  deleteUserAdmin,
  updateAdminCorsOrigins,
  updateDepartmentAdmin,
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

function getReturnPath(formData: FormData, fallbackPath: string): string {
  const rawValue = String(formData.get("return_path") ?? "").trim();
  if (!rawValue.startsWith("/admin")) {
    return fallbackPath;
  }
  return rawValue;
}

function finishAdminMutation(formData: FormData, fallbackPath: string) {
  const returnPath = getReturnPath(formData, fallbackPath);
  revalidatePath("/admin");
  revalidatePath("/admin/users");
  revalidatePath("/admin/departments");
  revalidatePath("/admin/repositories");
  revalidatePath("/admin/folders");
  revalidatePath("/admin/security/cors");
  revalidatePath("/admin/security/auth-audit");
  revalidatePath("/admin/ai/prompt");
  revalidatePath("/admin/ai/qa-audit");
  revalidatePath("/repositories");
  revalidatePath("/search");
  revalidatePath("/qa");
  redirect(returnPath);
}

function parseBoolean(formData: FormData, key: string): boolean {
  const value = String(formData.get(key) ?? "").trim().toLowerCase();
  return value === "true" || value === "1" || value === "on";
}

function getOptionalFile(formData: FormData, key: string): File | null {
  const value = formData.get(key);
  if (!(value instanceof File) || value.size === 0) {
    return null;
  }
  return value;
}

async function uploadRepositoryCoverAction(repositoryId: number, file: File): Promise<void> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/login");
  }

  const body = new FormData();
  body.set("file", file);
  const response = await fetch(`${API_BASE_URL}/admin/repositories/${repositoryId}/cover`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body,
    cache: "no-store",
  });

  if (response.status === 401) {
    redirect("/logout");
  }
  if (!response.ok) {
    throw new Error("Repository cover upload failed.");
  }
}

async function deleteRepositoryCoverAction(repositoryId: number): Promise<void> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/login");
  }

  const response = await fetch(`${API_BASE_URL}/admin/repositories/${repositoryId}/cover`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (response.status === 401) {
    redirect("/logout");
  }
  if (!response.ok) {
    throw new Error("Repository cover delete failed.");
  }
}

export async function createRepositoryAction(formData: FormData) {
  const coverFile = getOptionalFile(formData, "cover_image");
  const repository = await createRepository({
    slug: parseRequiredString(formData, "slug"),
    name: parseRequiredString(formData, "name"),
    description: parseRequiredString(formData, "description"),
    cover_image_url: "",
    min_clearance_level: parseRequiredNumber(formData, "min_clearance_level")
  });
  if (coverFile) {
    await uploadRepositoryCoverAction(repository.id, coverFile);
  }

  finishAdminMutation(formData, "/admin/repositories");
}

export async function updateRepositoryAction(formData: FormData) {
  const coverFile = getOptionalFile(formData, "cover_image");
  const clearCover = parseBoolean(formData, "clear_cover_image");
  const coverImageUrl = coverFile || clearCover ? "" : parseRequiredString(formData, "current_cover_image_url");

  await updateRepositoryAdmin(String(formData.get("repository_id")), {
    slug: parseRequiredString(formData, "slug"),
    name: parseRequiredString(formData, "name"),
    description: parseRequiredString(formData, "description"),
    cover_image_url: coverImageUrl,
    min_clearance_level: parseRequiredNumber(formData, "min_clearance_level")
  });
  const repositoryId = Number(String(formData.get("repository_id") ?? "").trim());
  if (coverFile) {
    await uploadRepositoryCoverAction(repositoryId, coverFile);
  } else if (clearCover) {
    await deleteRepositoryCoverAction(repositoryId);
  }

  finishAdminMutation(formData, "/admin/repositories");
}

export async function deleteRepositoryAction(formData: FormData) {
  await deleteRepositoryAdmin(String(formData.get("repository_id")));
  finishAdminMutation(formData, "/admin/repositories");
}

export async function createFolderAction(formData: FormData) {
  await createFolderAdmin({
    repository_id: parseRequiredNumber(formData, "repository_id"),
    parent_id: parseOptionalNumber(formData, "parent_id"),
    name: parseRequiredString(formData, "name"),
    min_clearance_level: parseRequiredNumber(formData, "min_clearance_level")
  });

  finishAdminMutation(formData, "/admin/folders");
}

export async function updateFolderAction(formData: FormData) {
  await updateFolderAdmin(String(formData.get("folder_id")), {
    parent_id: parseOptionalNumber(formData, "parent_id"),
    name: parseRequiredString(formData, "name"),
    min_clearance_level: parseRequiredNumber(formData, "min_clearance_level")
  });

  finishAdminMutation(formData, "/admin/folders");
}

export async function deleteFolderAction(formData: FormData) {
  await deleteFolderAdmin(String(formData.get("folder_id")));
  finishAdminMutation(formData, "/admin/folders");
}

export async function createNoteAction(formData: FormData) {
  await createNoteAdmin({
    repository_id: parseRequiredNumber(formData, "repository_id"),
    folder_id: parseOptionalNumber(formData, "folder_id"),
    title: parseRequiredString(formData, "title"),
    content_text: parseRequiredString(formData, "content_text"),
    min_clearance_level: parseRequiredNumber(formData, "min_clearance_level")
  });

  finishAdminMutation(formData, "/admin/repositories");
}

export async function updateNoteAction(formData: FormData) {
  await updateNoteAdmin(String(formData.get("note_id")), {
    folder_id: parseOptionalNumber(formData, "folder_id"),
    title: parseRequiredString(formData, "title"),
    content_text: parseRequiredString(formData, "content_text"),
    min_clearance_level: parseRequiredNumber(formData, "min_clearance_level")
  });

  finishAdminMutation(formData, "/admin/repositories");
}

export async function deleteNoteAction(formData: FormData) {
  await deleteNoteAdmin(String(formData.get("note_id")));
  finishAdminMutation(formData, "/admin/repositories");
}

export async function createUserAction(formData: FormData) {
  await createUserAdmin({
    full_name: parseRequiredString(formData, "full_name"),
    department_id: parseOptionalNumber(formData, "department_id"),
    position: parseRequiredString(formData, "position") || null,
    gender: parseRequiredString(formData, "gender") || null,
    clearance_level: parseRequiredNumber(formData, "clearance_level")
  });
  finishAdminMutation(formData, "/admin/users");
}

export async function updateUserAction(formData: FormData) {
  await updateUserAdmin(String(formData.get("user_id")), {
    full_name: parseRequiredString(formData, "full_name"),
    department_id: parseOptionalNumber(formData, "department_id"),
    position: parseRequiredString(formData, "position") || null,
    gender: parseRequiredString(formData, "gender") || null,
    phone: parseRequiredString(formData, "phone") || null,
    email: parseRequiredString(formData, "email") || null,
    bio: parseRequiredString(formData, "bio") || null,
    clearance_level: parseRequiredNumber(formData, "clearance_level"),
    is_active: parseBoolean(formData, "is_active"),
  });
  finishAdminMutation(formData, "/admin/users");
}

export async function deleteUserAction(formData: FormData) {
  await deleteUserAdmin(String(formData.get("user_id")));
  finishAdminMutation(formData, "/admin/users");
}

export async function createDepartmentAction(formData: FormData) {
  await createDepartmentAdmin({
    code: parseRequiredString(formData, "code"),
    name: parseRequiredString(formData, "name"),
    parent_id: parseOptionalNumber(formData, "parent_id"),
    sort_order: parseRequiredNumber(formData, "sort_order"),
    is_active: parseBoolean(formData, "is_active"),
  });
  finishAdminMutation(formData, "/admin/departments");
}

export async function updateDepartmentAction(formData: FormData) {
  await updateDepartmentAdmin(String(formData.get("department_id")), {
    code: parseRequiredString(formData, "code"),
    name: parseRequiredString(formData, "name"),
    parent_id: parseOptionalNumber(formData, "parent_id"),
    sort_order: parseRequiredNumber(formData, "sort_order"),
    is_active: parseBoolean(formData, "is_active"),
  });
  finishAdminMutation(formData, "/admin/departments");
}

export async function updateCorsOriginsAction(formData: FormData) {
  const rawValue = parseRequiredString(formData, "origins");
  const origins = rawValue
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
  await updateAdminCorsOrigins(origins);
  finishAdminMutation(formData, "/admin/security/cors");
}
