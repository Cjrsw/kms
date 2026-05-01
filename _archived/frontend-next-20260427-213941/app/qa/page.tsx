import { AppShell } from "../../components/app-shell";
import { getRepositories } from "../../lib/api";
import { requireCurrentUser } from "../../lib/auth";
import { QaClient } from "./qa-client";

export default async function QaPage() {
  const [currentUser, repositories] = await Promise.all([requireCurrentUser(), getRepositories()]);

  return (
    <AppShell
      contentClassName="p-0 bg-[#212121]"
      currentUser={currentUser}
      title="Knowledge QA"
      description="Streaming answer generation with strict failure diagnostics."
    >
      <QaClient repositories={repositories} />
    </AppShell>
  );
}
