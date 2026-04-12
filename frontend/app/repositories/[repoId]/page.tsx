import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  Folder, FileText, ChevronRight, FolderPlus,
  FilePlus, Layers3, X, FilePenLine, PanelLeftClose, PanelLeft, AlertCircle, Trash2
} from "lucide-react";

import { AppShell } from "../../../components/app-shell";
import { requireCurrentUser } from "../../../lib/auth";
import { createFolderUser, createNoteUser, deleteFolderUser, deleteNoteUser, getRepository } from "../../../lib/api";

// 工具函数：利用 URL SearchParams 无缝更新 UI 状态 (模态框、当前目录等)
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

  // 从 URL 读取所有 UI 状态
  const currentFolderId = query?.folder ? Number(query.folder) : null;
  const actionCreate = query?.create; // 'folder' | 'note'
  const actionParentId = query?.parent; // 父级ID（如果为空则是根目录）
  const isSidebarHidden = query?.sidebar === 'hidden';
  const errorMessage = query?.error; // 后端返回的错误提示

  const currentUser = await requireCurrentUser();

  // 获取当前仓库、目录和笔记内容
  let repository: Awaited<ReturnType<typeof getRepository>>;
  try {
    repository = await getRepository(repoId);
  } catch {
    redirect("/repositories");
  }
  const folders = repository.folders || [];
  const notes = repository.notes || [];

  // 构建支持无限层级的树形结构
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

  // 动态计算用户能够分配的最高密级（不能超过自己的密级）
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

  // 过滤出要在右侧展示的目录与笔记
  const displayedFolders = folders.filter((f: any) =>
     currentFolderId ? f.parent_id === currentFolderId : !f.parent_id
  );
  const displayedNotes = notes.filter((n: any) =>
     currentFolderId ? n.folder_id === currentFolderId : !n.folder_id
  );

  // 面包屑导航生成器
  const getBreadcrumbs = (folderId: number | null) => {
     if (!folderId) return [];
     const crumbs: any[] = [];
     let curr: any | undefined = folders.find((f: any) => f.id === folderId);
     while (curr) {
        crumbs.unshift(curr);
        const parentId = curr.parent_id;
        if (!parentId) {
          break;
        }
        curr = folders.find((f: any) => f.id === parentId);
     }
     return crumbs;
  };
  const breadcrumbs = getBreadcrumbs(currentFolderId);

  // ==========================================
  // Inline Server Actions (处理表单提交)
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
      const msg = error instanceof Error ? error.message : "操作失败，可能由于权限不足";
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
      const msg = error instanceof Error ? error.message : "操作失败，可能由于权限不足";
      redirect(`/repositories/${repoId}?create=note&parent=${fId || ""}&error=${encodeURIComponent(msg)}`);
    }

    revalidatePath(`/repositories/${repoId}`);
    // 创建笔记后应落在触发创建的目录视图里，否则用户会误以为“没归属”
    redirect(`/repositories/${repoId}${fId ? `?folder=${Number(fId)}` : ""}`);
  }

  async function handleDeleteFolder(formData: FormData) {
    "use server";
    const folderId = Number(String(formData.get("folder_id") ?? "").trim());
    if (!Number.isFinite(folderId)) {
      redirect(`/repositories/${repoId}?error=${encodeURIComponent("目录删除失败：缺少目录ID")}`);
    }

    try {
      await deleteFolderUser(repoId, folderId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "目录删除失败，可能由于权限不足。";
      const querySuffix = currentFolderId
        ? `?folder=${currentFolderId}&error=${encodeURIComponent(msg)}`
        : `?error=${encodeURIComponent(msg)}`;
      redirect(`/repositories/${repoId}${querySuffix}`);
    }

    revalidatePath(`/repositories/${repoId}`);
    if (currentFolderId === folderId) {
      redirect(`/repositories/${repoId}`);
    }
    redirect(`/repositories/${repoId}${currentFolderId ? `?folder=${currentFolderId}` : ""}`);
  }

  async function handleDeleteNote(formData: FormData) {
    "use server";
    const noteId = Number(String(formData.get("note_id") ?? "").trim());
    if (!Number.isFinite(noteId)) {
      redirect(`/repositories/${repoId}?error=${encodeURIComponent("笔记删除失败：缺少笔记ID")}`);
    }

    try {
      await deleteNoteUser(repoId, noteId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "笔记删除失败，可能由于权限不足。";
      const querySuffix = currentFolderId
        ? `?folder=${currentFolderId}&error=${encodeURIComponent(msg)}`
        : `?error=${encodeURIComponent(msg)}`;
      redirect(`/repositories/${repoId}${querySuffix}`);
    }

    revalidatePath(`/repositories/${repoId}`);
    redirect(`/repositories/${repoId}${currentFolderId ? `?folder=${currentFolderId}` : ""}`);
  }

  return (
    <AppShell
      contentClassName="p-0 bg-white"
      currentUser={currentUser}
      title={repository.name}
      description="仓库详情页：目录树与笔记列表，支持按权限创建目录与笔记。"
    >
      <div className="flex h-[calc(100vh-64px)] w-full overflow-hidden relative">

        {/* 当侧边栏被收起时显示的控制按钮 */}
        {isSidebarHidden && (
           <Link
             href={buildQuery(query, { sidebar: null })}
             className="absolute top-4 left-4 z-10 p-2.5 bg-white border border-slate-200 rounded-xl shadow-sm text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-all"
             title="展开侧边栏"
           >
             <PanelLeft className="w-5 h-5" />
           </Link>
        )}

        {/* 侧边栏：知识树结构 */}
        {!isSidebarHidden && (
          <div className="w-72 lg:w-[340px] border-r border-slate-200 bg-slate-50/80 flex flex-col shrink-0">
            {/* 侧边栏顶部：根目录名称与操作 */}
            <div className="p-4 border-b border-slate-200 flex justify-between items-center group/header hover:bg-white transition-colors">
              <Link href={`/repositories/${repoId}`} className="font-bold text-slate-800 flex items-center gap-2.5 truncate flex-1">
                <div className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
                  <Layers3 className="w-4 h-4"/>
                </div>
                <span className="truncate">{repository.name}</span>
              </Link>
              {/* 根目录下的创建入口 */}
              <div className="flex items-center gap-0.5 opacity-0 group-hover/header:opacity-100 transition-opacity">
                <Link href={buildQuery(query, { create: 'folder', parent: null, error: null })} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors" title="新建根目录">
                  <FolderPlus className="w-4 h-4"/>
                </Link>
                <Link href={buildQuery(query, { sidebar: 'hidden' })} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-md transition-colors ml-1" title="收起侧边栏">
                  <PanelLeftClose className="w-4 h-4" />
                </Link>
              </div>
            </div>

            {/* 树形目录渲染区 */}
            <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
              {folderTree.length === 0 ? (
                <div className="text-center p-4 text-sm text-slate-400 mt-10">
                  暂无目录结构<br/>悬停上方并点击 + 开始创建
                </div>
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

              {rootNotes.length ? (
                <div className="mt-4 border-t border-slate-200 pt-3">
                  <p className="mb-2 px-1 text-xs font-semibold text-slate-500">根目录笔记</p>
                  <div className="space-y-1">
                    {rootNotes.map((note: any) => (
                      <div key={note.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 transition-colors hover:bg-white">
                        <Link href={`/repositories/${repoId}/notes/${note.id}`} className="flex min-w-0 flex-1 items-center gap-2 hover:text-blue-700">
                          <FileText className="h-4 w-4 text-slate-400" />
                          <span className="truncate">{note.title}</span>
                        </Link>
                        <form action={handleDeleteNote}>
                          <input type="hidden" name="note_id" value={note.id} />
                          <button
                            type="submit"
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            title="删除笔记"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </form>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* 右侧主内容区：当前目录下的笔记列表 */}
        <div className="flex-1 flex flex-col bg-white overflow-y-auto relative custom-scrollbar">
           <div className={`max-w-6xl w-full mx-auto p-6 lg:p-10 transition-all ${isSidebarHidden ? 'pl-20' : ''}`}>

             {/* 顶部面包屑导航 */}
             <nav className="flex items-center flex-wrap gap-2 text-sm text-slate-500 mb-8 font-medium">
               <Link href={`/repositories/${repoId}`} className="hover:text-blue-600 transition-colors flex items-center gap-1.5">
                 <Layers3 className="w-4 h-4"/> 根目录
               </Link>
               {breadcrumbs.map(crumb => (
                 <div key={crumb.id} className="flex items-center gap-2">
                   <ChevronRight className="w-4 h-4 text-slate-300" />
                   <Link href={buildQuery(query, { folder: crumb.id })} className="hover:text-blue-600 transition-colors">
                     {crumb.name}
                   </Link>
                 </div>
               ))}
             </nav>

             <div className="flex items-center justify-between mb-8">
               <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight">
                 {currentFolder ? currentFolder.name : "根目录内容"}
               </h1>
             </div>

             {/* 当前目录下的“子目录 + 笔记”内容网格 */}
              {errorMessage && !actionCreate && (
                <div className="mb-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}
               <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {displayedFolders.length === 0 && displayedNotes.length === 0 ? (
                   <div className="col-span-full py-24 text-center border-2 border-dashed border-slate-100 rounded-3xl bg-slate-50/50">
                     <FilePenLine className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                     <p className="text-slate-500 font-medium">该目录下暂无内容</p>
                     <p className="text-sm text-slate-400 mt-1 mb-4">可以先创建子目录或笔记</p>
                     <div className="flex items-center justify-center gap-2">
                       <Link
                         href={buildQuery(query, { create: 'folder', parent: currentFolderId, error: null })}
                         className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-all shadow-sm active:scale-95"
                       >
                         <FolderPlus className="w-4 h-4"/> 新建目录
                       </Link>
                       <Link
                         href={buildQuery(query, { create: 'note', parent: currentFolderId, error: null })}
                         className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-all shadow-sm active:scale-95"
                       >
                         <FilePlus className="w-4 h-4"/> 新建笔记
                       </Link>
                     </div>
                   </div>
                ) : (
                  <>
                    {displayedFolders.map((folder: any) => (
                      <Link key={`folder-${folder.id}`} href={buildQuery(query, { folder: folder.id })} className="block group">
                        <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md hover:border-blue-200 transition-all h-full flex flex-col">
                          <div className="flex items-start justify-between mb-4">
                            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl group-hover:scale-110 group-hover:bg-blue-100 transition-all">
                              <Folder className="w-5 h-5" />
                            </div>
                            <span className="text-[10px] font-bold px-2.5 py-1 bg-slate-100 text-slate-500 rounded-lg uppercase border border-slate-200">
                              权限 L{folder.clearance_level}
                            </span>
                          </div>
                          <h3 className="text-lg font-bold text-slate-900 mb-3 group-hover:text-blue-600 transition-colors line-clamp-2 leading-snug">
                            {folder.name}
                          </h3>
                          <p className="text-xs font-medium text-slate-400 mt-auto pt-4 border-t border-slate-50">
                            目录
                          </p>
                        </div>
                      </Link>
                    ))}

                    {displayedNotes.map((note: any) => (
                        <Link key={`note-${note.id}`} href={`/repositories/${repository.slug}/notes/${note.id}`} className="block group">
                          <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md hover:border-blue-200 transition-all h-full flex flex-col">
                              <div className="flex items-start justify-between mb-4">
                                <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl group-hover:scale-110 group-hover:bg-emerald-100 transition-all">
                                    <FileText className="w-5 h-5" />
                                </div>
                                <span className="text-[10px] font-bold px-2.5 py-1 bg-slate-100 text-slate-500 rounded-lg uppercase border border-slate-200">
                                    权限 L{note.clearance_level}
                                </span>
                              </div>
                              <h3 className="text-lg font-bold text-slate-900 mb-3 group-hover:text-blue-600 transition-colors line-clamp-2 leading-snug">
                                {note.title}
                              </h3>
                              <p className="text-xs font-medium text-slate-400 mt-auto pt-4 border-t border-slate-50">
                                最后更新 · {new Date(note.updated_at).toLocaleDateString()}
                              </p>
                          </div>
                        </Link>
                    ))}
                  </>
                )}
              </div>

           </div>
        </div>
      </div>

      {/* 浮动模态框 (通过 URL 参数触发，纯 Server 渲染) */}
      {actionCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <form action={actionCreate === 'folder' ? handleCreateFolder : handleCreateNote} className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                {actionCreate === 'folder' ? <FolderPlus className="w-5 h-5 text-blue-600"/> : <FilePlus className="w-5 h-5 text-emerald-600"/>}
                {actionCreate === 'folder' ? (actionParentId ? "新建子目录" : "新建根目录") : "新建速记"}
              </h3>
              <Link href={buildQuery(query, { create: null, parent: null, error: null })} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors">
                <X className="h-5 w-5" />
              </Link>
            </div>

            {/* 错误提示区块 */}
            {errorMessage && (
              <div className="mb-5 p-3.5 bg-red-50 text-red-600 text-sm font-medium rounded-xl border border-red-100 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <p>{errorMessage}</p>
              </div>
            )}

            <div className="space-y-5">
              {/* 隐藏字段：将父级ID传给 Action */}
              <input type="hidden" name={actionCreate === 'folder' ? 'parent_id' : 'folder_id'} value={actionParentId || ""} />

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  {actionCreate === 'folder' ? '目录名称' : '笔记标题'}
                </label>
                <input
                  name={actionCreate === 'folder' ? 'name' : 'title'}
                  required
                  autoFocus
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 placeholder:text-slate-300"
                  placeholder={actionCreate === 'folder' ? '例如：产品设计方案' : '例如：本周会议纪要'}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">设置访问密级 (受限于您的权限等级)</label>
                <select
                  name="min_clearance_level"
                  defaultValue={String(Math.min(userClearance, minAllowedClearance))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 bg-white"
                >
                  {clearanceOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-8 flex gap-3 justify-end">
              <Link href={buildQuery(query, { create: null, parent: null, error: null })} className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                取消
              </Link>
              <button type="submit" className={`px-6 py-2.5 text-sm font-semibold text-white rounded-xl transition-all shadow-sm active:scale-95 ${actionCreate === 'folder' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                确认创建
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}

// ==========================================
// 辅助组件：递归渲染每一层目录树 (Server Component)
// ==========================================
function FolderNode({
  node,
  notes,
  currentFolderId,
  query,
  buildQuery,
  repoId,
  onDeleteFolder,
  onDeleteNote,
}: {
  node: any;
  notes: any[];
  currentFolderId: number | null;
  query: any;
  buildQuery: Function;
  repoId: string;
  onDeleteFolder: (formData: FormData) => Promise<void>;
  onDeleteNote: (formData: FormData) => Promise<void>;
}) {
  const isSelected = currentFolderId === node.id;
  const childNotes = notes.filter((note: any) => note.folder_id === node.id);

  return (
    <details className="group/details" open>
      <summary className={`list-none flex items-center justify-between p-1.5 rounded-lg cursor-pointer transition-colors group/summary ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-200/50'}`}>
        <div className="flex items-center gap-1.5 flex-1 overflow-hidden">
           {/* 原生 details 箭头，使用 CSS 旋转动画 */}
           <div className="p-1 hover:bg-slate-200 rounded text-slate-400 transition-colors">
             <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform group-open/details:rotate-90" />
           </div>

           {/* 选中该目录的路由导航 */}
           <Link href={buildQuery(query, { folder: node.id })} className={`flex items-center gap-2 flex-1 truncate text-sm font-medium hover:underline ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>
             <Folder className={`h-4 w-4 shrink-0 ${isSelected ? 'text-blue-600 fill-blue-100' : 'text-slate-400'}`} />
             <span className="truncate">{node.name}</span>
           </Link>
        </div>

        {/* 具体目录上的创建快捷按钮 (悬停可见) */}
        <div className="opacity-0 group-hover/summary:opacity-100 flex items-center gap-0.5 px-1 transition-opacity">
           <form action={onDeleteFolder}>
             <input type="hidden" name="folder_id" value={node.id} />
             <button
               type="submit"
               className="p-1.5 hover:bg-red-50 rounded-md text-slate-400 hover:text-red-600 transition-colors"
               title="删除目录"
             >
               <Trash2 className="h-3.5 w-3.5"/>
             </button>
           </form>
           <Link href={buildQuery(query, { create: 'folder', parent: node.id, error: null })} className="p-1.5 hover:bg-slate-200 rounded-md text-slate-400 hover:text-blue-600 transition-colors" title="在此目录下新建子目录">
             <FolderPlus className="h-3.5 w-3.5"/>
           </Link>
           <Link href={buildQuery(query, { create: 'note', parent: node.id, error: null })} className="p-1.5 hover:bg-slate-200 rounded-md text-slate-400 hover:text-emerald-600 transition-colors" title="在此目录下新建笔记">
             <FilePlus className="h-3.5 w-3.5"/>
           </Link>
        </div>
      </summary>

      {/* 递归渲染子节点 */}
      {node.children && node.children.length > 0 && (
        <div className="pl-3 ml-2.5 mt-0.5 border-l border-slate-200 space-y-0.5">
           {node.children.map((child: any) => (
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
        </div>
      )}

      {childNotes.length ? (
        <div className="mt-1 space-y-0.5 pl-7">
          {childNotes.map((note: any) => (
            <div key={note.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 transition-colors hover:bg-white">
              <Link
                href={`/repositories/${repoId}/notes/${note.id}`}
                className="flex min-w-0 flex-1 items-center gap-2 hover:text-blue-700"
              >
                <FileText className="h-4 w-4 text-slate-400" />
                <span className="truncate">{note.title}</span>
              </Link>
              <form action={onDeleteNote}>
                <input type="hidden" name="note_id" value={note.id} />
                <button
                  type="submit"
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  title="删除笔记"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>
          ))}
        </div>
      ) : null}
    </details>
  );
}
