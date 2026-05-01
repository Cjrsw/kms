import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AdminShell } from "../../components/admin-shell";
import { hasAnyRole, requireCurrentUser } from "../../lib/auth";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const currentUser = await requireCurrentUser();
  if (!hasAnyRole(currentUser, ["admin"])) {
    redirect("/repositories");
  }

  return <AdminShell currentUser={currentUser}>{children}</AdminShell>;
}
