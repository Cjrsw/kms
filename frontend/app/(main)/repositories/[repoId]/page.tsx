import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AlertCircle, X } from "lucide-react";

import { ConfirmNoteDeleteForm } from "@/components/confirm-note-delete-form";
import { NoteIndexStatus } from "@/components/note-index-status";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { createFolderUser, createNoteUser, deleteNoteUser, getRepository } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";

const buildQuery = (current: any, updates: Record<string, string | number | null>) => {
  const q = new URLSearchParams();
  Object.entries(current || {}).forEach(([key, val]) => {
    if (Array.isArray(val)) val.forEach((value) => q.append(key, value));
    else if (val !== undefined && val !== null) q.set(key, String(val));
  });
  Object.entries(updates).forEach(([key, val]) => {
    if (val === null || val === undefined || val === "") q.delete(key);
    else q.set(key, String(val));
  });
  const suffix = q.toString();
  return suffix ? `?${suffix}` : "";
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("zh-CN");
};

const previewText = (value?: string) => {
  const normalized = (value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "这篇笔记还没有正文内容。";
  return normalized.length > 120 ? `${normalized.slice(0, 120)}...` : normalized;
};

export default async function RepositoryDetailPage({ params, searchParams }: any) {
  const { repoId } = await params;
  const query = await searchParams;

  const currentFolderId = query?.folder ? Number(query.folder) : null;
  const actionCreate = query?.create;
  const actionParentId = query?.parent;
  const errorMessage = query?.error;

  const currentUser = await requireCurrentUser();

  let repository: Awaited<ReturnType<typeof getRepository>>;
  try {
    repository = await getRepository(repoId);
  } catch {
    redirect("/repositories");
  }

  const folders = repository.folders || [];
  const notes = repository.notes || [];

  const buildFolderTree = (flatFolders: any[]) => {
    const map = new Map();
    const tree: any[] = [];
    flatFolders.forEach((folder) => map.set(folder.id, { ...folder, children: [] }));
    flatFolders.forEach((folder) => {
      if (folder.parent_id && map.has(folder.parent_id)) {
        map.get(folder.parent_id).children.push(map.get(folder.id));
      } else {
        tree.push(map.get(folder.id));
      }
    });
    return tree;
  };

  const folderTree = buildFolderTree(folders);
  const currentFolder = currentFolderId ? folders.find((folder: any) => folder.id === currentFolderId) : null;
  const actionParentFolderId = actionParentId ? Number(actionParentId) : null;
  const actionParentFolder = actionParentFolderId
    ? folders.find((folder: any) => folder.id === actionParentFolderId)
    : null;

  const userClearance = currentUser?.clearance_level || 1;
  const minAllowedClearance = actionCreate
    ? Math.max(repository.min_clearance_level || 1, actionParentFolder?.clearance_level || 1)
    : repository.min_clearance_level || 1;
  const clearanceOptions = [
    { value: 1, label: "L1 (基础与公开)" },
    { value: 2, label: "L2 (内部资料)" },
    { value: 3, label: "L3 (核心机密)" },
    { value: 4, label: "L4 (绝密档案)" },
  ].filter((option) => option.value >= minAllowedClearance && option.value <= userClearance);

  const displayedNotes = notes.filter((note: any) =>
    currentFolderId ? note.folder_id === currentFolderId : !note.folder_id
  );

  const getBreadcrumbs = (folderId: number | null) => {
    if (!folderId) return [];
    const crumbs: any[] = [];
    let current: any | undefined = folders.find((folder: any) => folder.id === folderId);
    while (current) {
      crumbs.unshift(current);
      const parentId = current.parent_id;
      if (!parentId) break;
      current = folders.find((folder: any) => folder.id === parentId);
    }
    return crumbs;
  };
  const breadcrumbs = getBreadcrumbs(currentFolderId);
  const breadcrumbLabel = [
    repository.name,
    ...breadcrumbs.map((folder) => folder.name),
  ].join(" / ");

  async function handleCreateFolder(formData: FormData) {
    "use server";
    const parentId = formData.get("parent_id") as string;
    try {
      await createFolderUser(repoId, {
        name: String(formData.get("name") ?? ""),
        parent_id: parentId ? Number(parentId) : null,
        min_clearance_level: Number(formData.get("min_clearance_level") || 1),
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "操作失败";
      redirect(`/repositories/${repoId}?create=folder&parent=${parentId || ""}&error=${encodeURIComponent(msg)}`);
    }
    revalidatePath(`/repositories/${repoId}`);
    redirect(`/repositories/${repoId}${currentFolderId ? `?folder=${currentFolderId}` : ""}`);
  }

  async function handleCreateNote(formData: FormData) {
    "use server";
    const folderId = formData.get("folder_id") as string;
    try {
      await createNoteUser(repoId, {
        title: String(formData.get("title") ?? ""),
        folder_id: folderId ? Number(folderId) : null,
        content_text: "",
        min_clearance_level: Number(formData.get("min_clearance_level") || 1),
        editable_by_clearance: String(formData.get("editable_by_clearance") ?? "") === "true",
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "操作失败";
      redirect(`/repositories/${repoId}?create=note&parent=${folderId || ""}&error=${encodeURIComponent(msg)}`);
    }
    revalidatePath(`/repositories/${repoId}`);
    redirect(`/repositories/${repoId}${folderId ? `?folder=${Number(folderId)}` : ""}`);
  }

  async function handleDeleteNote(formData: FormData) {
    "use server";
    const noteId = Number(String(formData.get("note_id") ?? "").trim());
    if (!Number.isFinite(noteId)) {
      redirect(`/repositories/${repoId}?error=${encodeURIComponent("缺少笔记ID")}`);
    }
    try {
      await deleteNoteUser(repoId, noteId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "删除失败";
      redirect(`/repositories/${repoId}?error=${encodeURIComponent(msg)}`);
    }
    revalidatePath(`/repositories/${repoId}`);
    redirect(`/repositories/${repoId}${currentFolderId ? `?folder=${currentFolderId}` : ""}`);
  }

  return (
    <>
      <section className="kms-repo-detail-layout">
        <aside className="kms-repo-detail-sidebar">
          <div className="kms-tree-header">
            <Link href="/repositories" className="kms-cyber-btn kms-repo-back-btn">
              &lt; BACK
            </Link>
            <div className="kms-tree-title">目录结构</div>
          </div>

          <div className="kms-tree-content">
            <div className="kms-tree-node expanded">
              <div className={`kms-node-label ${currentFolderId ? "" : "active"}`}>
                <Link href={`/repositories/${repoId}`} className="kms-node-link">
                  <span className="kms-node-icon">[-]</span>
                  <span className="kms-node-text">{repository.name}</span>
                </Link>
                <div className="kms-node-actions">
                  <Link href={buildQuery(query, { create: "folder", parent: null, error: null })} className="kms-node-btn">
                    +DIR
                  </Link>
                  <Link href={buildQuery(query, { create: "note", parent: null, error: null })} className="kms-node-btn">
                    +NOTE
                  </Link>
                </div>
              </div>

              {folderTree.length > 0 ? (
                <div className="kms-node-children">
                  {folderTree.map((node) => (
                    <FolderNode
                      key={node.id}
                      node={node}
                      currentFolderId={currentFolderId}
                      query={query}
                      buildQuery={buildQuery}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </aside>

        <main className="kms-repo-detail-main">
          <div className="kms-notes-header">
            <div className="kms-notes-breadcrumb">REPO // {breadcrumbLabel} /</div>
            <Link
              href={buildQuery(query, { create: "note", parent: currentFolderId, error: null })}
              className="kms-cyber-btn kms-new-note-btn"
            >
              + NEW NOTE
            </Link>
          </div>

          {errorMessage && !actionCreate ? (
            <div className="kms-repo-error">
              <AlertCircle className="h-4 w-4" />
              <span>{errorMessage}</span>
            </div>
          ) : null}

          <div className="kms-notes-list-container">
            {displayedNotes.length === 0 ? (
              <div className="kms-empty-note-card">
                <div className="kms-empty-title">当前目录暂无笔记</div>
                <p>右上角点击 + NEW NOTE，或在左侧目录节点上使用 +NOTE 创建。</p>
              </div>
            ) : (
              displayedNotes.map((note: any) => (
                <article key={note.id} className="kms-search-result-item kms-note-card">
                  <div className="kms-result-icon">
                    <div className="kms-icon-square" />
                    <div className="kms-icon-line" />
                  </div>

                  <Link href={`/repositories/${repoId}/notes/${note.id}`} className="kms-result-content">
                    <div className="kms-result-title">{note.title}</div>
                    <div className="kms-result-desc">{previewText(note.content_text)}</div>
                    <div className="kms-result-footer">
                      <span className="kms-result-tag">L{note.clearance_level}</span>
                      <span className="kms-result-date">更新于 {formatDate(note.updated_at)}</span>
                      <span className="kms-result-author">@{note.author_name || "系统"}</span>
                      <NoteIndexStatus
                        repoSlug={repoId}
                        noteId={note.id}
                        initialStatus={note.search_index_status}
                        initialError={note.search_index_error}
                      />
                    </div>
                  </Link>

                  <div className="kms-note-actions">
                    <Link href={`/repositories/${repoId}/notes/${note.id}`} className="kms-profile-action-btn">
                      READ
                    </Link>
                    {note.can_edit ? (
                      <Link href={`/repositories/${repoId}/notes/${note.id}/edit`} className="kms-profile-action-btn">
                        EDIT
                      </Link>
                    ) : null}
                    {note.can_delete ? (
                      <ConfirmNoteDeleteForm action={handleDeleteNote} noteId={note.id} noteTitle={note.title} />
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </div>
        </main>
      </section>

      {actionCreate ? (
        <div className="kms-repo-modal-backdrop">
          <form action={actionCreate === "folder" ? handleCreateFolder : handleCreateNote} className="kms-repo-modal">
            <div className="kms-repo-modal-header">
              <h3>{actionCreate === "folder" ? "NEW DIR // 新建目录" : "NEW NOTE // 新建笔记"}</h3>
              <Link href={buildQuery(query, { create: null, parent: null, error: null })} className="kms-modal-close">
                <X className="h-5 w-5" />
              </Link>
            </div>

            {errorMessage ? (
              <div className="kms-repo-error">
                <AlertCircle className="h-4 w-4" />
                <span>{errorMessage}</span>
              </div>
            ) : null}

            <input type="hidden" name={actionCreate === "folder" ? "parent_id" : "folder_id"} value={actionParentId || ""} />

            <label className="kms-repo-label">
              {actionCreate === "folder" ? "目录名称" : "笔记标题"}
              <input
                name={actionCreate === "folder" ? "name" : "title"}
                required
                autoFocus
                className="kms-repo-input"
                placeholder={actionCreate === "folder" ? "例如：产品设计方案" : "例如：本周会议纪要"}
              />
            </label>

            <label className="kms-repo-label">
              访问密级设置
              <select name="min_clearance_level" defaultValue={String(Math.min(userClearance, minAllowedClearance))} className="kms-repo-input">
                {clearanceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {actionCreate === "note" ? (
              <label className="kms-repo-label">
                编辑权限
                <select name="editable_by_clearance" defaultValue="false" className="kms-repo-input">
                  <option value="false">仅创建者和管理员可编辑</option>
                  <option value="true">达到笔记密级及以上的用户可编辑</option>
                </select>
              </label>
            ) : null}

            <div className="kms-repo-modal-actions">
              <Link href={buildQuery(query, { create: null, parent: null, error: null })} className="kms-cyber-btn">
                CANCEL
              </Link>
              <PendingSubmitButton className="kms-cyber-btn primary" pendingChildren="上传中...">
                CONFIRM
              </PendingSubmitButton>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}

function FolderNode({ node, currentFolderId, query, buildQuery }: any) {
  const isSelected = currentFolderId === node.id;
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className={`kms-tree-node ${hasChildren ? "expanded" : ""}`}>
      <div className={`kms-node-label ${isSelected ? "active" : ""}`}>
        <Link href={buildQuery(query, { folder: node.id, create: null, parent: null, error: null })} className="kms-node-link">
          <span className="kms-node-icon">{hasChildren ? "[-]" : "[+]"}</span>
          <span className="kms-node-text">{node.name}</span>
        </Link>
        <div className="kms-node-actions">
          <Link href={buildQuery(query, { create: "folder", parent: node.id, error: null })} className="kms-node-btn">
            +DIR
          </Link>
          <Link href={buildQuery(query, { create: "note", parent: node.id, error: null })} className="kms-node-btn">
            +NOTE
          </Link>
        </div>
      </div>

      {hasChildren ? (
        <div className="kms-node-children">
          {node.children.map((child: any) => (
            <FolderNode key={child.id} node={child} currentFolderId={currentFolderId} query={query} buildQuery={buildQuery} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
