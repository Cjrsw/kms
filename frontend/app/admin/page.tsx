import type { ReactNode } from "react";
import Link from "next/link";
import { BookOpen, Building2, FilePenLine, FolderOpen, Layers3, ShieldCheck, Trash2, Users } from "lucide-react";
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
      contentClassName="p-8"
      currentUser={currentUser}
      title="后台系统"
      description="后台页现在已经接入真实的仓库、目录、笔记管理能力，管理员可以直接在这里创建、编辑和删除内容。"
    >
      <div className="space-y-8">
        <section className="grid gap-4 md:grid-cols-3">
          <MetricCard label="知识仓库" value={String(adminContent.repository_count)} icon={<BookOpen className="h-4 w-4" />} />
          <MetricCard label="目录数量" value={String(adminContent.folder_count)} icon={<FolderOpen className="h-4 w-4" />} />
          <MetricCard label="笔记数量" value={String(adminContent.note_count)} icon={<FilePenLine className="h-4 w-4" />} />
          <MetricCard label="用户数量" value={String(adminUsers.total)} icon={<Users className="h-4 w-4" />} />
        </section>

        {isPlatformAdmin && corsOrigins ? (
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <ShieldCheck className="h-4 w-4 text-blue-600" />
              <span>安全策略</span>
            </div>
            <form action={updateCorsOriginsAction} className="space-y-3 rounded-2xl border border-dashed border-blue-200 bg-blue-50/40 p-4">
              <p className="text-xs text-gray-600">CORS 白名单（每行一个域名，示例：`http://localhost:3000`）</p>
              <textarea
                className="min-h-[110px] rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                defaultValue={corsOrigins.origins.join("\n")}
                name="origins"
              />
              <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700" type="submit">
                保存 CORS 白名单
              </button>
            </form>
          </section>
        ) : null}

        {isPlatformAdmin && authAudit ? (
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <ShieldCheck className="h-4 w-4 text-blue-600" />
              <span>认证审计日志（最近 30 条）</span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="min-w-full text-left text-xs text-gray-700">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-3 py-2">时间</th>
                    <th className="px-3 py-2">用户</th>
                    <th className="px-3 py-2">事件</th>
                    <th className="px-3 py-2">状态</th>
                    <th className="px-3 py-2">IP</th>
                    <th className="px-3 py-2">详情</th>
                  </tr>
                </thead>
                <tbody>
                  {authAudit.logs.map((log) => (
                    <tr key={log.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 whitespace-nowrap">{new Date(log.created_at).toLocaleString("zh-CN")}</td>
                      <td className="px-3 py-2">{log.username || "-"}</td>
                      <td className="px-3 py-2">{log.event_type}</td>
                      <td className="px-3 py-2">{log.status}</td>
                      <td className="px-3 py-2">{log.ip_address || "-"}</td>
                      <td className="px-3 py-2">{log.detail || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-800">
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            <span>员工与权限</span>
          </div>

          <form action="/admin" className="mb-4 grid gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 md:grid-cols-4">
            <input
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              defaultValue={keywordFilter}
              name="keyword"
              placeholder="按姓名/账号/电话搜索"
            />
            <select
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              defaultValue={departmentIdFilter ? String(departmentIdFilter) : ""}
              name="department_id"
            >
              <option value="">全部部门</option>
              {adminUsers.departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
            <select
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              defaultValue={accountStatusFilter}
              name="account_status"
            >
              <option value="all">全部状态</option>
              <option value="active">启用</option>
              <option value="inactive">停用</option>
            </select>
            <button className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black" type="submit">
              筛选
            </button>
          </form>

          <div className="grid gap-6 lg:grid-cols-2">
            <form action={createUserAction} className="grid gap-3 rounded-2xl border border-dashed border-blue-200 bg-blue-50/40 p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  name="full_name"
                  placeholder="员工姓名"
                  required
                />
                <select
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  defaultValue=""
                  name="department_id"
                >
                  <option value="">未分配部门</option>
                  {adminUsers.departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <select
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  defaultValue="1"
                  name="clearance_level"
                >
                  {employeeClearanceOptions.map((level) => (
                    <option key={level} value={level}>
                      权限 L{level}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  defaultValue=""
                  name="gender"
                >
                  <option value="">性别未设置</option>
                  <option value="男">男</option>
                  <option value="女">女</option>
                </select>
              </div>
              <input
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                name="position"
                placeholder="职位（可选）"
              />
              <p className="rounded-lg bg-white px-3 py-2 text-xs text-gray-600">
                系统将自动创建账号：`姓名@kms.com`（重名自动加后缀），默认密码 `123456`，默认启用，消息红点提醒改密。
              </p>
              <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700" type="submit">
                创建员工
              </button>
            </form>

            <div className="space-y-3">
              {adminUsers.users.length === 0 ? (
                <p className="rounded-xl border border-dashed border-gray-200 px-4 py-5 text-sm text-gray-500">当前还没有用户。</p>
              ) : (
                adminUsers.users.map((user) => (
                  <form key={user.id} action={updateUserAction} className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <input name="user_id" type="hidden" value={user.id} />
                    <div className="grid gap-3 md:grid-cols-[1fr,1fr]">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{user.username}</p>
                        <input
                          className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                          defaultValue={user.full_name}
                          name="full_name"
                          required
                        />
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <select
                          className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                          defaultValue={String(user.clearance_level)}
                          name="clearance_level"
                          disabled={user.role_code === "admin"}
                        >
                          {employeeClearanceOptions.map((level) => (
                            <option key={level} value={level}>
                              权限 L{level}
                            </option>
                          ))}
                        </select>
                        <label className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                          <input
                            defaultChecked={user.is_active}
                            disabled={user.role_code === "admin"}
                            name="is_active"
                            type="checkbox"
                          />
                          启用
                        </label>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <select
                        className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                        defaultValue={user.department_id ? String(user.department_id) : ""}
                        disabled={user.role_code === "admin"}
                        name="department_id"
                      >
                        <option value="">未分配部门</option>
                        {adminUsers.departments.map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.name}
                          </option>
                        ))}
                      </select>
                      <input
                        className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                        defaultValue={user.position || ""}
                        disabled={user.role_code === "admin"}
                        name="position"
                        placeholder="职位"
                      />
                      <select
                        className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                        defaultValue={user.gender || ""}
                        disabled={user.role_code === "admin"}
                        name="gender"
                      >
                        <option value="">性别未设置</option>
                        <option value="男">男</option>
                        <option value="女">女</option>
                      </select>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <input
                        className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                        defaultValue={user.phone || ""}
                        disabled={user.role_code === "admin"}
                        name="phone"
                        placeholder="手机号（可留空）"
                      />
                      <input
                        className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                        defaultValue={user.email || ""}
                        disabled={user.role_code === "admin"}
                        name="email"
                        placeholder="邮箱（可留空）"
                      />
                    </div>
                    <textarea
                      className="min-h-[74px] rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                      defaultValue={user.bio || ""}
                      disabled={user.role_code === "admin"}
                      name="bio"
                      placeholder="员工简介（可留空）"
                    />
                    <p className="text-xs text-gray-500">
                      角色：{user.role_code} · 创建时间：{new Date(user.created_at).toLocaleString("zh-CN")} · 离职时间：
                      {user.deactivated_at ? new Date(user.deactivated_at).toLocaleString("zh-CN") : "未离职"}
                    </p>
                    <div className="flex gap-2">
                      <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700" type="submit">
                        保存
                      </button>
                      {user.role_code !== "admin" ? (
                        <button
                          className="inline-flex items-center rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                          formAction={deleteUserAction}
                          type="submit"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          删除
                        </button>
                      ) : null}
                    </div>
                  </form>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-800">
            <Building2 className="h-4 w-4 text-blue-600" />
            <span>部门管理</span>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <form action={createDepartmentAction} className="grid gap-3 rounded-2xl border border-dashed border-blue-200 bg-blue-50/40 p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  name="code"
                  placeholder="部门编码（如 sales）"
                  required
                />
                <input
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  name="name"
                  placeholder="部门名称"
                  required
                />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <select
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  defaultValue=""
                  name="parent_id"
                >
                  <option value="">无上级部门</option>
                  {adminUsers.departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
                <input
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  defaultValue="0"
                  min={0}
                  name="sort_order"
                  type="number"
                />
                <label className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                  <input defaultChecked name="is_active" type="checkbox" />
                  启用
                </label>
              </div>
              <button className="w-fit rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700" type="submit">
                创建部门
              </button>
            </form>

            <div className="space-y-3">
              {adminUsers.departments.length === 0 ? (
                <p className="rounded-xl border border-dashed border-gray-200 px-4 py-5 text-sm text-gray-500">当前还没有部门。</p>
              ) : (
                adminUsers.departments.map((department) => (
                  <form key={department.id} action={updateDepartmentAction} className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <input name="department_id" type="hidden" value={department.id} />
                    <div className="grid gap-3 md:grid-cols-2">
                      <input
                        className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                        defaultValue={department.code}
                        name="code"
                        required
                      />
                      <input
                        className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                        defaultValue={department.name}
                        name="name"
                        required
                      />
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <select
                        className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                        defaultValue={department.parent_id ? String(department.parent_id) : ""}
                        name="parent_id"
                      >
                        <option value="">无上级部门</option>
                        {adminUsers.departments
                          .filter((candidate) => candidate.id !== department.id)
                          .map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.name}
                            </option>
                          ))}
                      </select>
                      <input
                        className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                        defaultValue={department.sort_order}
                        min={0}
                        name="sort_order"
                        type="number"
                      />
                      <label className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                        <input defaultChecked={department.is_active} name="is_active" type="checkbox" />
                        启用
                      </label>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-gray-500">部门人数：{department.member_count}</p>
                      <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700" type="submit">
                        保存部门
                      </button>
                    </div>
                  </form>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-800">
            <Layers3 className="h-4 w-4 text-blue-600" />
            <span>新建知识仓库</span>
          </div>
          <form action={createRepositoryAction} className="grid gap-4 lg:grid-cols-[160px_minmax(0,1fr)_160px_160px]">
            <input
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              name="slug"
              placeholder="slug，例如 hr"
              required
            />
            <input
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              name="name"
              placeholder="仓库名称"
              required
            />
            <select
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              defaultValue="2"
              name="min_clearance_level"
            >
              {levelOptions.map((level) => (
                <option key={level} value={level}>
                  L{level}
                </option>
              ))}
            </select>
            <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700" type="submit">
              创建仓库
            </button>
            <textarea
              className="min-h-[88px] rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 lg:col-span-4"
              name="description"
              placeholder="仓库说明"
            />
          </form>
        </section>

        <section className="space-y-6">
          {adminContent.repositories.map((repository) => (
            <article key={repository.id} className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-gray-400">{repository.slug}</p>
                  <h2 className="mt-2 text-2xl font-bold text-gray-900">{repository.name}</h2>
                  <p className="mt-2 text-sm text-gray-500">
                    目录 {repository.folder_count} 个 · 笔记 {repository.note_count} 篇 · 默认密级 L{repository.min_clearance_level}
                  </p>
                </div>
                <div className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                  后台管理已接入
                </div>
              </div>

              <form action={updateRepositoryAction} className="grid gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 lg:grid-cols-[140px_minmax(0,1fr)_140px_auto]">
                <input name="repository_id" type="hidden" value={repository.id} />
                <input
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  defaultValue={repository.slug}
                  name="slug"
                  required
                />
                <input
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  defaultValue={repository.name}
                  name="name"
                  required
                />
                <select
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  defaultValue={String(repository.min_clearance_level)}
                  name="min_clearance_level"
                >
                  {levelOptions.map((level) => (
                    <option key={level} value={level}>
                      L{level}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700" type="submit">
                    保存仓库
                  </button>
                  <button
                    className="inline-flex items-center rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                    formAction={deleteRepositoryAction}
                    type="submit"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    删除仓库
                  </button>
                </div>
                <textarea
                  className="min-h-[88px] rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 lg:col-span-4"
                  defaultValue={repository.description}
                  name="description"
                />
              </form>

              <div className="mt-6 grid gap-6 xl:grid-cols-2">
                <section className="space-y-4 rounded-2xl border border-gray-200 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <FolderOpen className="h-4 w-4 text-blue-600" />
                    <span>目录管理</span>
                  </div>

                  <form action={createFolderAction} className="grid gap-3 rounded-2xl border border-dashed border-blue-200 bg-blue-50/40 p-4">
                    <input name="repository_id" type="hidden" value={repository.id} />
                    <input
                      className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                      name="name"
                      placeholder="新目录名称"
                      required
                    />
                    <select
                      className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                      defaultValue=""
                      name="parent_id"
                    >
                      <option value="">顶级目录</option>
                      {repository.folders.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {folder.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                      defaultValue={String(repository.min_clearance_level)}
                      name="min_clearance_level"
                    >
                      {levelOptions.map((level) => (
                        <option key={level} value={level}>
                          L{level}
                        </option>
                      ))}
                    </select>
                    <button className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100" type="submit">
                      创建目录
                    </button>
                  </form>

                  <div className="space-y-3">
                    {repository.folders.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-gray-200 px-4 py-5 text-sm text-gray-500">当前仓库还没有目录。</p>
                    ) : (
                      repository.folders.map((folder) => (
                        <form key={folder.id} action={updateFolderAction} className="grid gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                          <input name="folder_id" type="hidden" value={folder.id} />
                          <input
                            className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                            defaultValue={folder.name}
                            name="name"
                            required
                          />
                          <div className="grid gap-3 md:grid-cols-2">
                            <select
                              className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                              defaultValue={folder.parent_id ? String(folder.parent_id) : ""}
                              name="parent_id"
                            >
                              <option value="">顶级目录</option>
                              {repository.folders
                                .filter((candidate) => candidate.id !== folder.id)
                                .map((candidate) => (
                                  <option key={candidate.id} value={candidate.id}>
                                    {candidate.name}
                                  </option>
                                ))}
                            </select>
                            <select
                              className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                              defaultValue={String(folder.clearance_level)}
                              name="min_clearance_level"
                            >
                              {levelOptions.map((level) => (
                                <option key={level} value={level}>
                                  L{level}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs text-gray-500">目录下笔记 {folder.note_count} 篇</p>
                            <div className="flex gap-2">
                              <button className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700" type="submit">
                                保存目录
                              </button>
                              <button
                                className="inline-flex items-center rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                                formAction={deleteFolderAction}
                                type="submit"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                删除
                              </button>
                            </div>
                          </div>
                        </form>
                      ))
                    )}
                  </div>
                </section>

                <section className="space-y-4 rounded-2xl border border-gray-200 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <FilePenLine className="h-4 w-4 text-blue-600" />
                    <span>笔记管理</span>
                  </div>

                  <form action={createNoteAction} className="grid gap-3 rounded-2xl border border-dashed border-blue-200 bg-blue-50/40 p-4">
                    <input name="repository_id" type="hidden" value={repository.id} />
                    <input
                      className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                      name="title"
                      placeholder="新笔记标题"
                      required
                    />
                    <div className="grid gap-3 md:grid-cols-2">
                      <select
                        className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                        defaultValue=""
                        name="folder_id"
                      >
                        <option value="">不放入目录</option>
                        {repository.folders.map((folder) => (
                          <option key={folder.id} value={folder.id}>
                            {folder.name}
                          </option>
                        ))}
                      </select>
                      <select
                        className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                        defaultValue={String(repository.min_clearance_level)}
                        name="min_clearance_level"
                      >
                        {levelOptions.map((level) => (
                          <option key={level} value={level}>
                            L{level}
                          </option>
                        ))}
                      </select>
                    </div>
                    <textarea
                      className="min-h-[100px] rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                      name="content_text"
                      placeholder="输入笔记正文"
                      required
                    />
                    <button className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100" type="submit">
                      创建笔记
                    </button>
                  </form>

                  <div className="space-y-3">
                    {repository.notes.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-gray-200 px-4 py-5 text-sm text-gray-500">当前仓库还没有笔记。</p>
                    ) : (
                      repository.notes.map((note) => (
                        <form key={note.id} action={updateNoteAction} className="grid gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                          <input name="note_id" type="hidden" value={note.id} />
                          <input
                            className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                            defaultValue={note.title}
                            name="title"
                            required
                          />
                          <div className="grid gap-3 md:grid-cols-2">
                            <select
                              className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                              defaultValue={note.folder_id ? String(note.folder_id) : ""}
                              name="folder_id"
                            >
                              <option value="">不放入目录</option>
                              {repository.folders.map((folder) => (
                                <option key={folder.id} value={folder.id}>
                                  {folder.name}
                                </option>
                              ))}
                            </select>
                            <select
                              className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                              defaultValue={String(note.clearance_level)}
                              name="min_clearance_level"
                            >
                              {levelOptions.map((level) => (
                                <option key={level} value={level}>
                                  L{level}
                                </option>
                              ))}
                            </select>
                          </div>
                          <textarea
                            className="min-h-[120px] rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                            defaultValue={note.content_text}
                            name="content_text"
                            required
                          />
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-xs text-gray-500">附件 {note.attachment_count} 个 · 最近更新 {new Date(note.updated_at).toLocaleString("zh-CN")}</p>
                            <div className="flex flex-wrap gap-2">
                              <Link
                                className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-white"
                                href={`/repositories/${repository.slug}/notes/${note.id}`}
                              >
                                查看详情
                              </Link>
                              <Link
                                className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-white"
                                href={`/repositories/${repository.slug}/notes/${note.id}/edit`}
                              >
                                进入编辑器
                              </Link>
                              <button className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700" type="submit">
                                保存笔记
                              </button>
                              <button
                                className="inline-flex items-center rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                                formAction={deleteNoteAction}
                                type="submit"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                删除
                              </button>
                            </div>
                          </div>
                        </form>
                      ))
                    )}
                  </div>
                </section>
              </div>
            </article>
          ))}
        </section>
      </div>
    </AppShell>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <div className="rounded-lg bg-blue-50 p-2 text-blue-600">{icon}</div>
      </div>
      <p className="mt-4 text-3xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
