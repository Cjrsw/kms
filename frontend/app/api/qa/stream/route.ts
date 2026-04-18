import { getSessionToken } from "../../../../lib/auth";
import { API_BASE_URL } from "../../../../lib/config";

export async function POST(request: Request): Promise<Response> {
  const token = await getSessionToken();
  if (!token) {
    return new Response(null, { status: 401 });
  }

  const body = await request.text();
  const upstream = await fetch(`${API_BASE_URL}/qa/stream`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body,
    cache: "no-store",
  });

  if (upstream.status === 401) {
    return new Response(null, { status: 401 });
  }

  if (!upstream.ok || !upstream.body) {
    const fallbackBody = await upstream.text().catch(() => "");
    return new Response(fallbackBody || "upstream stream unavailable", { status: upstream.status || 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
