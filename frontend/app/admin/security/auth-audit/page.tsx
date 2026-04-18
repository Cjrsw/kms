import { AdminCard, AdminPageSection } from "../../../../components/admin-ui";
import { getAdminAuthAudit } from "../../../../lib/api";

export default async function AdminAuthAuditPage() {
  const authAudit = await getAdminAuthAudit(100);

  return (
    <div className="mx-auto max-w-7xl">
      <AdminPageSection
        eyebrow="Security"
        title="认证审计"
        description="查看最近的登录、登出与认证失败事件，统一放在安全中心。"
      />

      <AdminCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">时间</th>
                <th className="px-4 py-3 font-medium">用户</th>
                <th className="px-4 py-3 font-medium">事件</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">IP</th>
                <th className="px-4 py-3 font-medium">详情</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {authAudit.logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 text-slate-500">{new Date(log.created_at).toLocaleString("zh-CN")}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{log.username || "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{log.event_type}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        log.status === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                      }`}
                    >
                      {log.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{log.ip_address || "-"}</td>
                  <td className="max-w-[360px] px-4 py-3 text-slate-500">{log.detail || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminCard>
    </div>
  );
}
