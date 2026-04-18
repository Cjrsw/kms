import { Save } from "lucide-react";

import { AdminCard, AdminPageSection, AdminPrimaryButton, AdminTextarea } from "../../../../components/admin-ui";
import { getAdminCorsOrigins } from "../../../../lib/api";
import { updateCorsOriginsAction } from "../../actions";

export default async function AdminCorsPage() {
  const corsOrigins = await getAdminCorsOrigins();

  return (
    <div className="mx-auto max-w-5xl">
      <AdminPageSection
        eyebrow="Security"
        title="CORS 设置"
        description="白名单逐条维护，和其他后台实体管理分离成独立设置页。"
      />

      <AdminCard className="p-6">
        <form action={updateCorsOriginsAction} className="space-y-5">
          <input name="return_path" type="hidden" value="/admin/security/cors" />
          <div>
            <p className="mb-3 text-sm font-medium text-slate-700">允许访问 API 的跨域来源</p>
            <AdminTextarea
              className="min-h-[220px] font-mono"
              defaultValue={corsOrigins.origins.join("\n")}
              name="origins"
              placeholder="http://localhost:3300"
            />
            <p className="mt-3 text-xs leading-6 text-slate-400">
              支持按行输入，也支持逗号分隔。保存后会立即覆盖当前白名单。
            </p>
          </div>
          <AdminPrimaryButton className="gap-2" type="submit">
            <Save className="h-4 w-4" />
            保存策略
          </AdminPrimaryButton>
        </form>
      </AdminCard>
    </div>
  );
}
