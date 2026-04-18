import Link from "next/link";
import { Edit3, Plus, Trash2 } from "lucide-react";

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
  AdminTextarea,
  buildAdminQuery,
} from "../../../components/admin-ui";
import { createRepositoryAction, deleteRepositoryAction, updateRepositoryAction } from "../actions";
import { getAdminContent } from "../../../lib/api";

type SearchParams = Promise<{
  modal?: "create" | "edit";
  repository_id?: string;
}>;

export default async function AdminRepositoriesPage({ searchParams }: { searchParams?: SearchParams }) {
  const query = (searchParams ? await searchParams : undefined) ?? {};
  const adminContent = await getAdminContent();
  const editingRepository =
    query.modal === "edit" && query.repository_id
      ? adminContent.repositories.find((item) => item.id === Number(query.repository_id)) ?? null
      : null;
  const closeHref = `/admin/repositories${buildAdminQuery(query, { modal: null, repository_id: null })}`;

  return (
    <div className="mx-auto max-w-7xl">
      <AdminPageSection
        eyebrow="Content"
        title="仓库管理"
        description="后台只保留仓库级管理。目录与笔记不再放进后台，以免内容中心再次变得过重。"
        action={
          <Link href={`/admin/repositories${buildAdminQuery(query, { modal: "create", repository_id: null })}`}>
            <AdminPrimaryButton className="gap-2">
              <Plus className="h-4 w-4" />
              新建仓库
            </AdminPrimaryButton>
          </Link>
        }
      />

      <AdminCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">仓库名称</th>
                <th className="px-4 py-3 font-medium">Slug</th>
                <th className="px-4 py-3 font-medium">说明</th>
                <th className="px-4 py-3 font-medium">基础权限</th>
                <th className="px-4 py-3 font-medium">目录数</th>
                <th className="px-4 py-3 font-medium">笔记数</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {adminContent.repositories.map((repository) => (
                <tr key={repository.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-medium text-slate-900">{repository.name}</td>
                  <td className="px-4 py-3 text-slate-600">{repository.slug}</td>
                  <td className="max-w-[360px] px-4 py-3 text-slate-600">{repository.description || "-"}</td>
                  <td className="px-4 py-3 text-slate-600">L{repository.min_clearance_level}</td>
                  <td className="px-4 py-3 text-slate-600">{repository.folder_count}</td>
                  <td className="px-4 py-3 text-slate-600">{repository.note_count}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/repositories${buildAdminQuery(query, {
                          modal: "edit",
                          repository_id: repository.id,
                        })}`}
                      >
                        <AdminSecondaryButton className="h-9 gap-1 px-3">
                          <Edit3 className="h-3.5 w-3.5" />
                          编辑
                        </AdminSecondaryButton>
                      </Link>
                      <form action={deleteRepositoryAction}>
                        <input name="repository_id" type="hidden" value={repository.id} />
                        <input name="return_path" type="hidden" value="/admin/repositories" />
                        <AdminDangerButton className="gap-1" type="submit">
                          <Trash2 className="h-3.5 w-3.5" />
                          删除
                        </AdminDangerButton>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminCard>

      {query.modal === "create" ? (
        <RepositoryModal closeHref={closeHref} returnPath="/admin/repositories" />
      ) : null}
      {editingRepository ? (
        <RepositoryModal closeHref={closeHref} repository={editingRepository} returnPath="/admin/repositories" />
      ) : null}
    </div>
  );
}

function RepositoryModal({
  closeHref,
  repository,
  returnPath,
}: {
  closeHref: string;
  repository?: any;
  returnPath: string;
}) {
  const isEdit = Boolean(repository);
  const formAction = isEdit ? updateRepositoryAction : createRepositoryAction;

  return (
    <AdminModal
      closeHref={closeHref}
      title={isEdit ? "修改仓库信息" : "新建仓库"}
      description="维护仓库名称、说明、访问 slug 与基础密级。"
    >
      <form action={formAction} className="space-y-6">
        {isEdit ? <input name="repository_id" type="hidden" value={repository.id} /> : null}
        <input name="return_path" type="hidden" value={returnPath} />
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <AdminFieldLabel>仓库名称</AdminFieldLabel>
            <AdminInput defaultValue={repository?.name ?? ""} name="name" required />
          </div>
          <div>
            <AdminFieldLabel>访问短链</AdminFieldLabel>
            <AdminInput defaultValue={repository?.slug ?? ""} name="slug" required />
          </div>
          <div>
            <AdminFieldLabel>基础密级</AdminFieldLabel>
            <AdminSelect defaultValue={String(repository?.min_clearance_level ?? 2)} name="min_clearance_level">
              {[1, 2, 3, 4].map((level) => (
                <option key={level} value={level}>
                  L{level}
                </option>
              ))}
            </AdminSelect>
          </div>
          <div>
            <AdminFieldLabel>仓库概况</AdminFieldLabel>
            <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-500">
              {repository ? `${repository.folder_count} 个目录 · ${repository.note_count} 篇笔记` : "新仓库还没有内容"}
            </div>
          </div>
          <div className="lg:col-span-2">
            <AdminFieldLabel>仓库说明</AdminFieldLabel>
            <AdminTextarea className="min-h-[120px]" defaultValue={repository?.description ?? ""} name="description" />
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
