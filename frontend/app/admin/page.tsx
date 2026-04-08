import type { ReactNode } from "react";
import Link from "next/link";
import {
  BookOpen, Building2, FilePenLine, FolderOpen,
  Layers3, ShieldCheck, Trash2, Users, Search, Save, PlusCircle
} from "lucide-react";
import { redirect } from "next/navigation";

import { AppShell } from "../../components/app-shell";
import { getAdminAuthAudit, getAdminContent, getAdminCorsOrigins, getAdminUsers } from "../../lib/api";
import { hasAnyRole, requireCurrentUser } from "../../lib/auth";
import {
  createFolderAction,
  createNoteAction,
  createRepositoryAction,
  createDepartmentAction,
  createUserAction,
  deleteFolderAction,
  deleteNoteAction,
  deleteRepositoryAction,
  deleteUserAction,
  updateDepartmentAction,
  updateFolderAction,
  updateNoteAction,
  updateRepositoryAction,
  updateCorsOriginsAction,
  updateUserAction
} from "./actions";

const levelOptions = [1, 2, 3, 4];
const employeeClearanceOptions = [1, 2, 3];

type AdminPageProps = {
  searchParams?: Promise<{
    department_id?: string;
    keyword?: string;
    account_status?: "all" | "active" | "inactive";
  }>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const currentUser = await requireCurrentUser();
  if (!hasAnyRole(currentUser, ["admin"])) {
    redirect("/repositories");
  }
  const isPlatformAdmin = hasAnyRole(currentUser, ["admin"]);
  const query = searchParams ? await searchParams : undefined;
  const departmentIdFilter = query?.department_id ? Number(query.department_id) : null;
  const keywordFilter = query?.keyword?.trim() || "";
  const accountStatusFilter: "all" | "active" | "inactive" =
    query?.account_status === "active" || query?.account_status === "inactive"
      ? query.account_status
      : "all";

  const [adminContent, adminUsers] = await Promise.all([
    getAdminContent(),
    getAdminUsers({
      department_id: Number.isFinite(departmentIdFilter ?? NaN) ? departmentIdFilter : null,
      keyword: keywordFilter,
      account_status: accountStatusFilter
    })
  ]);

  const [corsOrigins, authAudit] = isPlatformAdmin
    ? await Promise.all([getAdminCorsOrigins(), getAdminAuthAudit(30)])
    : [null, null];

  return (
    <AppShell
      contentClassName="p-6 lg:p-10 bg-slate-50/50"
      currentUser={currentUser}
      title="后台管理中心"
      description="管理知识仓库、组织架构与系统安全策略。请谨慎操作。"
    >
      <div className="mx-auto max-w-7xl space-y-10">

        {/* 数据概览卡片 */}
        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="知识仓库" value={String(adminContent.repository_count)} icon={<BookOpen className="h-5 w-5" />} color="blue" />
          <MetricCard label="目录数量" value={String(adminContent.folder_count)} icon={<FolderOpen className="h-5 w-5" />} color="indigo" />
          <MetricCard label="笔记数量" value={String(adminContent.note_count)} icon={<FilePenLine className="h-5 w-5" />} color="emerald" />
          <MetricCard label="系统用户" value={String(adminUsers.total)} icon={<Users className="h-5 w-5" />} color="violet" />
        </section>

        {/* 平台级安全设置 */}
        {isPlatformAdmin && (
          <div className="grid gap-8 lg:grid-cols-2">
            {corsOrigins && (
              <SectionCard title="CORS 安全策略" icon={<ShieldCheck className="h-5 w-5 text-blue-600" />}>
                <form action={updateCorsOriginsAction} className="space-y-4">
                  <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                    <p className="mb-3 text-sm text-slate-600">配置允许访问 API 的跨域白名单（每行一个域名）：</p>
                    <textarea
                      className="w-full min-h-[120px] rounded-lg border border-slate-200 px-4 py-3 text-sm font-mono outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                      defaultValue={corsOrigins.origins.join("\n")}
                      name="origins"
                      placeholder="http://localhost:3000"
                    />
                  </div>
                  <button className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-700 active:scale-[0.98]" type="submit">
                    <Save className="h-4 w-4" /> 保存策略
                  </button>
                </form>
              </SectionCard>
            )}

            {authAudit && (
              <SectionCard title="认证审计日志 (最近30条)" icon={<Search className="h-5 w-5 text-blue-600" />}>
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <div className="max-h-[220px] overflow-y-auto">
                    <table className="min-w-full text-left text-sm text-slate-600">
                      <thead className="sticky top-0 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider backdrop-blur-sm">
                        <tr>
                          <th className="px-4 py-3">时间</th>
                          <th className="px-4 py-3">用户</th>
                          <th className="px-4 py-3">事件</th>
                          <th className="px-4 py-3">状态</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {authAudit.logs.map((log) => (
                          <tr key={log.id} className="transition-colors hover:bg-slate-50/50">
                            <td className="px-4 py-3 whitespace-nowrap text-xs">{new Date(log.created_at).toLocaleString("zh-CN", { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                            <td className="px-4 py-3 font-medium text-slate-900">{log.username || "-"}</td>
                            <td className="px-4 py-3">{log.event_type}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${log.status === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                {log.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </SectionCard>
            )}
          </div>
        )}

        {/* 员工与权限管理 */}
        <SectionCard title="组织与员工管理" icon={<Users className="h-5 w-5 text-blue-600" />}>
          {/* 筛选器 */}
          <form action="/admin" className="mb-6 grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <input
              className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              defaultValue={keywordFilter}
              name="keyword"
              placeholder="搜索姓名 / 账号 / 电话"
            />
            <select
              className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              defaultValue={departmentIdFilter ? String(departmentIdFilter) : ""}
              name="department_id"
            >
              <option value="">所有部门</option>
              {adminUsers.departments.map((department) => (
                <option key={department.id} value={department.id}>{department.name}</option>
              ))}
            </select>
            <select
              className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              defaultValue={accountStatusFilter}
              name="account_status"
            >
              <option value="all">所有状态</option>
              <option value="active">正常启用</option>
              <option value="inactive">已停用</option>
            </select>
            <button className="flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-slate-800 active:scale-[0.98]" type="submit">
              <Search className="h-4 w-4" /> 筛选查找
            </button>
          </form>

          <div className="grid gap-8 lg:grid-cols-5">
            {/* 左侧：创建新员工 */}
            <div className="lg:col-span-2">
              <div className="rounded-2xl border border-blue-100 bg-blue-50/30 p-5">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-blue-900">
                  <PlusCircle className="h-4 w-4" /> 录入新员工
                </h3>
                <form action={createUserAction} className="space-y-4">
                  <input className="input-field" name="full_name" placeholder="员工姓名 (必填)" required />
                  <select className="input-field" defaultValue="" name="department_id">
                    <option value="">未分配部门</option>
                    {adminUsers.departments.map((department) => (
                      <option key={department.id} value={department.id}>{department.name}</option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-4">
                    <select className="input-field" defaultValue="1" name="clearance_level">
                      {employeeClearanceOptions.map((level) => (
                        <option key={level} value={level}>权限 L{level}</option>
                      ))}
                    </select>
                    <select className="input-field" defaultValue="" name="gender">
                      <option value="">性别 (可选)</option>
                      <option value="男">男</option>
                      <option value="女">女</option>
                    </select>
                  </div>
                  <input className="input-field" name="position" placeholder="职位头衔 (可选)" />
                  <div className="rounded-lg bg-white p-3 text-xs leading-relaxed text-slate-500 shadow-sm border border-blue-50">
                    <p>✨ 账号将自动生成为 <code className="text-blue-600 bg-blue-50 px-1 rounded">姓名@kms.com</code></p>
                    <p>默认密码 <code>123456</code>，首次登录强制修改。</p>
                  </div>
                  <button className="btn-primary w-full" type="submit">确认创建员工</button>
                </form>
              </div>
            </div>

            {/* 右侧：员工列表 */}
            <div className="lg:col-span-3 space-y-4">
              {adminUsers.users.length === 0 ? (
                <EmptyState message="未找到符合条件的员工记录" />
              ) : (
                adminUsers.users.map((user) => (
                  <UserEditCard key={user.id} user={user} departments={adminUsers.departments} />
                ))
              )}
            </div>
          </div>
        </SectionCard>

        {/* 部门管理 */}
        <SectionCard title="部门架构管理" icon={<Building2 className="h-5 w-5 text-blue-600" />}>
          <div className="grid gap-8 lg:grid-cols-5">
            {/* 创建部门 */}
            <div className="lg:col-span-2">
              <div className="rounded-2xl border border-blue-100 bg-blue-50/30 p-5">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-blue-900">
                  <PlusCircle className="h-4 w-4" /> 新建部门
                </h3>
                <form action={createDepartmentAction} className="space-y-4">
                  <input className="input-field" name="code" placeholder="部门编码 (如: tech, sales)" required />
                  <input className="input-field" name="name" placeholder="部门名称 (必填)" required />
                  <select className="input-field" defaultValue="" name="parent_id">
                    <option value="">无上级部门 (顶级)</option>
                    {adminUsers.departments.map((department) => (
                      <option key={department.id} value={department.id}>{department.name}</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-4">
                    <input className="input-field w-24" defaultValue="0" min={0} name="sort_order" type="number" placeholder="排序" title="显示排序(越小越靠前)" />
                    <label className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-sm cursor-pointer hover:bg-slate-50">
                      <input defaultChecked name="is_active" type="checkbox" className="accent-blue-600 w-4 h-4" />
                      <span>标记为启用</span>
                    </label>
                  </div>
                  <button className="btn-primary w-full" type="submit">创建部门</button>
                </form>
              </div>
            </div>

            {/* 部门列表 */}
            <div className="lg:col-span-3 space-y-4">
               {adminUsers.departments.length === 0 ? (
                <EmptyState message="暂无部门架构数据" />
              ) : (
                adminUsers.departments.map((department) => (
                  <DepartmentEditCard key={department.id} department={department} allDepartments={adminUsers.departments} />
                ))
              )}
            </div>
          </div>
        </SectionCard>

        {/* 知识仓库管理区 */}
        <div className="space-y-8">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
              <Layers3 className="h-6 w-6 text-blue-600" />
              知识仓库管理
            </h2>
          </div>

          {/* 创建仓库 */}
          <form action={createRepositoryAction} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-slate-700">创建一个新仓库</h3>
            <div className="grid gap-4 lg:grid-cols-4">
              <div className="lg:col-span-3 grid gap-4 sm:grid-cols-3">
                <input className="input-field" name="slug" placeholder="访问短链 (例如: tech-docs)" required />
                <input className="input-field" name="name" placeholder="仓库完整名称" required />
                <select className="input-field" defaultValue="2" name="min_clearance_level">
                  {levelOptions.map((level) => (<option key={level} value={level}>基础密级 L{level}</option>))}
                </select>
                <textarea className="input-field sm:col-span-3 min-h-[60px]" name="description" placeholder="关于此仓库的一句话简短说明..." />
              </div>
              <div className="flex items-end">
                <button className="btn-primary w-full h-full min-h-[60px]" type="submit">初始化新仓库</button>
              </div>
            </div>
          </form>

          {/* 仓库列表 */}
          <div className="space-y-12">
            {adminContent.repositories.map((repository) => (
              <RepositoryCard key={repository.id} repository={repository} />
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

/* =========================================
   UI Helper Components
   ========================================= */

// 1. 数据指标卡片
function MetricCard({ label, value, icon, color }: { label: string; value: string; icon: ReactNode, color: 'blue' | 'indigo' | 'emerald' | 'violet' }) {
  const colorMap = {
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    indigo: "bg-indigo-50 text-indigo-600 border-indigo-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    violet: "bg-violet-50 text-violet-600 border-violet-100",
  };

  return (
    <div className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <div className={`rounded-xl border p-2.5 transition-transform group-hover:scale-110 ${colorMap[color]}`}>
          {icon}
        </div>
      </div>
      <p className="mt-4 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
    </div>
  );
}

// 2. 通用区块卡片
function SectionCard({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:p-8">
      <div className="mb-6 flex items-center gap-2 border-b border-slate-100 pb-4 text-lg font-semibold text-slate-900">
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </section>
  );
}

// 3. 空状态占位
function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[120px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
      {message}
    </div>
  );
}

// 4. 用户信息编辑卡片
function UserEditCard({ user, departments }: { user: any, departments: any[] }) {
  const isAdmin = user.role_code === "admin";

  return (
    <form action={updateUserAction} className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-blue-200 hover:shadow-md">
      <input name="user_id" type="hidden" value={user.id} />

      {/* 卡片头部标识 */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">
            {user.full_name.charAt(0)}
          </div>
          <div>
            <p className="font-semibold text-slate-900">{user.full_name}</p>
            <p className="text-xs text-slate-500 font-mono">{user.username}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-600 border border-indigo-100">管理员</span>}
          {!user.is_active && <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 border border-red-100">已停用</span>}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-4">
        <input className="input-field" defaultValue={user.full_name} name="full_name" placeholder="真实姓名" required />
        <select className="input-field" defaultValue={user.department_id ? String(user.department_id) : ""} disabled={isAdmin} name="department_id">
          <option value="">未分配部门</option>
          {departments.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
        </select>
        <input className="input-field" defaultValue={user.position || ""} disabled={isAdmin} name="position" placeholder="职位头衔" />

        <select className="input-field" defaultValue={String(user.clearance_level)} name="clearance_level" disabled={isAdmin}>
          {[1, 2, 3].map((level) => (<option key={level} value={level}>访问权限 L{level}</option>))}
        </select>
        <input className="input-field" defaultValue={user.phone || ""} disabled={isAdmin} name="phone" placeholder="联系电话 (可选)" />
        <input className="input-field" defaultValue={user.email || ""} disabled={isAdmin} name="email" placeholder="邮箱 (可选)" />
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100 pt-4">
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input defaultChecked={user.is_active} disabled={isAdmin} name="is_active" type="checkbox" className="accent-blue-600 w-4 h-4" />
          <span>允许登录系统</span>
        </label>

        <div className="flex w-full sm:w-auto gap-2">
          <button className="btn-primary flex-1 sm:flex-none" type="submit">保存更改</button>
          {!isAdmin && (
            <button className="btn-danger flex-1 sm:flex-none flex items-center justify-center gap-1" formAction={deleteUserAction} type="submit" title="彻底删除用户">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

// 5. 部门信息编辑卡片
function DepartmentEditCard({ department, allDepartments }: { department: any, allDepartments: any[] }) {
  return (
    <form action={updateDepartmentAction} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-blue-200 hover:shadow-md">
      <input name="department_id" type="hidden" value={department.id} />
      <div className="flex flex-col md:flex-row gap-4 mb-4">
        <div className="flex-1 grid grid-cols-2 gap-3">
          <input className="input-field" defaultValue={department.name} name="name" placeholder="部门名称" required />
          <input className="input-field font-mono text-xs" defaultValue={department.code} name="code" placeholder="唯一编码" required />
        </div>
        <div className="flex-1 grid grid-cols-2 gap-3">
          <select className="input-field" defaultValue={department.parent_id ? String(department.parent_id) : ""} name="parent_id">
            <option value="">顶级架构</option>
            {allDepartments.filter((d) => d.id !== department.id).map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <input className="input-field" defaultValue={department.sort_order} min={0} name="sort_order" type="number" placeholder="排序权重" />
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-4">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input defaultChecked={department.is_active} name="is_active" type="checkbox" className="accent-blue-600 w-4 h-4" />
            <span>启用</span>
          </label>
          <span className="text-xs text-slate-400 bg-slate-50 px-2 py-1 rounded-md">当前员工数：{department.member_count}</span>
        </div>
        <button className="btn-primary" type="submit">保存更新</button>
      </div>
    </form>
  );
}

// 6. 巨型组件：知识仓库区块（包含自身的更新以及下属目录、笔记）
function RepositoryCard({ repository }: { repository: any }) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* 仓库头部概览与编辑 */}
      <div className="bg-slate-50 p-6 border-b border-slate-200">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-slate-900">{repository.name}</h2>
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-blue-700">
                {repository.slug}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              包含 {repository.folder_count} 个目录，{repository.note_count} 篇笔记 · 基础限制级别 L{repository.min_clearance_level}
            </p>
          </div>
        </div>

        <form action={updateRepositoryAction} className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_120px_auto]">
          <input name="repository_id" type="hidden" value={repository.id} />
          <input className="input-field" defaultValue={repository.name} name="name" placeholder="仓库名称" required />
          <input className="input-field" defaultValue={repository.slug} name="slug" placeholder="Slug短链" required />
          <select className="input-field" defaultValue={String(repository.min_clearance_level)} name="min_clearance_level">
            {[1, 2, 3, 4].map((level) => (<option key={level} value={level}>L{level}</option>))}
          </select>
          <div className="flex gap-2">
            <button className="btn-primary" type="submit">更新属性</button>
            <button className="btn-danger flex items-center justify-center gap-1" formAction={deleteRepositoryAction} type="submit" title="危险！删除整个仓库">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </form>
      </div>

      {/* 仓库内容管理：目录与笔记 */}
      <div className="grid gap-0 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">

        {/* 左侧：目录管理 */}
        <div className="p-6 space-y-6 bg-white">
          <h3 className="flex items-center gap-2 font-semibold text-slate-800">
            <FolderOpen className="h-4 w-4 text-blue-500" /> 目录结构管理
          </h3>

          <form action={createFolderAction} className="flex flex-col sm:flex-row gap-3 rounded-xl border border-dashed border-blue-200 bg-blue-50/30 p-4">
            <input name="repository_id" type="hidden" value={repository.id} />
            <input className="input-field flex-1" name="name" placeholder="输入新目录名称..." required />
            <select className="input-field sm:w-32" defaultValue="" name="parent_id">
              <option value="">(根目录)</option>
              {repository.folders.map((f: any) => (<option key={f.id} value={f.id}>{f.name}</option>))}
            </select>
            <button className="btn-primary whitespace-nowrap" type="submit">添加</button>
          </form>

          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
            {repository.folders.length === 0 ? <EmptyState message="暂无目录" /> : repository.folders.map((folder: any) => (
              <form key={folder.id} action={updateFolderAction} className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 hover:border-slate-300 transition-colors">
                <input name="folder_id" type="hidden" value={folder.id} />
                <div className="flex gap-2">
                  <input className="input-field flex-1 text-sm font-medium" defaultValue={folder.name} name="name" required />
                  <select className="input-field w-24 text-xs" defaultValue={String(folder.clearance_level)} name="min_clearance_level">
                    {[1, 2, 3, 4].map((l) => (<option key={l} value={l}>L{l}</option>))}
                  </select>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <select className="input-field w-32 text-xs" defaultValue={folder.parent_id ? String(folder.parent_id) : ""} name="parent_id">
                    <option value="">位于根目录</option>
                    {repository.folders.filter((c: any) => c.id !== folder.id).map((c: any) => (
                      <option key={c.id} value={c.id}>归入 {c.name}</option>
                    ))}
                  </select>
                  <div className="flex gap-1.5">
                    <button className="rounded border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100" type="submit">保存</button>
                    <button className="rounded border border-red-100 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50" formAction={deleteFolderAction} type="submit"><Trash2 className="h-3.5 w-3.5"/></button>
                  </div>
                </div>
              </form>
            ))}
          </div>
        </div>

        {/* 右侧：笔记管理 */}
        <div className="p-6 space-y-6 bg-slate-50/30">
          <h3 className="flex items-center gap-2 font-semibold text-slate-800">
            <FilePenLine className="h-4 w-4 text-emerald-500" /> 快速笔记管理
          </h3>

          <form action={createNoteAction} className="space-y-3 rounded-xl border border-dashed border-emerald-200 bg-emerald-50/30 p-4">
            <input name="repository_id" type="hidden" value={repository.id} />
            <input className="input-field border-emerald-100 focus:border-emerald-500 focus:ring-emerald-500/10" name="title" placeholder="速记标题..." required />
            <div className="flex gap-3">
              <select className="input-field border-emerald-100 flex-1" defaultValue="" name="folder_id">
                <option value="">放入根目录</option>
                {repository.folders.map((f: any) => (<option key={f.id} value={f.id}>{f.name}</option>))}
              </select>
              <button className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-[0.98] whitespace-nowrap" type="submit">新建笔记</button>
            </div>
            <input type="hidden" name="min_clearance_level" value={repository.min_clearance_level} />
            <input type="hidden" name="content_text" value="新建笔记内容..." />
          </form>

          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
            {repository.notes.length === 0 ? <EmptyState message="暂无笔记内容" /> : repository.notes.map((note: any) => (
              <form key={note.id} action={updateNoteAction} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300 transition-all">
                <input name="note_id" type="hidden" value={note.id} />
                <input className="input-field font-medium" defaultValue={note.title} name="title" required />

                <div className="flex gap-2">
                  <select className="input-field flex-1 text-xs" defaultValue={note.folder_id ? String(note.folder_id) : ""} name="folder_id">
                    <option value="">位于根目录</option>
                    {repository.folders.map((f: any) => (<option key={f.id} value={f.id}>{f.name}</option>))}
                  </select>
                  <select className="input-field w-24 text-xs" defaultValue={String(note.clearance_level)} name="min_clearance_level">
                    {[1, 2, 3, 4].map((l) => (<option key={l} value={l}>L{l}</option>))}
                  </select>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-1">
                  <span className="text-[10px] text-slate-400 font-mono">
                     {new Date(note.updated_at).toLocaleDateString()}
                  </span>
                  <div className="flex gap-1.5">
                    <Link className="rounded border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors" href={`/repositories/${repository.slug}/notes/${note.id}/edit`}>
                      编辑内容
                    </Link>
                    <button className="rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100" type="submit">保存</button>
                    <button className="rounded border border-red-100 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50" formAction={deleteNoteAction} type="submit"><Trash2 className="h-3.5 w-3.5"/></button>
                  </div>
                </div>
                {/* 隐藏真正的正文避免撑爆屏幕，但需要提供给action */}
                <textarea name="content_text" defaultValue={note.content_text} className="hidden" />
              </form>
            ))}
          </div>
        </div>

      </div>
    </article>
  );
}
