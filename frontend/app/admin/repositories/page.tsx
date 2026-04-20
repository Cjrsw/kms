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
import { RepositoryCoverInput } from "../../../components/repository-cover-input";
import { deleteFolderAction, deleteRepositoryAction } from "../actions";
import { getAdminRepositories } from "../../../lib/api";

type SearchParams = Promise<{
  modal?: "create" | "edit";
  repository_id?: string;
}>;

export default async function AdminRepositoriesPage({ searchParams }: { searchParams?: SearchParams }) {
  const query = (searchParams ? await searchParams : undefined) ?? {};
  const adminRepositories = await getAdminRepositories();
  const editingRepository =
    query.modal === "edit" && query.repository_id
      ? adminRepositories.repositories.find((item) => item.id === Number(query.repository_id)) ?? null
      : null;
  const closeHref = `/admin/repositories${buildAdminQuery(query, { modal: null, repository_id: null })}`;

  return (
    <div className="mx-auto max-w-7xl">
      <AdminPageSection
        eyebrow="Content"
        title="仓库管理"
        description="后台保留仓库管理，并提供目录删除入口。目录删除会同步做附件、搜索索引和向量的定向清理。"
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
              {adminRepositories.repositories.map((repository) => (
                <RepositoryRow key={repository.id} query={query} repository={repository} />
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

function RepositoryRow({ repository, query }: { repository: any; query: Record<string, string | undefined> }) {
  const folderMap = new Map<number, any>();
  for (const folder of repository.folders || []) {
    folderMap.set(folder.id, folder);
  }

  return (
    <>
      <tr className="hover:bg-slate-50/70 transition-colors">
        <td className="px-4 py-3 font-bold text-slate-900">{repository.name}</td>
        <td className="px-4 py-3 text-slate-600">{repository.slug}</td>
        <td className="max-w-[360px] px-4 py-3 text-slate-600 truncate">{repository.description || "-"}</td>
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
      <tr className="bg-slate-50/40">
        <td className="px-4 py-4 text-sm text-slate-600" colSpan={7}>
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">目录删除</div>
            {repository.folders.length === 0 ? (
              <div className="text-sm text-slate-400">当前仓库暂无目录。</div>
            ) : (
              <div className="space-y-2">
                {repository.folders.map((folder: any) => {
                  const parent = folder.parent_id ? folderMap.get(folder.parent_id) : null;
                  return (
                    <div
                      key={folder.id}
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-800">{folder.name}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          ID #{folder.id} · L{folder.clearance_level} · {folder.note_count} 篇笔记
                          {parent ? ` · 上级目录：${parent.name}` : " · 根目录"}
                        </div>
                      </div>
                      <form action={deleteFolderAction}>
                        <input name="folder_id" type="hidden" value={folder.id} />
                        <input name="return_path" type="hidden" value="/admin/repositories" />
                        <AdminDangerButton className="gap-1" type="submit">
                          <Trash2 className="h-3.5 w-3.5" />
                          删除目录
                        </AdminDangerButton>
                      </form>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </td>
      </tr>
    </>
  );
}

function resolveRepositoryCoverPreview(repository?: {
  slug: string;
  cover_image_url: string;
  has_cover_image_upload: boolean;
}): string | null {
  if (!repository) {
    return null;
  }
  if (repository.has_cover_image_upload) {
    return `/api/repositories/${repository.slug}/cover`;
  }
  if (repository.cover_image_url) {
    return repository.cover_image_url;
  }
  return null;
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
  const currentCoverUrl = resolveRepositoryCoverPreview(repository);

  return (
    <AdminModal
      closeHref={closeHref}
      title={isEdit ? "修改仓库信息" : "新建知识仓库"}
      description="维护仓库的基础信息、访问短链以及美观的视觉封面图。"
    >
      <form action="/api/admin/repositories/save" className="space-y-6" encType="multipart/form-data" method="POST">
        {isEdit ? <input name="repository_id" type="hidden" value={repository.id} /> : null}
        <input name="current_cover_image_url" type="hidden" value={repository?.cover_image_url ?? ""} />
        <input name="return_path" type="hidden" value={returnPath} />
        
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <AdminFieldLabel>仓库名称</AdminFieldLabel>
            <AdminInput defaultValue={repository?.name ?? ""} name="name" required placeholder="如：前端架构组知识库" />
          </div>
          <div>
            <AdminFieldLabel>访问短链</AdminFieldLabel>
            <AdminInput defaultValue={repository?.slug ?? ""} name="slug" required placeholder="如：frontend" />
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
            <AdminFieldLabel>内容概况</AdminFieldLabel>
            <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-500">
              {repository ? `${repository.folder_count} 个目录 · ${repository.note_count} 篇文档` : "全新创建，暂无数据"}
            </div>
          </div>
          
          <div className="lg:col-span-2">
            <AdminFieldLabel>仓库视觉封面图</AdminFieldLabel>
            <RepositoryCoverInput defaultPreviewUrl={currentCoverUrl} />
          </div>

          <div className="lg:col-span-2">
            <AdminFieldLabel>仓库详细说明</AdminFieldLabel>
            <AdminTextarea className="min-h-[100px]" defaultValue={repository?.description ?? ""} name="description" placeholder="简单描述该仓库的主要内容定位与受众群体..." />
          </div>
        </div>
        
        <div className="flex justify-end gap-3 border-t border-slate-100 pt-6">
          <Link href={closeHref}>
            <AdminSecondaryButton>取消操作</AdminSecondaryButton>
          </Link>
          <AdminPrimaryButton type="submit">{isEdit ? "保存修改" : "确认创建"}</AdminPrimaryButton>
        </div>
      </form>
    </AdminModal>
  );
}
