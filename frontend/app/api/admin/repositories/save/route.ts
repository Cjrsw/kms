import { redirect } from "next/navigation";

import { getSessionToken } from "../../../../../lib/auth";
import { API_BASE_URL } from "../../../../../lib/config";

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

function getReturnPath(formData: FormData): string {
  const rawValue = String(formData.get("return_path") ?? "").trim();
  if (!rawValue.startsWith("/admin")) {
    return "/admin/repositories";
  }
  return rawValue;
}

export async function POST(request: Request): Promise<Response> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/login");
  }

  const formData = await request.formData();
  const repositoryIdRaw = String(formData.get("repository_id") ?? "").trim();
  const isEdit = Boolean(repositoryIdRaw);
  const returnPath = getReturnPath(formData);

  const payload = {
    slug: parseRequiredString(formData, "slug"),
    name: parseRequiredString(formData, "name"),
    description: parseRequiredString(formData, "description"),
    cover_image_url:
      isEdit && !getOptionalFile(formData, "cover_image") && !parseBoolean(formData, "clear_cover_image")
        ? parseRequiredString(formData, "current_cover_image_url")
        : "",
    min_clearance_level: parseRequiredNumber(formData, "min_clearance_level"),
  };

  const saveResponse = await fetch(
    isEdit ? `${API_BASE_URL}/admin/repositories/${repositoryIdRaw}` : `${API_BASE_URL}/admin/repositories`,
    {
      method: isEdit ? "PUT" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    },
  );

  if (saveResponse.status === 401) {
    redirect("/logout");
  }
  if (!saveResponse.ok) {
    throw new Error("Repository save failed.");
  }

  const repository = (await saveResponse.json()) as { id: number };
  const coverFile = getOptionalFile(formData, "cover_image");
  const clearCover = parseBoolean(formData, "clear_cover_image");

  if (coverFile) {
    const coverFormData = new FormData();
    coverFormData.set("file", coverFile);
    const uploadResponse = await fetch(`${API_BASE_URL}/admin/repositories/${repository.id}/cover`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: coverFormData,
      cache: "no-store",
    });

    if (uploadResponse.status === 401) {
      redirect("/logout");
    }
    if (!uploadResponse.ok) {
      throw new Error("Repository cover upload failed.");
    }
  } else if (isEdit && clearCover) {
    const deleteResponse = await fetch(`${API_BASE_URL}/admin/repositories/${repository.id}/cover`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (deleteResponse.status === 401) {
      redirect("/logout");
    }
    if (!deleteResponse.ok) {
      throw new Error("Repository cover delete failed.");
    }
  }

  redirect(returnPath);
}
