import { redirect } from "next/navigation";

import { getCurrentUser } from "../lib/auth";

export default async function HomePage() {
  const currentUser = await getCurrentUser();
  redirect(currentUser ? "/repositories" : "/login");
}
