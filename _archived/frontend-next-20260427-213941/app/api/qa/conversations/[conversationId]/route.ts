import { getSessionToken } from "../../../../../lib/auth";
import { API_BASE_URL } from "../../../../../lib/config";

type RouteContext = {
  params: Promise<{
    conversationId: string;
  }>;
};

async function getConversationId(context: RouteContext): Promise<string> {
  const { conversationId } = await context.params;
  return conversationId;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const token = await getSessionToken();
  if (!token) {
    return new Response(null, { status: 401 });
  }

  const conversationId = await getConversationId(context);
  const upstream = await fetch(`${API_BASE_URL}/qa/conversations/${conversationId}`, {
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

export async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
  const token = await getSessionToken();
  if (!token) {
    return new Response(null, { status: 401 });
  }

  const conversationId = await getConversationId(context);
  const upstream = await fetch(`${API_BASE_URL}/qa/conversations/${conversationId}`, {
    method: "DELETE",
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
  });
}
