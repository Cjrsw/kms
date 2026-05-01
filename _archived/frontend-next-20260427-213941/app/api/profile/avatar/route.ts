import { getSessionToken } from "../../../../lib/auth";
import { API_BASE_URL } from "../../../../lib/config";

export async function GET(): Promise<Response> {
  const token = await getSessionToken();
  if (!token) {
    return new Response(null, { status: 401 });
  }

  const upstream = await fetch(`${API_BASE_URL}/auth/me/avatar`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!upstream.ok) {
    return new Response(null, { status: upstream.status });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": upstream.headers.get("cache-control") ?? "private, max-age=300",
    },
  });
}
