import { clearAuthSession, getSessionToken } from "../../lib/auth";
import { API_BASE_URL } from "../../lib/config";

export async function GET() {
  const token = await getSessionToken();
  if (token) {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        },
        cache: "no-store"
      });
    } catch {
      // Ignore backend logout failures and still clear local session.
    }
  }

  await clearAuthSession();
  return new Response(null, {
    status: 307,
    headers: {
      Location: "/login"
    }
  });
}
