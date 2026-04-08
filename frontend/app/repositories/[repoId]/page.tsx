import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  Folder, FileText, ChevronRight, FolderPlus,
  FilePlus, Layers3, X, FilePenLine, PanelLeftClose, PanelLeft, AlertCircle
} from "lucide-react";

import { AppShell } from "../../../components/app-shell";
import { requireCurrentUser } from "../../../lib/auth";

// 环境变量获取，确保服务端获取数据能命中正确的后端地址
const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value || cookieStore.get("access_token")?.value || "";

  // 动态计算用户能够分配的最高密级（不能超过自己的密级）
  const userClearance = currentUser?.clearance_level || 1;
  const clearanceOptions = [
    { value: 1, label: "L1 (基础与公开)" },
    { value: 2, label: "L2 (内部资料)" },
    { value: 3, label: "L3 (核心机密)" },
    { value: 4, label: "L4 (绝密档案)" }
  ].filter(opt => opt.value <= userClearance);

  // 获取当前仓库、目录和笔记内容
  const res = await fetch(`${API_URL}/api/v1/repositories/${repoId}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store'
  });

  if (!res.ok) {
     redirect("/repositories");
  }

  const repository = await res.json();
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

  // 过滤出要在右侧展示的笔记
  const displayedNotes = notes.filter((n: any) =>
     currentFolderId ? n.folder_id === currentFolderId : !n.folder_id
  );

  // 面包屑导航生成器
  const getBreadcrumbs = (folderId: number | null) => {
     if (!folderId) return [];
     const crumbs = [];
     let curr = folders.find((f: any) => f.id === folderId);
     while (curr) {
        crumbs.unshift(curr);
        curr = folders.find((f: any) => f.id === curr.parent_id);
     }
     return crumbs;
  };
  const breadcrumbs = getBreadcrumbs(currentFolderId);

  // ==========================================
  // Inline Server Actions (处理表单提交)
  // ==========================================

  async function handleCreateFolder(formData: FormData) {
    "use server";
    const cStore = await cookies();
    const t = cStore.get("token")?.value || cStore.get("access_token")?.value || "";
    const pId = formData.get("parent_id") as string;

    const response = await fetch(`${API_URL}/api/v1/repositories/${repoId}/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify({
        name: formData.get("name"),
        parent_id: pId ? Number(pId) : null,
        min_clearance_level: Number(formData.get("min_clearance_level") || 1)
      })
    });

    if (!response.ok) {
       const err = await response.json().catch(()=>({}));
       const msg = err.detail || "操作失败，可能由于权限不足";
       // 创建失败，将错误信息通过 URL 抛回给模态框显示
       redirect(`/repositories/${repoId}?create=folder&parent=${pId || ''}&error=${encodeURIComponent(msg)}`);
    }

    revalidatePath(`/repositories/${repoId}`);
    redirect(`/repositories/${repoId}${currentFolderId ? `?folder=${currentFolderId}` : ''}`);
  }

  async function handleCreateNote(formData: FormData) {
    "use server";
    const cStore = await cookies();
    const t = cStore.get("token")?.value || cStore.get("access_token")?.value || "";
    const fId = formData.get("folder_id") as string;

    const response = await fetch(`${API_URL}/api/v1/repositories/${repoId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify({
        title: formData.get("title"),
        folder_id: fId ? Number(fId) : null,
        content_text: "",
        min_clearance_level: Number(formData.get("min_clearance_level") || 1)
      })
    });

    if (!response.ok) {
       const err = await response.json().catch(()=>({}));
       const msg = err.detail || "操作失败，可能由于权限不足";
       // 创建失败，将错误信息通过 URL 抛回给模态框显示
       redirect(`/repositories/${repoId}?create=note&parent=${fId || ''}&error=${encodeURIComponent(msg)}`);
    }

    revalidatePath(`/repositories/${repoId}`);
    redirect(`/repositories/${repoId}${currentFolderId ? `?folder=${currentFolderId}` : ''}`);
  }

  return (
    <AppShell contentClassName="p-0 bg-white" currentUser={currentUser} title={repository.name}>
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
                <Link href={buildQuery(query, { create: 'note', parent: null, error: null })} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors" title="新建根笔记">
                  <FilePlus className="w-4 h-4"/>
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
                    <FolderNode key={node.id} node={node} currentFolderId={currentFolderId} query={query} buildQuery={buildQuery} />
                  ))}
                </div>
              )}
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
               <Link
                 href={buildQuery(query, { create: 'note', parent: currentFolderId, error: null })}
                 className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 font-semibold rounded-xl hover:bg-emerald-100 transition-all active:scale-95"
               >
                 <FilePlus className="w-4 h-4" /> 快速笔记
               </Link>
             </div>

             {/* 笔记网格 */}
             <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
               {displayedNotes.length === 0 ? (
                  <div className="col-span-full py-24 text-center border-2 border-dashed border-slate-100 rounded-3xl bg-slate-50/50">
                    <FilePenLine className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                    <p className="text-slate-500 font-medium">该区域暂无笔记</p>
                    <p className="text-sm text-slate-400 mt-1 mb-4">记录灵感，沉淀知识，从这里开始</p>
                    <Link
                      href={buildQuery(query, { create: 'note', parent: currentFolderId, error: null })}
                      className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-all shadow-sm active:scale-95"
                    >
                      <FilePlus className="w-4 h-4"/> 立即创建一篇
                    </Link>
                  </div>
               ) : (
                  displayedNotes.map((note: any) => (
                     <Link key={note.id} href={`/repositories/${repository.slug}/notes/${note.id}`} className="block group">
                        <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md hover:border-blue-200 transition-all h-full flex flex-col">
                           <div className="flex items-start justify-between mb-4">
                              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl group-hover:scale-110 group-hover:bg-emerald-100 transition-all">
                                 <FileText className="w-5 h-5" />
                              </div>
                              <span className="text-[10px] font-bold px-2.5 py-1 bg-slate-100 text-slate-500 rounded-lg uppercase border border-slate-200">
                                 权限 L{note.min_clearance_level}
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
                  ))
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
                <select name="min_clearance_level" defaultValue="1" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 bg-white">
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
function FolderNode({ node, currentFolderId, query, buildQuery }: { node: any, currentFolderId: number | null, query: any, buildQuery: Function }) {
  const isSelected = currentFolderId === node.id;

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
              <FolderNode key={child.id} node={child} currentFolderId={currentFolderId} query={query} buildQuery={buildQuery} />
           ))}
        </div>
      )}
    </details>
  );
}