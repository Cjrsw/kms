import Link from "next/link";
import { Edit3, Plus, Search, Trash2 } from "lucide-react";

import {
  AdminCard,
  AdminDangerButton,
  AdminFieldLabel,
  AdminInput,
  AdminModal,
  AdminPageSection,
  AdminPrimaryButton,
  AdminSecondaryButton,
  AdminSelect,
  AdminToolbar,
  buildAdminQuery,
} from "../../../components/admin-ui";
import { createUserAction, deleteUserAction, updateUserAction } from "../actions";
import { getAdminUsers } from "../../../lib/api";

const employeeClearanceOptions = [1, 2, 3];

type SearchParams = Promise<{
  department_id?: string;
  keyword?: string;
  account_status?: "all" | "active" | "inactive";
  modal?: "create" | "edit";
  user_id?: string;
}>;

export default async function AdminUsersPage({ searchParams }: { searchParams?: SearchParams }) {
  const query = (searchParams ? await searchParams : undefined) ?? {};
  const departmentIdFilter = query.department_id ? Number(query.department_id) : null;
  const keywordFilter = query.keyword?.trim() || "";
  const accountStatusFilter =
    query.account_status === "active" || query.account_status === "inactive" ? query.account_status : "all";

  const adminUsers = await getAdminUsers({
    department_id: Number.isFinite(departmentIdFilter ?? NaN) ? departmentIdFilter : null,
    keyword: keywordFilter,
    account_status: accountStatusFilter,
  });

  const editingUser =
    query.modal === "edit" && query.user_id
      ? adminUsers.users.find((item) => item.id === Number(query.user_id)) ?? null
      : null;
  const closeHref = `/admin/users${buildAdminQuery(query, { modal: null, user_id: null })}`;

  return (
    <div className="mx-auto max-w-7xl">
      <AdminPageSection
        eyebrow="Organization"
        title="用户管理"
        description="员工账号以表格方式维护，新增和编辑统一走弹窗，不再在页面上堆叠大表单。"
        action={
          <Link href={`/admin/users${buildAdminQuery(query, { modal: "create", user_id: null })}`}>
            <AdminPrimaryButton className="gap-2">
              <Plus className="h-4 w-4" />
              新建用户
            </AdminPrimaryButton>
          </Link>
        }
      />

      <AdminCard className="p-5">
        <AdminToolbar>
          <form action="/admin/users" className="grid flex-1 gap-3 lg:grid-cols-[1.4fr_1fr_1fr_auto]">
            <AdminInput defaultValue={keywordFilter} name="keyword" placeholder="搜索姓名 / 账号 / 电话" />
            <AdminSelect defaultValue={departmentIdFilter ? String(departmentIdFilter) : ""} name="department_id">
              <option value="">所有部门</option>
              {adminUsers.departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </AdminSelect>
            <AdminSelect defaultValue={accountStatusFilter} name="account_status">
              <option value="all">所有状态</option>
              <option value="active">正常启用</option>
              <option value="inactive">已停用</option>
            </AdminSelect>
            <AdminSecondaryButton className="gap-2" type="submit">
              <Search className="h-4 w-4" />
              筛选
            </AdminSecondaryButton>
          </form>
        </AdminToolbar>

        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">姓名</th>
                  <th className="px-4 py-3 font-medium">账号</th>
                  <th className="px-4 py-3 font-medium">部门</th>
                  <th className="px-4 py-3 font-medium">职位</th>
                  <th className="px-4 py-3 font-medium">权限</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">创建时间</th>
                  <th className="px-4 py-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {adminUsers.users.map((user) => {
                  const isAdmin = user.role_code === "admin";
                  return (
                    <tr key={user.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-slate-900">{user.full_name}</p>
                          <p className="mt-1 text-xs text-slate-400">{user.email || "-"}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{user.username}</td>
                      <td className="px-4 py-3 text-slate-600">{user.department_name || "未分配"}</td>
                      <td className="px-4 py-3 text-slate-600">{user.position || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">L{user.clearance_level}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            user.is_active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                          }`}
                        >
                          {isAdmin ? "系统管理员" : user.is_active ? "已启用" : "已停用"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {new Date(user.created_at).toLocaleString("zh-CN")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Link href={`/admin/users${buildAdminQuery(query, { modal: "edit", user_id: user.id })}`}>
                            <AdminSecondaryButton className="h-9 gap-1 px-3">
                              <Edit3 className="h-3.5 w-3.5" />
                              编辑
                            </AdminSecondaryButton>
                          </Link>
                          {!isAdmin ? (
                            <form action={deleteUserAction}>
                              <input name="user_id" type="hidden" value={user.id} />
                              <input name="return_path" type="hidden" value="/admin/users" />
                              <AdminDangerButton className="gap-1" type="submit">
                                <Trash2 className="h-3.5 w-3.5" />
                                删除
                              </AdminDangerButton>
                            </form>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </AdminCard>

      {query.modal === "create" ? (
        <UserModal closeHref={closeHref} departments={adminUsers.departments} returnPath="/admin/users" />
      ) : null}
      {editingUser ? (
        <UserModal
          closeHref={closeHref}
          departments={adminUsers.departments}
          returnPath="/admin/users"
          user={editingUser}
        />
      ) : null}
    </div>
  );
}

function UserModal({
  closeHref,
  departments,
  returnPath,
  user,
}: {
  closeHref: string;
  departments: Array<{ id: number; name: string }>;
  returnPath: string;
  user?: any;
}) {
  const isEdit = Boolean(user);
  const formAction = isEdit ? updateUserAction : createUserAction;
  const isAdmin = user?.role_code === "admin";

  return (
    <AdminModal
      closeHref={closeHref}
      title={isEdit ? "修改用户信息" : "新建用户"}
      description={isEdit ? "按字段分组编辑员工资料和账号状态。" : "管理员创建员工账号，默认账号和密码按系统规则生成。"}
    >
      <form action={formAction} className="space-y-6">
        {isEdit ? <input name="user_id" type="hidden" value={user.id} /> : null}
        <input name="return_path" type="hidden" value={returnPath} />

        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <AdminFieldLabel>用户昵称</AdminFieldLabel>
            <AdminInput defaultValue={user?.full_name ?? ""} name="full_name" required />
          </div>
          <div>
            <AdminFieldLabel>登录账号</AdminFieldLabel>
            <AdminInput defaultValue={user?.username ?? "系统自动生成"} disabled />
          </div>
          <div>
            <AdminFieldLabel>用户分组</AdminFieldLabel>
            <AdminSelect defaultValue={user?.department_id ? String(user.department_id) : ""} disabled={isAdmin} name="department_id">
              <option value="">未分配部门</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </AdminSelect>
          </div>
          <div>
            <AdminFieldLabel>角色权限</AdminFieldLabel>
            <AdminSelect defaultValue={String(user?.clearance_level ?? 1)} disabled={isAdmin} name="clearance_level">
              {employeeClearanceOptions.map((level) => (
                <option key={level} value={level}>
                  普通员工 · L{level}
                </option>
              ))}
            </AdminSelect>
          </div>
          <div>
            <AdminFieldLabel>职位</AdminFieldLabel>
            <AdminInput defaultValue={user?.position ?? ""} disabled={isAdmin} name="position" />
          </div>
          <div>
            <AdminFieldLabel>性别</AdminFieldLabel>
            <AdminSelect defaultValue={user?.gender ?? ""} disabled={isAdmin} name="gender">
              <option value="">未填写</option>
              <option value="男">男</option>
              <option value="女">女</option>
            </AdminSelect>
          </div>
          <div>
            <AdminFieldLabel>邮箱地址</AdminFieldLabel>
            <AdminInput defaultValue={user?.email ?? ""} disabled={isAdmin} name="email" />
          </div>
          <div>
            <AdminFieldLabel>联系电话</AdminFieldLabel>
            <AdminInput defaultValue={user?.phone ?? ""} disabled={isAdmin} name="phone" />
          </div>
          {isEdit ? (
            <div className="lg:col-span-2">
              <AdminFieldLabel>账号状态</AdminFieldLabel>
              <div className="flex items-center gap-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <label className="flex items-center gap-2">
                  <input className="accent-[#5D6BFF]" defaultChecked={user?.is_active} disabled={isAdmin} name="is_active" type="checkbox" />
                  启用
                </label>
                <span className="text-slate-400">停用时间：{user?.deactivated_at ? new Date(user.deactivated_at).toLocaleString("zh-CN") : "-"}</span>
              </div>
            </div>
          ) : (
            <input name="is_active" type="hidden" value="true" />
          )}
        </div>

        {!isEdit ? (
          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
            账号将按“姓名@kms.com”自动生成，默认密码为 123456。员工后续在个人中心自行补充手机、邮箱和简介。
          </div>
        ) : null}

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
          <Link href={closeHref}>
            <AdminSecondaryButton>取消</AdminSecondaryButton>
          </Link>
          <AdminPrimaryButton type="submit">{isEdit ? "保存修改" : "确认创建"}</AdminPrimaryButton>
        </div>
      </form>
    </AdminModal>
  );
}
