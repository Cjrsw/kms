import { Save } from "lucide-react";

import { AdminCard, AdminPageSection, AdminPrimaryButton, AdminTextarea } from "../../../../components/admin-ui";
import { getAdminQaSystemPrompt } from "../../../../lib/api";
import { saveSystemPromptAction } from "../../ai/actions";

export default async function AdminPromptPage() {
  const promptData = await getAdminQaSystemPrompt();

  return (
    <div className="mx-auto max-w-5xl">
      <AdminPageSection
        eyebrow="AI"
        title="Sys Prompt"
        description="问答系统提示词单独成页管理，不再和 QA 审计挤在一起。"
      />

      <AdminCard className="p-6">
        <form action={saveSystemPromptAction} className="space-y-5">
          <div>
            <p className="mb-3 text-sm font-medium text-slate-700">系统提示词</p>
            <AdminTextarea className="min-h-[260px]" defaultValue={promptData.system_prompt} name="system_prompt" required />
            <p className="mt-3 text-xs text-slate-400">
              最近更新：{promptData.updated_at ? new Date(promptData.updated_at).toLocaleString("zh-CN") : "未设置"}
            </p>
          </div>
          <AdminPrimaryButton className="gap-2" type="submit">
            <Save className="h-4 w-4" />
            保存 Prompt
          </AdminPrimaryButton>
        </form>
      </AdminCard>
    </div>
  );
}
