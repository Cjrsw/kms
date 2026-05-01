import { getSessionToken } from "../../../../../../../../lib/auth";
import { API_BASE_URL } from "../../../../../../../../lib/config";

type DownloadRouteProps = {
  params: Promise<{
    repoId: string;
    noteId: string;
    attachmentId: string;
  }>;
};

export async function GET(_: Request, { params }: DownloadRouteProps) {
  const token = await getSessionToken();
  if (!token) {
    return new Response(null, {
      status: 307,
      headers: {
        Location: "/login"
      }
    });
  }

  const { repoId, noteId, attachmentId } = await params;
  const response = await fetch(
    `${API_BASE_URL}/repositories/${repoId}/notes/${noteId}/attachments/${attachmentId}/download`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      },
      redirect: "manual",
      cache: "no-store"
    }
  );

  if (response.status === 401) {
    return new Response(null, {
      status: 307,
      headers: {
        Location: "/logout"
      }
    });
  }
  if (response.status === 403) {
    return new Response(null, {
      status: 307,
      headers: {
        Location: "/login"
      }
    });
  }

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (location) {
      return new Response(null, {
        status: 307,
        headers: {
          Location: location
        }
      });
    }
  }

  return new Response(await response.arrayBuffer(), {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/octet-stream",
      ...(response.headers.get("content-disposition")
        ? { "Content-Disposition": response.headers.get("content-disposition") as string }
        : {})
    }
  });
}
