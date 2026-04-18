import { AdminMetric, AdminPageSection } from "../../components/admin-ui";
import { getAdminContent, getAdminUsers } from "../../lib/api";

export default async function AdminOverviewPage() {
  const [adminContent, adminUsers] = await Promise.all([getAdminContent(), getAdminUsers()]);

  return (
    <div className="mx-auto max-w-7xl">
      <AdminPageSection
        eyebrow="Overview"
        title="管理后台总览"
        description="后台作为独立工作区，组织、内容、安全和 AI 能力拆分为独立页面，不再和业务系统混排。"
      />

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetric label="系统用户" value={String(adminUsers.total)} hint="员工与管理员总数" />
        <AdminMetric label="部门数量" value={String(adminUsers.departments.length)} hint="当前组织结构节点数" />
        <AdminMetric label="知识仓库" value={String(adminContent.repository_count)} hint="可管理仓库总数" />
        <AdminMetric label="知识笔记" value={String(adminContent.note_count)} hint="当前累计笔记数" />
      </div>
    </div>
  );
}
