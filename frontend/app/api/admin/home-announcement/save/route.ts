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

export async function POST(request: Request): Promise<Response> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/login");
  }

  const formData = await request.formData();
  const response = await fetch(`${API_BASE_URL}/admin/home-announcement`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: String(formData.get("title") ?? "").trim(),
      content: String(formData.get("content") ?? "").trim(),
    }),
    cache: "no-store",
  });

  if (response.status === 401) {
    redirect("/logout");
  }
  if (!response.ok) {
    throw new Error("Home announcement save failed.");
  }

  redirect(getReturnPath(formData));
}
