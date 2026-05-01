import { AdminCard, AdminPageSection } from "../../components/admin-ui";
import {
  getAdminAuthAudit,
  getAdminContent,
  getAdminQaAudit,
  getAdminUsers,
  type AdminContent,
  type AdminNoteItem,
  type AdminRepositoryItem,
  type AdminUsersResponse,
  type QaAuditResponse,
} from "../../lib/api";

const clearanceLevels = [1, 2, 3, 4];
const indexStatuses = ["indexed", "pending", "indexing", "failed"];

export default async function AdminOverviewPage() {
  const [adminContent, adminUsers, qaAudit, authAudit] = await Promise.all([
    getAdminContent(),
    getAdminUsers(),
    getAdminQaAudit(80),
    getAdminAuthAudit(80),
  ]);

  const notes = flattenNotes(adminContent);
  const activeUsers = adminUsers.users.filter((user) => user.is_active).length;
  const inactiveUsers = adminUsers.total - activeUsers;
  const indexStats = countBy(notes, (note) => normalizeIndexStatus(note.search_index_status));
  const indexedNotes = indexStats.indexed ?? 0;
  const indexHealth = percent(indexedNotes, Math.max(notes.length, 1));
  const qaSuccess = qaAudit.logs.filter((log) => log.status === "success").length;
  const qaSuccessRate = percent(qaSuccess, Math.max(qaAudit.logs.length, 1));
  const qaAverageLatency = average(qaAudit.logs.map((log) => log.latency_ms).filter((value) => value > 0));
  const authFailures = authAudit.logs.filter((log) => log.status !== "success").length;
  const repositoryLeaders = [...adminContent.repositories]
    .sort((left, right) => right.note_count - left.note_count)
    .slice(0, 5);
  const failedOrPendingNotes = notes
    .filter((note) => normalizeIndexStatus(note.search_index_status) !== "indexed")
    .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime())
    .slice(0, 6);

  return (
    <div className="mx-auto max-w-[1500px]">
      <AdminPageSection
        eyebrow="Command Center"
        title="后台数据总览"
        description="基于当前真实用户、知识内容、索引状态、QA 审计与认证审计生成的管理驾驶舱。"
      />

      <section className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <AdminCard className="relative overflow-hidden p-6">
          <div className="pointer-events-none absolute right-[-80px] top-[-120px] h-72 w-72 rounded-full bg-red-500/15 blur-3xl" />
          <div className="relative grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-400">KMS SYSTEM PULSE</p>
              <div className="mt-6 flex items-end gap-4">
                <span className="text-7xl font-black leading-none text-white">{indexHealth}</span>
                <span className="mb-2 text-2xl font-bold text-red-400">%</span>
              </div>
              <p className="mt-3 text-sm text-white/45">索引健康度：已完成索引笔记 / 全部笔记</p>
              <div className="mt-8 grid grid-cols-2 gap-3">
                <PulseMetric label="用户" value={adminUsers.total} sub={`${activeUsers} 启用 / ${inactiveUsers} 停用`} />
                <PulseMetric label="知识仓库" value={adminContent.repository_count} sub={`${adminContent.folder_count} 个目录`} />
                <PulseMetric label="笔记" value={adminContent.note_count} sub={`${indexedNotes} 已索引`} />
                <PulseMetric label="QA 成功率" value={`${qaSuccessRate}%`} sub={`${qaAudit.logs.length} 条审计样本`} />
              </div>
            </div>

            <div className="grid gap-4">
              <IndexHealthPanel indexStats={indexStats} total={Math.max(notes.length, 1)} />
              <QaTelemetryPanel averageLatency={qaAverageLatency} qaAudit={qaAudit} qaSuccessRate={qaSuccessRate} />
            </div>
          </div>
        </AdminCard>

        <AdminCard className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-red-400">Security Radar</p>
              <h2 className="mt-2 text-2xl font-bold text-white">认证风险</h2>
            </div>
            <div className="border border-red-500/35 bg-red-500/10 px-4 py-2 text-right">
              <p className="text-3xl font-black text-red-300">{authFailures}</p>
              <p className="text-xs text-white/45">失败审计</p>
            </div>
          </div>
          <div className="mt-6 space-y-3">
            {authAudit.logs.slice(0, 6).map((log) => (
              <div className="border border-white/10 bg-black/20 p-3" key={log.id}>
                <div className="flex items-center justify-between gap-4">
                  <span className="truncate text-sm font-semibold text-white">{log.username || "unknown"}</span>
                  <span className={log.status === "success" ? "text-xs text-emerald-300" : "text-xs text-red-300"}>
                    {log.status}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-white/38">
                  {log.event_type} · {formatDateTime(log.created_at)}
                </p>
              </div>
            ))}
            {authAudit.logs.length === 0 ? <p className="text-sm text-white/45">暂无认证审计记录。</p> : null}
          </div>
        </AdminCard>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-3">
        <AdminCard className="p-6 xl:col-span-2">
          <SectionTitle kicker="Knowledge Matrix" title="仓库内容分布" />
          <div className="mt-6 space-y-4">
            {repositoryLeaders.map((repository, index) => (
              <RepositoryBar
                index={index}
                key={repository.id}
                max={Math.max(...repositoryLeaders.map((item) => item.note_count), 1)}
                repository={repository}
              />
            ))}
            {repositoryLeaders.length === 0 ? <p className="text-sm text-white/45">暂无仓库数据。</p> : null}
          </div>
        </AdminCard>

        <AdminCard className="p-6">
          <SectionTitle kicker="Clearance" title="密级分布" />
          <div className="mt-6 grid grid-cols-2 gap-3">
            {clearanceLevels.map((level) => {
              const userCount = adminUsers.users.filter((user) => user.clearance_level === level).length;
              const noteCount = notes.filter((note) => note.clearance_level === level).length;
              return (
                <div className="border border-white/10 bg-black/20 p-4" key={level}>
                  <p className="text-xs font-bold text-red-300">LEVEL {level}</p>
                  <p className="mt-3 text-2xl font-black text-white">{noteCount}</p>
                  <p className="text-xs text-white/38">笔记 · {userCount} 用户</p>
                  <div className="mt-4 h-1 bg-white/10">
                    <div
                      className="h-full bg-red-500"
                      style={{ width: `${percent(noteCount, Math.max(notes.length, 1))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </AdminCard>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <AdminCard className="p-6">
          <SectionTitle kicker="Index Queue" title="索引与附件异常" />
          <div className="mt-6 space-y-3">
            {failedOrPendingNotes.map((note) => (
              <div className="border border-white/10 bg-black/20 p-4" key={note.id}>
                <div className="flex items-center justify-between gap-4">
                  <p className="truncate text-sm font-semibold text-white">{note.title}</p>
                  <StatusPill status={normalizeIndexStatus(note.search_index_status)} />
                </div>
                <p className="mt-2 truncate text-xs text-white/40">
                  {note.search_index_error || `更新时间 ${formatDateTime(note.updated_at)}`}
                </p>
              </div>
            ))}
            {failedOrPendingNotes.length === 0 ? (
              <div className="border border-emerald-400/20 bg-emerald-400/5 p-5 text-sm text-emerald-200">
                当前没有待处理或失败的笔记索引。
              </div>
            ) : null}
          </div>
        </AdminCard>

        <AdminCard className="p-6">
          <SectionTitle kicker="AI Audit" title="问答调用画像" />
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <MiniStat label="成功" value={qaSuccess} tone="good" />
            <MiniStat label="失败" value={qaAudit.logs.length - qaSuccess} tone="bad" />
            <MiniStat label="平均耗时" value={qaAverageLatency ? `${qaAverageLatency}ms` : "--"} tone="neutral" />
          </div>
          <div className="mt-6 space-y-3">
            {qaAudit.logs.slice(0, 5).map((log) => (
              <div className="grid gap-3 border border-white/10 bg-black/20 p-4 md:grid-cols-[1fr_auto] md:items-center" key={log.id}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{log.question}</p>
                  <p className="mt-1 truncate text-xs text-white/38">
                    {log.username || "unknown"} · {log.model_name || "fixed-model"} · {formatDateTime(log.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={log.status === "success" ? "text-xs text-emerald-300" : "text-xs text-red-300"}>
                    {log.status}
                  </span>
                  <span className="text-xs text-white/35">{log.latency_ms || 0}ms</span>
                </div>
              </div>
            ))}
            {qaAudit.logs.length === 0 ? <p className="text-sm text-white/45">暂无 QA 审计记录。</p> : null}
          </div>
        </AdminCard>
      </section>
    </div>
  );
}

function PulseMetric({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div className="border border-white/10 bg-black/20 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/38">{label}</p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs text-white/35">{sub}</p>
    </div>
  );
}

function IndexHealthPanel({ indexStats, total }: { indexStats: Record<string, number>; total: number }) {
  const indexed = indexStats.indexed ?? 0;
  const indexing = (indexStats.indexing ?? 0) + (indexStats.pending ?? 0);
  const failed = indexStats.failed ?? 0;
  const indexedPercent = percent(indexed, total);
  const processingPercent = percent(indexing, total);
  const failedPercent = percent(failed, total);

  return (
    <div className="border border-white/10 bg-black/20 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-400">Index Health</p>
          <p className="mt-2 text-lg font-bold text-white">全文与向量索引</p>
        </div>
        <div
          className="h-24 w-24 rounded-full"
          style={{
            background: `conic-gradient(#22c55e 0 ${indexedPercent}%, #f59e0b ${indexedPercent}% ${indexedPercent + processingPercent}%, #ef4444 ${indexedPercent + processingPercent}% ${indexedPercent + processingPercent + failedPercent}%, rgba(255,255,255,.08) 0)`,
          }}
        />
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2 text-xs">
        <LegendDot color="bg-emerald-400" label="已索引" value={indexed} />
        <LegendDot color="bg-amber-400" label="处理中" value={indexing} />
        <LegendDot color="bg-red-500" label="失败" value={failed} />
      </div>
    </div>
  );
}

function QaTelemetryPanel({
  averageLatency,
  qaAudit,
  qaSuccessRate,
}: {
  averageLatency: number;
  qaAudit: QaAuditResponse;
  qaSuccessRate: number;
}) {
  const spark = qaAudit.logs.slice(0, 16).reverse();
  const maxLatency = Math.max(...spark.map((log) => log.latency_ms || 0), 1);

  return (
    <div className="border border-white/10 bg-black/20 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-400">QA Telemetry</p>
          <p className="mt-2 text-lg font-bold text-white">问答审计样本</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black text-white">{qaSuccessRate}%</p>
          <p className="text-xs text-white/35">成功率</p>
        </div>
      </div>
      <div className="mt-5 flex h-24 items-end gap-1 border-b border-white/10">
        {spark.length > 0 ? (
          spark.map((log) => (
            <div
              className={log.status === "success" ? "flex-1 bg-red-400/70" : "flex-1 bg-white/20"}
              key={log.id}
              style={{ height: `${Math.max(8, percent(log.latency_ms || 0, maxLatency))}%` }}
              title={`${log.status} ${log.latency_ms}ms`}
            />
          ))
        ) : (
          <div className="mb-6 text-sm text-white/35">暂无调用样本</div>
        )}
      </div>
      <p className="mt-3 text-xs text-white/38">平均耗时：{averageLatency ? `${averageLatency}ms` : "--"}</p>
    </div>
  );
}

function RepositoryBar({
  repository,
  max,
  index,
}: {
  repository: AdminRepositoryItem;
  max: number;
  index: number;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-[170px_1fr_80px] md:items-center">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-white">
          {String(index + 1).padStart(2, "0")} / {repository.name}
        </p>
        <p className="truncate text-xs text-white/35">L{repository.min_clearance_level} · {repository.folder_count} 目录</p>
      </div>
      <div className="h-3 border border-white/10 bg-black/30">
        <div className="h-full bg-gradient-to-r from-red-700 via-red-500 to-white" style={{ width: `${percent(repository.note_count, max)}%` }} />
      </div>
      <p className="text-right text-sm font-black text-white">{repository.note_count}</p>
    </div>
  );
}

function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-red-400">{kicker}</p>
        <h2 className="mt-2 text-2xl font-bold text-white">{title}</h2>
      </div>
      <div className="h-px flex-1 bg-gradient-to-r from-red-500/70 to-transparent" />
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string | number; tone: "good" | "bad" | "neutral" }) {
  const color = tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-red-300" : "text-white";
  return (
    <div className="border border-white/10 bg-black/20 p-4">
      <p className="text-xs text-white/38">{label}</p>
      <p className={`mt-2 text-2xl font-black ${color}`}>{value}</p>
    </div>
  );
}

function LegendDot({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 ${color}`} />
        <span className="text-white/48">{label}</span>
      </div>
      <p className="mt-1 text-lg font-black text-white">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const label = status === "failed" ? "失败" : status === "indexing" ? "索引中" : status === "pending" ? "等待中" : "已索引";
  const color = status === "failed" ? "border-red-500/40 text-red-300" : "border-amber-400/35 text-amber-200";
  return <span className={`shrink-0 border px-2 py-1 text-xs ${color}`}>{label}</span>;
}

function flattenNotes(content: AdminContent): AdminNoteItem[] {
  return content.repositories.flatMap((repository) => repository.notes);
}

function countBy<T>(items: T[], getKey: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((accumulator, item) => {
    const key = getKey(item);
    accumulator[key] = (accumulator[key] ?? 0) + 1;
    return accumulator;
  }, {});
}

function normalizeIndexStatus(status: string | null | undefined): string {
  const value = (status || "indexed").trim();
  return indexStatuses.includes(value) ? value : "indexed";
}

function percent(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.round((value / total) * 100);
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
