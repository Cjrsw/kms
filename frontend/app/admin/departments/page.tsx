import Link from "next/link";
import { Edit3, Plus } from "lucide-react";

import {
  AdminCard,
  AdminFieldLabel,
  AdminInput,
  AdminModal,
  AdminPageSection,
  AdminPrimaryButton,
  AdminSecondaryButton,
  AdminSelect,
  buildAdminQuery,
} from "../../../components/admin-ui";
import { createDepartmentAction, updateDepartmentAction } from "../actions";
import { getAdminUsers } from "../../../lib/api";

type SearchParams = Promise<{
  modal?: "create" | "edit";
  department_id?: string;
}>;

export default async function AdminDepartmentsPage({ searchParams }: { searchParams?: SearchParams }) {
  const query = (searchParams ? await searchParams : undefined) ?? {};
  const adminUsers = await getAdminUsers();
  const editingDepartment =
    query.modal === "edit" && query.department_id
      ? adminUsers.departments.find((item) => item.id === Number(query.department_id)) ?? null
      : null;
  const closeHref = `/admin/departments${buildAdminQuery(query, { modal: null, department_id: null })}`;

  return (
    <div className="mx-auto max-w-7xl">
      <AdminPageSection
        eyebrow="Organization"
        title="部门管理"
        description="部门结构单独维护，避免和用户编辑堆在同一页。创建和编辑统一走居中弹窗。"
        action={
          <Link href={`/admin/departments${buildAdminQuery(query, { modal: "create", department_id: null })}`}>
            <AdminPrimaryButton className="gap-2">
              <Plus className="h-4 w-4" />
              新建部门
            </AdminPrimaryButton>
          </Link>
        }
      />

      <AdminCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">部门名称</th>
                <th className="px-4 py-3 font-medium">编码</th>
                <th className="px-4 py-3 font-medium">上级部门</th>
                <th className="px-4 py-3 font-medium">成员数</th>
                <th className="px-4 py-3 font-medium">排序</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {adminUsers.departments.map((department) => {
                const parent = adminUsers.departments.find((item) => item.id === department.parent_id);
                return (
                  <tr key={department.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium text-slate-900">{department.name}</td>
                    <td className="px-4 py-3 text-slate-600">{department.code}</td>
                    <td className="px-4 py-3 text-slate-600">{parent?.name || "顶级部门"}</td>
                    <td className="px-4 py-3 text-slate-600">{department.member_count}</td>
                    <td className="px-4 py-3 text-slate-600">{department.sort_order}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          department.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {department.is_active ? "已启用" : "已停用"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/admin/departments${buildAdminQuery(query, { modal: "edit", department_id: department.id })}`}>
                        <AdminSecondaryButton className="h-9 gap-1 px-3">
                          <Edit3 className="h-3.5 w-3.5" />
                          编辑
                        </AdminSecondaryButton>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </AdminCard>

      {query.modal === "create" ? (
        <DepartmentModal allDepartments={adminUsers.departments} closeHref={closeHref} returnPath="/admin/departments" />
      ) : null}
      {editingDepartment ? (
        <DepartmentModal
          allDepartments={adminUsers.departments}
          closeHref={closeHref}
          department={editingDepartment}
          returnPath="/admin/departments"
        />
      ) : null}
    </div>
  );
}

function DepartmentModal({
  allDepartments,
  closeHref,
  department,
  returnPath,
}: {
  allDepartments: any[];
  closeHref: string;
  department?: any;
  returnPath: string;
}) {
  const isEdit = Boolean(department);
  const formAction = isEdit ? updateDepartmentAction : createDepartmentAction;

  return (
    <AdminModal
      closeHref={closeHref}
      title={isEdit ? "修改部门信息" : "新建部门"}
      description="维护部门名称、编码、上级关系和启停状态。"
    >
      <form action={formAction} className="space-y-6">
        {isEdit ? <input name="department_id" type="hidden" value={department.id} /> : null}
        <input name="return_path" type="hidden" value={returnPath} />
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <AdminFieldLabel>部门名称</AdminFieldLabel>
            <AdminInput defaultValue={department?.name ?? ""} name="name" required />
          </div>
          <div>
            <AdminFieldLabel>部门编码</AdminFieldLabel>
            <AdminInput defaultValue={department?.code ?? ""} name="code" required />
          </div>
          <div>
            <AdminFieldLabel>上级部门</AdminFieldLabel>
            <AdminSelect defaultValue={department?.parent_id ? String(department.parent_id) : ""} name="parent_id">
              <option value="">顶级部门</option>
              {allDepartments
                .filter((item) => item.id !== department?.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </AdminSelect>
          </div>
          <div>
            <AdminFieldLabel>显示排序</AdminFieldLabel>
            <AdminInput defaultValue={department?.sort_order ?? 0} min={0} name="sort_order" type="number" />
          </div>
          <div className="lg:col-span-2">
            <AdminFieldLabel>状态</AdminFieldLabel>
            <div className="flex items-center gap-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <label className="flex items-center gap-2">
                <input
                  className="accent-[#5D6BFF]"
                  defaultChecked={department ? department.is_active : true}
                  name="is_active"
                  type="checkbox"
                />
                启用
              </label>
              <span className="text-slate-400">成员数：{department?.member_count ?? 0}</span>
            </div>
          </div>
        </div>
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
