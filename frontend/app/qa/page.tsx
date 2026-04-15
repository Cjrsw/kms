import { AppShell } from "../../components/app-shell";
import { getQaAvailableModels, getRepositories } from "../../lib/api";
import { requireCurrentUser } from "../../lib/auth";
import { QaClient } from "./qa-client";

export default async function QaPage() {
  const [currentUser, repositories, availableModels] = await Promise.all([
    requireCurrentUser(),
    getRepositories(),
    getQaAvailableModels(),
  ]);

  return (
    <AppShell
      contentClassName="p-6 lg:p-8 bg-slate-50"
      currentUser={currentUser}
      title="知识问答"
      description="支持模型选择、严格失败提示与来源可追溯。"
    >
      <QaClient repositories={repositories} availableModels={availableModels} />
    </AppShell>
  );
}
