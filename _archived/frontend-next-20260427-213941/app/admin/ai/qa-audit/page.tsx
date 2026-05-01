import { AdminCard, AdminPageSection } from "../../../../components/admin-ui";
import { getAdminQaAudit } from "../../../../lib/api";

export default async function AdminQaAuditPage() {
  const qaAudit = await getAdminQaAudit(100);

  return (
    <div className="mx-auto max-w-7xl">
      <AdminPageSection
        eyebrow="AI"
        title="QA 审计"
        description="查看最近的问答调用、失败原因和耗时。"
      />

      <AdminCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">时间</th>
                <th className="px-4 py-3 font-medium">用户</th>
                <th className="px-4 py-3 font-medium">问题</th>
                <th className="px-4 py-3 font-medium">模型</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">召回</th>
                <th className="px-4 py-3 font-medium">耗时</th>
                <th className="px-4 py-3 font-medium">错误</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {qaAudit.logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 text-slate-500">{new Date(log.created_at).toLocaleString("zh-CN")}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{log.username || "-"}</td>
                  <td className="max-w-[360px] px-4 py-3 text-slate-600">{log.question}</td>
                  <td className="px-4 py-3 text-slate-600">{log.model_name || "-"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        log.status === "success" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {log.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{log.recall_mode || "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{log.latency_ms} ms</td>
                  <td className="px-4 py-3 text-slate-500">{log.error_code || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminCard>
    </div>
  );
}
