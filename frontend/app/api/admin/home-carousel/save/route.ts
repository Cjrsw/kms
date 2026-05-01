import { redirect } from "next/navigation";

import { getSessionToken } from "../../../../../lib/auth";
import { API_BASE_URL } from "../../../../../lib/config";

function getReturnPath(formData: FormData): string {
  const rawValue = String(formData.get("return_path") ?? "").trim();
  if (!rawValue.startsWith("/admin")) {
    return "/admin/home-carousel";
  }
  return rawValue;
}

function getOptionalFile(formData: FormData, key: string): File | null {
  const value = formData.get(key);
  if (!(value instanceof File) || value.size === 0) {
    return null;
  }
  return value;
}

export async function POST(request: Request): Promise<Response> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/login");
  }

  const formData = await request.formData();
  const slideIndex = Number(String(formData.get("slide_index") ?? "").trim());
  if (!Number.isInteger(slideIndex) || slideIndex < 1 || slideIndex > 3) {
    throw new Error("Home carousel slide index is invalid.");
  }

  const upstreamFormData = new FormData();
  upstreamFormData.set("title", String(formData.get("title") ?? "").trim());
  upstreamFormData.set("subtitle", String(formData.get("subtitle") ?? "").trim());
  if (String(formData.get("clear_image") ?? "").toLowerCase() === "on") {
    upstreamFormData.set("clear_image", "true");
  }
  const image = getOptionalFile(formData, "image");
  if (image) {
    upstreamFormData.set("image", image);
  }

  const response = await fetch(`${API_BASE_URL}/admin/home-carousel/${slideIndex}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: upstreamFormData,
    cache: "no-store",
  });

  if (response.status === 401) {
    redirect("/logout");
  }
  if (!response.ok) {
    throw new Error("Home carousel save failed.");
  }

  redirect(getReturnPath(formData));
}
