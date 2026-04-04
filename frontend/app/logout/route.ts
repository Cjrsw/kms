import { clearAuthSession } from "../../lib/auth";

export async function GET() {
  await clearAuthSession();
  return new Response(null, {
    status: 307,
    headers: {
      Location: "/login"
    }
  });
}
