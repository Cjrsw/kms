import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  Folder, FileText, ChevronRight, FolderPlus,
  FilePlus, Layers3, X, AlertCircle, Trash2, ChevronDown, MoreHorizontal, FilePenLine
} from "lucide-react";

import { AppShell } from "../../../components/app-shell";
import { requireCurrentUser } from "../../../lib/auth";
import { createFolderUser, createNoteUser, deleteFolderUser, deleteNoteUser, getRepository } from "../../../lib/api";

// 工具函数：利用 URL SearchParams 无缝更新 UI 状态
const buildQuery = (current: any, updates: Record<string, string | number | null>) => {
  const q = new URLSearchParams();
  Object.entries(current || {}).forEach(([key, val]) => {
    if (Array.isArray(val)) val.forEach(v => q.append(key, v));
    else q.set(key, String(val));
  });
  Object.entries(updates).forEach(([key, val]) => {
    if (val === null || val === undefined || val === '') q.delete(key);
    else q.set(key, String(val));
  });
  return `?${q.toString()}`;
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

  // 树形结构
  const buildFolderTree = (flatFolders: any[]) => {
    const map = new Map();
    const tree: any[] = [];
    flatFolders.forEach(f => map.set(f.id, { ...f, children: [] }));
    flatFolders.forEach(f => {
      if (f.parent_id && map.has(f.parent_id)) {
        map.get(f.parent_id).children.push(map.get(f.id));
      } else {
        tree.push(map.get(f.id));
      }
    });
    return tree;
  };

  const folderTree = buildFolderTree(folders);
  const currentFolder = currentFolderId ? folders.find((f: any) => f.id === currentFolderId) : null;
  const actionParentFolderId = actionParentId ? Number(actionParentId) : null;
  const actionParentFolder = actionParentFolderId ? folders.find((f: any) => f.id === actionParentFolderId) : null;
  const rootNotes = notes.filter((n: any) => !n.folder_id);

  const userClearance = currentUser?.clearance_level || 1;
  const minAllowedClearance =
    actionCreate
      ? Math.max(
          repository.min_clearance_level || 1,
          actionParentFolder?.clearance_level || 1
        )
      : (repository.min_clearance_level || 1);
  const clearanceOptions = [
    { value: 1, label: "L1 (基础与公开)" },
    { value: 2, label: "L2 (内部资料)" },
    { value: 3, label: "L3 (核心机密)" },
    { value: 4, label: "L4 (绝密档案)" }
  ].filter(opt => opt.value >= minAllowedClearance && opt.value <= userClearance);

  // 过滤当前展示层级的内容
  const displayedFolders = folders.filter((f: any) =>
     currentFolderId ? f.parent_id === currentFolderId : !f.parent_id
  );
  const displayedNotes = notes.filter((n: any) =>
     currentFolderId ? n.folder_id === currentFolderId : !n.folder_id
  );

  const getBreadcrumbs = (folderId: number | null) => {
     if (!folderId) return [];
     const crumbs: any[] = [];
     let curr: any | undefined = folders.find((f: any) => f.id === folderId);
     while (curr) {
        crumbs.unshift(curr);
        const parentId = curr.parent_id;
        if (!parentId) break;
        curr = folders.find((f: any) => f.id === parentId);
     }
     return crumbs;
  };
  const breadcrumbs = getBreadcrumbs(currentFolderId);

  // ==========================================
  // Inline Server Actions
  // ==========================================

  async function handleCreateFolder(formData: FormData) {
    "use server";
    const pId = formData.get("parent_id") as string;
    try {
      await createFolderUser(repoId, {
        name: String(formData.get("name") ?? ""),
        parent_id: pId ? Number(pId) : null,
        min_clearance_level: Number(formData.get("min_clearance_level") || 1),
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "操作失败";
      redirect(`/repositories/${repoId}?create=folder&parent=${pId || ""}&error=${encodeURIComponent(msg)}`);
    }
    revalidatePath(`/repositories/${repoId}`);
    redirect(`/repositories/${repoId}${currentFolderId ? `?folder=${currentFolderId}` : ""}`);
  }

  async function handleCreateNote(formData: FormData) {
    "use server";
    const fId = formData.get("folder_id") as string;
    try {
      await createNoteUser(repoId, {
        title: String(formData.get("title") ?? ""),
        folder_id: fId ? Number(fId) : null,
        content_text: "",
        min_clearance_level: Number(formData.get("min_clearance_level") || 1),
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "操作失败";
      redirect(`/repositories/${repoId}?create=note&parent=${fId || ""}&error=${encodeURIComponent(msg)}`);
    }
    revalidatePath(`/repositories/${repoId}`);
    redirect(`/repositories/${repoId}${fId ? `?folder=${Number(fId)}` : ""}`);
  }

  async function handleDeleteFolder(formData: FormData) {
    "use server";
    const folderId = Number(String(formData.get("folder_id") ?? "").trim());
    if (!Number.isFinite(folderId)) redirect(`/repositories/${repoId}?error=${encodeURIComponent("缺少目录ID")}`);
    try {
      await deleteFolderUser(repoId, folderId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "删除失败";
      redirect(`/repositories/${repoId}?error=${encodeURIComponent(msg)}`);
    }
    revalidatePath(`/repositories/${repoId}`);
    redirect(`/repositories/${repoId}`);
  }

  async function handleDeleteNote(formData: FormData) {
    "use server";
    const noteId = Number(String(formData.get("note_id") ?? "").trim());
    if (!Number.isFinite(noteId)) redirect(`/repositories/${repoId}?error=${encodeURIComponent("缺少笔记ID")}`);
    try {
      await deleteNoteUser(repoId, noteId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "删除失败";
      redirect(`/repositories/${repoId}?error=${encodeURIComponent(msg)}`);
    }
    revalidatePath(`/repositories/${repoId}`);
    redirect(`/repositories/${repoId}`);
  }

  return (
    <AppShell
      contentClassName="p-0 bg-white"
      currentUser={currentUser}
      title={repository.name}
      description={repository.description}
    >
      <div className="flex h-full min-h-screen w-full relative">
        
        {/* 左侧树形导航：极简透明风格 (Notion-like) */}
        <aside className="w-64 hidden lg:flex flex-col border-r border-slate-100 bg-slate-50/50 pt-6">
          <div className="px-5 mb-4">
            <Link href={`/repositories/${repoId}`} className="group flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
                <Layers3 className="h-4 w-4" />
              </div>
              <span className="font-bold text-slate-800 truncate leading-tight">{repository.name}</span>
            </Link>
          </div>
          
          <div className="flex-1 overflow-y-auto px-3 pb-8 custom-scrollbar">
            <div className="flex items-center justify-between px-2 py-1 mb-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">目录树</span>
              <Link href={buildQuery(query, { create: 'folder', parent: null, error: null })} className="text-slate-400 hover:text-indigo-600">
                <FolderPlus className="h-4 w-4" />
              </Link>
            </div>
            
            {folderTree.length === 0 ? (
              <p className="px-2 py-4 text-sm text-slate-400">暂无子目录</p>
            ) : (
              <div className="space-y-0.5">
                {folderTree.map(node => (
                  <FolderNode
                    key={node.id}
                    node={node}
                    notes={notes}
                    currentFolderId={currentFolderId}
                    query={query}
                    buildQuery={buildQuery}
                    repoId={repoId}
                    onDeleteFolder={handleDeleteFolder}
                    onDeleteNote={handleDeleteNote}
                  />
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* 右侧主区域：优雅列表模式 */}
        <main className="flex-1 flex flex-col bg-white overflow-y-auto custom-scrollbar">
          <div className="w-full max-w-5xl mx-auto px-6 py-10 lg:px-12 lg:py-16">
            
            {/* 面包屑导航 */}
            <nav className="flex items-center flex-wrap gap-2 text-sm font-medium text-slate-500 mb-8">
               <Link href={`/repositories/${repoId}`} className="hover:text-indigo-600 transition-colors">
                 首页
               </Link>
               {breadcrumbs.map(crumb => (
                 <div key={crumb.id} className="flex items-center gap-2">
                   <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                   <Link href={buildQuery(query, { folder: crumb.id })} className="hover:text-indigo-600 transition-colors">
                     {crumb.name}
                   </Link>
                 </div>
               ))}
            </nav>

            {/* 标题与主动作区 */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-12 border-b border-slate-100 pb-8">
              <div>
                <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">
                  {currentFolder ? currentFolder.name : repository.name}
                </h1>
                {!currentFolder && (
                  <p className="mt-3 text-slate-500 text-base">{repository.description}</p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Link
                  href={buildQuery(query, { create: 'folder', parent: currentFolderId, error: null })}
                  className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  <FolderPlus className="h-4 w-4" /> 新建目录
                </Link>
                <Link
                  href={buildQuery(query, { create: 'note', parent: currentFolderId, error: null })}
                  className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 transition-colors hover:shadow-md"
                >
                  <FilePlus className="h-4 w-4" /> 新建笔记
                </Link>
              </div>
            </div>

            {/* 错误提示区块 */}
            {errorMessage && !actionCreate && (
              <div className="mb-8 flex items-start gap-3 rounded-xl bg-rose-50 p-4 text-sm font-medium text-rose-700 border border-rose-100">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* 文件列表 (List View) */}
            {displayedFolders.length === 0 && displayedNotes.length === 0 ? (
               <div className="flex flex-col items-center justify-center py-24 text-center">
                 <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50 text-slate-300 mb-4">
                   <FilePenLine className="h-8 w-8" />
                 </div>
                 <h3 className="text-lg font-bold text-slate-700">内容为空</h3>
                 <p className="mt-1 text-sm text-slate-500">当前目录下还没有创建任何文件夹或笔记。</p>
               </div>
            ) : (
              <div className="flex flex-col border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
                {/* 列表头 */}
                <div className="grid grid-cols-12 gap-4 bg-slate-50/80 px-6 py-3 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <div className="col-span-7 sm:col-span-6">名称</div>
                  <div className="hidden sm:block col-span-2 text-center">权限要求</div>
                  <div className="hidden sm:block col-span-3 text-right">最后更新</div>
                  <div className="col-span-5 sm:col-span-1 text-right">操作</div>
                </div>

                {/* 目录列表 */}
                {displayedFolders.map((folder: any) => (
                  <div key={`folder-${folder.id}`} className="group grid grid-cols-12 gap-4 items-center px-6 py-4 border-b border-slate-100/60 hover:bg-slate-50/80 transition-colors last:border-0">
                    <div className="col-span-7 sm:col-span-6 flex items-center min-w-0">
                      <Folder className="h-5 w-5 text-indigo-400 shrink-0 mr-3 fill-indigo-50" />
                      <Link href={buildQuery(query, { folder: folder.id })} className="font-semibold text-slate-800 truncate hover:text-indigo-600 hover:underline">
                        {folder.name}
                      </Link>
                    </div>
                    <div className="hidden sm:flex col-span-2 items-center justify-center">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">L{folder.clearance_level}</span>
                    </div>
                    <div className="hidden sm:block col-span-3 text-right text-sm text-slate-400">
                      -
                    </div>
                    <div className="col-span-5 sm:col-span-1 flex items-center justify-end">
                      <form action={handleDeleteFolder}>
                        <input type="hidden" name="folder_id" value={folder.id} />
                        <button type="submit" className="text-slate-300 hover:text-rose-500 transition-colors p-1" title="删除目录">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </form>
                    </div>
                  </div>
                ))}

                {/* 笔记列表 */}
                {displayedNotes.map((note: any) => (
                  <div key={`note-${note.id}`} className="group grid grid-cols-12 gap-4 items-center px-6 py-4 border-b border-slate-100/60 hover:bg-slate-50/80 transition-colors last:border-0">
                    <div className="col-span-7 sm:col-span-6 flex items-center min-w-0">
                      <FileText className="h-5 w-5 text-emerald-500 shrink-0 mr-3" />
                      <Link href={`/repositories/${repoId}/notes/${note.id}`} className="font-semibold text-slate-800 truncate hover:text-emerald-600 hover:underline">
                        {note.title}
                      </Link>
                    </div>
                    <div className="hidden sm:flex col-span-2 items-center justify-center">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">L{note.clearance_level}</span>
                    </div>
                    <div className="hidden sm:block col-span-3 text-right text-sm text-slate-500">
                      {new Date(note.updated_at).toLocaleDateString()}
                    </div>
                    <div className="col-span-5 sm:col-span-1 flex items-center justify-end">
                      <form action={handleDeleteNote}>
                        <input type="hidden" name="note_id" value={note.id} />
                        <button type="submit" className="text-slate-300 hover:text-rose-500 transition-colors p-1" title="删除笔记">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* 浮动模态框 */}
      {actionCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <form action={actionCreate === 'folder' ? handleCreateFolder : handleCreateNote} className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl animate-fade-in duration-200">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                {actionCreate === 'folder' ? <FolderPlus className="w-6 h-6 text-indigo-600"/> : <FilePlus className="w-6 h-6 text-emerald-600"/>}
                {actionCreate === 'folder' ? (actionParentId ? "新建子目录" : "新建根目录") : "新建知识笔记"}
              </h3>
              <Link href={buildQuery(query, { create: null, parent: null, error: null })} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors">
                <X className="h-5 w-5" />
              </Link>
            </div>

            <div className="space-y-6">
              <input type="hidden" name={actionCreate === 'folder' ? 'parent_id' : 'folder_id'} value={actionParentId || ""} />

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  {actionCreate === 'folder' ? '目录名称' : '笔记标题'}
                </label>
                <input
                  name={actionCreate === 'folder' ? 'name' : 'title'}
                  required
                  autoFocus
                  className="input-field w-full"
                  placeholder={actionCreate === 'folder' ? '例如：产品设计方案' : '例如：本周会议纪要'}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">访问密级设置</label>
                <select
                  name="min_clearance_level"
                  defaultValue={String(Math.min(userClearance, minAllowedClearance))}
                  className="input-field w-full bg-white cursor-pointer"
                >
                  {clearanceOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-8 flex gap-3 justify-end border-t border-slate-100 pt-6">
              <Link href={buildQuery(query, { create: null, parent: null, error: null })} className="btn-secondary">
                取消
              </Link>
              <button type="submit" className={`px-6 py-2.5 text-sm font-bold text-white rounded-xl transition-all shadow-sm active:scale-95 ${actionCreate === 'folder' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                确认创建
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}

function FolderNode({ node, notes, currentFolderId, query, buildQuery, repoId, onDeleteFolder, onDeleteNote }: any) {
  const isSelected = currentFolderId === node.id;
  const childNotes = notes.filter((note: any) => note.folder_id === node.id);
  const hasChildren = (node.children && node.children.length > 0) || childNotes.length > 0;

  return (
    <div className="mb-0.5">
      <div className={`group flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50/80 text-indigo-700' : 'text-slate-600 hover:bg-slate-200/50'}`}>
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
           {hasChildren ? (
             <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
           ) : (
             <div className="w-3.5 shrink-0" />
           )}
           <Link href={buildQuery(query, { folder: node.id })} className="flex items-center gap-2 flex-1 min-w-0 text-sm font-medium hover:text-indigo-600 truncate">
             <Folder className={`h-4 w-4 shrink-0 ${isSelected ? 'fill-indigo-100 text-indigo-500' : 'text-slate-400'}`} />
             <span className="truncate">{node.name}</span>
           </Link>
        </div>
        <div className="opacity-0 group-hover:opacity-100 flex items-center shrink-0 ml-2">
           <Link href={buildQuery(query, { create: 'folder', parent: node.id, error: null })} className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-indigo-600" title="新建目录">
             <FolderPlus className="h-3.5 w-3.5"/>
           </Link>
           <Link href={buildQuery(query, { create: 'note', parent: node.id, error: null })} className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-emerald-600" title="新建笔记">
             <FilePlus className="h-3.5 w-3.5"/>
           </Link>
        </div>
      </div>

      {hasChildren && (
        <div className="pl-4 ml-2.5 mt-0.5 border-l border-slate-200/50 flex flex-col gap-0.5">
           {node.children && node.children.map((child: any) => (
              <FolderNode
                key={child.id}
                node={child}
                notes={notes}
                currentFolderId={currentFolderId}
                query={query}
                buildQuery={buildQuery}
                repoId={repoId}
                onDeleteFolder={onDeleteFolder}
                onDeleteNote={onDeleteNote}
              />
           ))}
           {childNotes.map((note: any) => (
             <Link key={note.id} href={`/repositories/${repoId}/notes/${note.id}`} className="group flex items-center px-2 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200/50 hover:text-indigo-700 transition-colors">
               <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400 mr-2 group-hover:text-indigo-500" />
               <span className="truncate flex-1">{note.title}</span>
             </Link>
           ))}
        </div>
      )}
    </div>
  );
}
