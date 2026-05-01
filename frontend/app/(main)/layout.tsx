import { AppShell } from "../../components/app-shell";
import { requireCurrentUser } from "../../lib/auth";

export default async function MainLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const currentUser = await requireCurrentUser();

  return <AppShell currentUser={currentUser}>{children}</AppShell>;
}
