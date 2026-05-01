import Link from "next/link";
import { Edit3, FolderTree, Plus, Trash2 } from "lucide-react";

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
  buildAdminQuery,
} from "../../../components/admin-ui";
import { createFolderAction, deleteFolderAction, updateFolderAction } from "../actions";
import { getAdminRepositories, type AdminFolderItem, type AdminRepositorySummaryItem } from "../../../lib/api";

type SearchParams = Promise<{
  modal?: "create" | "edit";
  repository_id?: string;
  folder_id?: string;
}>;

type FolderWithRepository = AdminFolderItem & {
  repository_name: string;
  repository_slug: string;
};

export default async function AdminFoldersPage({ searchParams }: { searchParams?: SearchParams }) {
  const query = (searchParams ? await searchParams : undefined) ?? {};
  const adminRepositories = await getAdminRepositories();
  const selectedRepositoryId = Number(query.repository_id || 0) || null;
  const repositories = adminRepositories.repositories;
  const activeRepository =
    repositories.find((repository) => repository.id === selectedRepositoryId) ?? repositories[0] ?? null;
  const filteredRepositories = selectedRepositoryId
    ? repositories.filter((repository) => repository.id === selectedRepositoryId)
    : repositories;
  const folders = flattenFolders(filteredRepositories);
  const editingFolder = query.modal === "edit" && query.folder_id
    ? folders.find((folder) => folder.id === Number(query.folder_id)) ?? null
    : null;
  const modalRepository = editingFolder
    ? repositories.find((repository) => repository.id === editingFolder.repository_id) ?? null
    : activeRepository;
  const closeHref = `/admin/folders${buildAdminQuery(query, { modal: null, folder_id: null })}`;
  const returnPath = `/admin/folders${buildAdminQuery(query, { modal: null, folder_id: null })}`;

  return (
    <div className="mx-auto max-w-7xl">
      <AdminPageSection
        eyebrow="Content"
        title="目录管理"
        description="独立维护仓库目录结构。删除目录会同步清理目录下笔记、附件对象、全文索引和向量数据。"
        action={
          activeRepository ? (
            <Link href={`/admin/folders${buildAdminQuery(query, { modal: "create", folder_id: null, repository_id: activeRepository.id })}`}>
              <AdminPrimaryButton className="gap-2">
                <Plus className="h-4 w-4" />
                新建目录
              </AdminPrimaryButton>
            </Link>
          ) : null
        }
      />

      <AdminCard className="mb-5 p-4">
        <form className="flex flex-col gap-3 lg:flex-row lg:items-end" method="GET">
          <div className="min-w-0 flex-1">
            <AdminFieldLabel>筛选仓库</AdminFieldLabel>
            <AdminSelect defaultValue={selectedRepositoryId ? String(selectedRepositoryId) : ""} name="repository_id">
              <option value="">全部仓库</option>
              {repositories.map((repository) => (
                <option key={repository.id} value={repository.id}>
                  {repository.name}
                </option>
              ))}
            </AdminSelect>
          </div>
          <AdminSecondaryButton type="submit">应用筛选</AdminSecondaryButton>
        </form>
      </AdminCard>

      <AdminCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">目录名称</th>
                <th className="px-4 py-3 font-medium">所属仓库</th>
                <th className="px-4 py-3 font-medium">上级目录</th>
                <th className="px-4 py-3 font-medium">密级</th>
                <th className="px-4 py-3 font-medium">笔记数</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {folders.map((folder) => (
                <FolderRow
                  folder={folder}
                  key={folder.id}
                  query={query}
                  siblingFolders={repositories.find((repository) => repository.id === folder.repository_id)?.folders ?? []}
                />
              ))}
              {folders.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={6}>
                    当前筛选范围暂无目录。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </AdminCard>

      {query.modal === "create" && modalRepository ? (
        <FolderModal
          closeHref={closeHref}
          repository={modalRepository}
          returnPath={returnPath}
        />
      ) : null}
      {editingFolder && modalRepository ? (
        <FolderModal
          closeHref={closeHref}
          folder={editingFolder}
          repository={modalRepository}
          returnPath={returnPath}
        />
      ) : null}
    </div>
  );
}

function FolderRow({
  folder,
  query,
  siblingFolders,
}: {
  folder: FolderWithRepository;
  query: Record<string, string | undefined>;
  siblingFolders: AdminFolderItem[];
}) {
  const parent = folder.parent_id ? siblingFolders.find((item) => item.id === folder.parent_id) : null;

  return (
    <tr className="transition-colors hover:bg-slate-50/70">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 font-bold text-slate-900">
          <FolderTree className="h-4 w-4 text-red-400" />
          {folder.name}
        </div>
        <div className="mt-1 text-xs text-slate-500">ID #{folder.id}</div>
      </td>
      <td className="px-4 py-3 text-slate-600">{folder.repository_name}</td>
      <td className="px-4 py-3 text-slate-600">{parent ? parent.name : "根目录"}</td>
      <td className="px-4 py-3 text-slate-600">L{folder.clearance_level}</td>
      <td className="px-4 py-3 text-slate-600">{folder.note_count}</td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          <Link
            href={`/admin/folders${buildAdminQuery(query, {
              modal: "edit",
              folder_id: folder.id,
              repository_id: folder.repository_id,
            })}`}
          >
            <AdminSecondaryButton className="h-9 gap-1 px-3">
              <Edit3 className="h-3.5 w-3.5" />
              编辑
            </AdminSecondaryButton>
          </Link>
          <form action={deleteFolderAction}>
            <input name="folder_id" type="hidden" value={folder.id} />
            <input name="return_path" type="hidden" value={`/admin/folders?repository_id=${folder.repository_id}`} />
            <AdminDangerButton className="gap-1" type="submit">
              <Trash2 className="h-3.5 w-3.5" />
              删除
            </AdminDangerButton>
          </form>
        </div>
      </td>
    </tr>
  );
}

function FolderModal({
  closeHref,
  folder,
  repository,
  returnPath,
}: {
  closeHref: string;
  folder?: AdminFolderItem;
  repository: AdminRepositorySummaryItem;
  returnPath: string;
}) {
  const isEdit = Boolean(folder);
  const parentOptions = repository.folders.filter((item) => {
    if (!folder) {
      return true;
    }
    const blockedIds = collectDescendantIds(folder.id, repository.folders);
    return item.id !== folder.id && !blockedIds.has(item.id);
  });

  return (
    <AdminModal
      closeHref={closeHref}
      title={isEdit ? "编辑目录" : "新建目录"}
      description={`所属仓库：${repository.name}`}
    >
      <form action={isEdit ? updateFolderAction : createFolderAction} className="space-y-6">
        {isEdit ? <input name="folder_id" type="hidden" value={folder?.id} /> : null}
        <input name="repository_id" type="hidden" value={repository.id} />
        <input name="return_path" type="hidden" value={returnPath || `/admin/folders?repository_id=${repository.id}`} />

        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <AdminFieldLabel>目录名称</AdminFieldLabel>
            <AdminInput defaultValue={folder?.name ?? ""} name="name" placeholder="如：薪酬福利制度" required />
          </div>
          <div>
            <AdminFieldLabel>上级目录</AdminFieldLabel>
            <AdminSelect defaultValue={folder?.parent_id ? String(folder.parent_id) : ""} name="parent_id">
              <option value="">根目录</option>
              {parentOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </AdminSelect>
          </div>
          <div>
            <AdminFieldLabel>目录密级</AdminFieldLabel>
            <AdminSelect defaultValue={String(folder?.clearance_level ?? repository.min_clearance_level)} name="min_clearance_level">
              {[1, 2, 3, 4].map((level) => (
                <option key={level} value={level}>
                  L{level}
                </option>
              ))}
            </AdminSelect>
          </div>
          <div>
            <AdminFieldLabel>所属仓库</AdminFieldLabel>
            <div className="flex h-11 items-center border border-white/12 bg-black/25 px-4 text-sm font-semibold text-white/70">
              {repository.name}
            </div>
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

function flattenFolders(repositories: AdminRepositorySummaryItem[]): FolderWithRepository[] {
  return repositories.flatMap((repository) =>
    repository.folders.map((folder) => ({
      ...folder,
      repository_name: repository.name,
      repository_slug: repository.slug,
    })),
  );
}

function collectDescendantIds(folderId: number, folders: AdminFolderItem[]): Set<number> {
  const descendants = new Set<number>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (folder.parent_id !== null && (folder.parent_id === folderId || descendants.has(folder.parent_id))) {
        if (!descendants.has(folder.id)) {
          descendants.add(folder.id);
          changed = true;
        }
      }
    }
  }
  return descendants;
}
