import { API_BASE_URL } from "@/lib/config";

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null);
  const upstream = await fetch(`${API_BASE_URL}/auth/password-reset-requests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
    cache: "no-store",
  });

  const payload = await upstream.json().catch(() => ({ status: "ok" }));
  return Response.json(payload, { status: upstream.status });
}
