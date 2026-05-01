import { getSessionToken } from "@/lib/auth";
import { API_BASE_URL } from "@/lib/config";

type RouteContext = {
  params: Promise<{
    repoSlug: string;
    noteId: string;
  }>;
};

export async function GET(_: Request, context: RouteContext): Promise<Response> {
  const token = await getSessionToken();
  if (!token) {
    return new Response(null, { status: 401 });
  }

  const { repoSlug, noteId } = await context.params;
  const upstream = await fetch(
    `${API_BASE_URL}/repositories/${encodeURIComponent(repoSlug)}/notes/${encodeURIComponent(noteId)}/index-status`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    }
  );

  if (upstream.status === 401) {
    return new Response(null, { status: 401 });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
