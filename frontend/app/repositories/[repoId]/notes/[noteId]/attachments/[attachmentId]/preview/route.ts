import { NextRequest, NextResponse } from "next/server";

import { getSessionToken } from "../../../../../../../../lib/auth";
import { API_BASE_URL } from "../../../../../../../../lib/config";

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ repoId: string; noteId: string; attachmentId: string }>;
  },
): Promise<NextResponse> {
  const { repoId, noteId, attachmentId } = await params;
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const response = await fetch(
    `${API_BASE_URL}/repositories/${repoId}/notes/${noteId}/attachments/${attachmentId}/preview`,
    {
      headers: { Authorization: `Bearer ${token}` },
      redirect: "manual",
    }
  );

  if (response.status === 401) {
    return NextResponse.redirect(new URL("/logout", request.url));
  }
  if (response.status === 403) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (location) {
      return NextResponse.redirect(location);
    }
  }

  // Fallback: stream the response
  return new NextResponse(response.body, {
    status: response.status,
    headers: response.headers,
  });
}
