import { getSessionToken } from "@/lib/auth";
import { API_BASE_URL } from "@/lib/config";

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ repoId: string; noteId: string; attachmentId: string }>;
  },
): Promise<Response> {
  const { repoId, noteId, attachmentId } = await params;
  const token = await getSessionToken();
  if (!token) {
    return new Response(null, {
      status: 307,
      headers: {
        Location: "/login",
      },
    });
  }

  const response = await fetch(
    `${API_BASE_URL}/repositories/${repoId}/notes/${noteId}/attachments/${attachmentId}/preview`,
    {
      headers: { Authorization: `Bearer ${token}` },
      redirect: "manual",
    }
  );

  if (response.status === 401) {
    return new Response(null, {
      status: 307,
      headers: {
        Location: "/logout",
      },
    });
  }
  if (response.status === 403) {
    return new Response(null, {
      status: 307,
      headers: {
        Location: "/login",
      },
    });
  }

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (location) {
      return new Response(null, {
        status: 307,
        headers: {
          Location: location,
        },
      });
    }
  }

  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/octet-stream",
      ...(response.headers.get("content-disposition")
        ? { "Content-Disposition": response.headers.get("content-disposition") as string }
        : {}),
    },
  });
}
