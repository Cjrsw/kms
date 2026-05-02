import { getSessionToken } from "@/lib/auth";
import { API_BASE_URL } from "@/lib/config";

export async function POST(request: Request): Promise<Response> {
  const token = await getSessionToken();
  if (!token) {
    return Response.json({ detail: "Session expired." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const upstream = await fetch(`${API_BASE_URL}/auth/me/password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body ?? {}),
    cache: "no-store",
  });

  if (upstream.status === 204) {
    return new Response(null, { status: 204 });
  }

  const payload = await upstream.json().catch(() => ({ detail: "Password update failed." }));
  return Response.json(payload, { status: upstream.status });
}
