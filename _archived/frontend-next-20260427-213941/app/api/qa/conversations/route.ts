import { getSessionToken } from "../../../../lib/auth";
import { API_BASE_URL } from "../../../../lib/config";

export async function GET(): Promise<Response> {
  const token = await getSessionToken();
  if (!token) {
    return new Response(null, { status: 401 });
  }

  const upstream = await fetch(`${API_BASE_URL}/qa/conversations`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (upstream.status === 401) {
    return new Response(null, { status: 401 });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
