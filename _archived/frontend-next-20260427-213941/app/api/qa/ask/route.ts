import { getSessionToken } from "../../../../lib/auth";
import { API_BASE_URL } from "../../../../lib/config";

export async function POST(request: Request): Promise<Response> {
  const token = await getSessionToken();
  if (!token) {
    return Response.json(
      {
        status: "failed",
        data: null,
        error: {
          error_code: "unauthorized",
          error_category: "authentication",
          user_message: "Session is not valid.",
          hint: "Please login again.",
          trace_id: "",
        },
      },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json(
      {
        status: "failed",
        data: null,
        error: {
          error_code: "invalid_request",
          error_category: "validation",
          user_message: "Request payload is invalid.",
          hint: "Please submit a valid question payload.",
          trace_id: "",
        },
      },
      { status: 400 },
    );
  }

  const upstream = await fetch(`${API_BASE_URL}/qa`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
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
