import type { ReactNode } from "react";
import Link from "next/link";
import { BookOpen, FilePenLine, FolderOpen, Layers3, Trash2, UserCog, Users } from "lucide-react";
import { redirect } from "next/navigation";

import { AppShell } from "../../components/app-shell";
import { getAdminContent } from "../../lib/api";
import { hasAnyRole, requireCurrentUser } from "../../lib/auth";
import {
  createFolderAction,
  createNoteAction,
  createRepositoryAction,
  createUserAction,
  deleteFolderAction,
  deleteNoteAction,
  deleteRepositoryAction,
  deleteUserAction,
  updateFolderAction,
  updateNoteAction,
  updateRepositoryAction,
  updateUserAction
} from "./actions";

const levelOptions = [1, 2, 3, 4];

export default async function AdminPage() {
  const currentUser = await requireCurrentUser();
  if (!hasAnyRole(currentUser, ["platform_admin", "repo_admin"])) {
    redirect("/repositories");
  }

  const adminContent = await getAdminContent();

  return (
    <AppShell
      contentClassName="p-8"
      currentUser={currentUser}
      title="后台系统"
      description="后台页现在已经接入真实的仓库、目录、笔记、用户、角色和密级管理能力，管理员可以直接在这里维护主数据。"
    >
      <div className="space-y-8">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="用户数量" value={String(adminContent.user_count)} icon={<Users className="h-4 w-4" />} />
          <MetricCard label="知识仓库" value={String(adminContent.repository_count)} icon={<BookOpen className="h-4 w-4" />} />
          <MetricCard label="目录数量" value={String(adminContent.folder_count)} icon={<FolderOpen className="h-4 w-4" />} />
          <MetricCard label="笔记数量" value={String(adminContent.note_count)} icon={<FilePenLine className="h-4 w-4" />} />
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-800">
            <UserCog className="h-4 w-4 text-blue-600" />
            <span>用户与权限</span>
          </div>

          <form action={createUserAction} className="grid gap-4 rounded-2xl border border-dashed border-blue-200 bg-blue-50/40 p-4 lg:grid-cols-4">
            <input
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              name="username"
              placeholder="账号"
              required
            />
            <input
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              name="full_name"
              placeholder="姓名"
              required
            />
            <input
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              name="email"
              placeholder="邮箱"
              required
              type="email"
            />
            <input
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              name="password"
              placeholder="初始密码，至少 6 位"
              required
              type="password"
            />
            <select
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              defaultValue="2"
              name="clearance_level"
            >
              {levelOptions.map((level) => (
                <option key={level} value={level}>
                  密级 L{level}
                </option>
              ))}
            </select>
            <select
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              defaultValue="true"
              name="is_active"
            >
              <option value="true">启用</option>
              <option value="false">停用</option>
            </select>
            <fieldset className="rounded-xl border border-gray-300 bg-white px-3 py-3 lg:col-span-2">
              <legend className="px-1 text-xs font-semibold text-gray-500">角色分配</legend>
              <div className="mt-2 flex flex-wrap gap-3">
                {adminContent.available_roles.map((role) => (
                  <label key={role.code} className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input className="rounded border-gray-300 text-blue-600" name="role_codes" type="checkbox" value={role.code} />
                    <span>{role.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="lg:col-span-4">
              <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700" type="submit">
                创建用户
              </button>
            </div>
          </form>

          <div className="mt-4 space-y-3">
            {adminContent.users.map((user) => (
              <form key={user.id} action={updateUserAction} className="grid gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <input name="user_id" type="hidden" value={user.id} />
                <div className="grid gap-3 lg:grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)_180px]">
                  <input
                    className="rounded-xl border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-500 outline-none"
                    defaultValue={user.username}
                    disabled
                  />
                  <input
                    className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    defaultValue={user.full_name}
                    name="full_name"
                    required
                  />
                  <input
                    className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    defaultValue={user.email}
                    name="email"
                    required
                    type="email"
                  />
                  <input
                    className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    name="password"
                    placeholder="留空则不修改密码"
                    type="password"
                  />
                </div>

                <div className="grid gap-3 lg:grid-cols-[180px_180px_minmax(0,1fr)]">
                  <select
                    className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    defaultValue={String(user.clearance_level)}
                    name="clearance_level"
                  >
                    {levelOptions.map((level) => (
                      <option key={level} value={level}>
                        密级 L{level}
                      </option>
                    ))}
                  </select>
                  <select
                    className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    defaultValue={user.is_active ? "true" : "false"}
                    name="is_active"
                  >
                    <option value="true">启用</option>
                    <option value="false">停用</option>
                  </select>
                  <fieldset className="rounded-xl border border-gray-300 bg-white px-3 py-3">
                    <legend className="px-1 text-xs font-semibold text-gray-500">角色分配</legend>
                    <div className="mt-2 flex flex-wrap gap-3">
                      {adminContent.available_roles.map((role) => (
                        <label key={role.code} className="inline-flex items-center gap-2 text-sm text-gray-700">
                          <input
                            className="rounded border-gray-300 text-blue-600"
                            defaultChecked={user.role_codes.includes(role.code)}
                            name="role_codes"
                            type="checkbox"
                            value={role.code}
                          />
                          <span>{role.name}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-gray-500">
                    账号 `{user.username}` · 当前角色 {user.role_codes.length > 0 ? user.role_codes.join(", ") : "未分配"}
                  </p>
                  <div className="flex gap-2">
                    <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700" type="submit">
                      保存用户
                    </button>
                    <button
                      className="inline-flex items-center rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                      formAction={deleteUserAction}
                      type="submit"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      删除用户
                    </button>
                  </div>
                </div>
              </form>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-800">
            <Layers3 className="h-4 w-4 text-blue-600" />
            <span>新建知识仓库</span>
          </div>
          <form action={createRepositoryAction} className="grid gap-4 lg:grid-cols-[160px_minmax(0,1fr)_160px_160px]">
            <input className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" name="slug" placeholder="slug，例如 hr" required />
            <input className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" name="name" placeholder="仓库名称" required />
            <select className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" defaultValue="2" name="min_clearance_level">
              {levelOptions.map((level) => (
                <option key={level} value={level}>
                  L{level}
                </option>
              ))}
            </select>
            <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700" type="submit">
              创建仓库
            </button>
            <textarea className="min-h-[88px] rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 lg:col-span-4" name="description" placeholder="仓库说明" />
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
                <input className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" defaultValue={repository.slug} name="slug" required />
                <input className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" defaultValue={repository.name} name="name" required />
                <select className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" defaultValue={String(repository.min_clearance_level)} name="min_clearance_level">
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
                  <button className="inline-flex items-center rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50" formAction={deleteRepositoryAction} type="submit">
                    <Trash2 className="mr-2 h-4 w-4" />
                    删除仓库
                  </button>
                </div>
                <textarea className="min-h-[88px] rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 lg:col-span-4" defaultValue={repository.description} name="description" />
              </form>

              <div className="mt-6 grid gap-6 xl:grid-cols-2">
                <section className="space-y-4 rounded-2xl border border-gray-200 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <FolderOpen className="h-4 w-4 text-blue-600" />
                    <span>目录管理</span>
                  </div>

                  <form action={createFolderAction} className="grid gap-3 rounded-2xl border border-dashed border-blue-200 bg-blue-50/40 p-4">
                    <input name="repository_id" type="hidden" value={repository.id} />
                    <input className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" name="name" placeholder="新目录名称" required />
                    <select className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" defaultValue="" name="parent_id">
                      <option value="">顶级目录</option>
                      {repository.folders.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {folder.name}
                        </option>
                      ))}
                    </select>
                    <select className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" defaultValue={String(repository.min_clearance_level)} name="min_clearance_level">
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
                          <input className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" defaultValue={folder.name} name="name" required />
                          <div className="grid gap-3 md:grid-cols-2">
                            <select className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" defaultValue={folder.parent_id ? String(folder.parent_id) : ""} name="parent_id">
                              <option value="">顶级目录</option>
                              {repository.folders
                                .filter((candidate) => candidate.id !== folder.id)
                                .map((candidate) => (
                                  <option key={candidate.id} value={candidate.id}>
                                    {candidate.name}
                                  </option>
                                ))}
                            </select>
                            <select className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" defaultValue={String(folder.clearance_level)} name="min_clearance_level">
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
                              <button className="inline-flex items-center rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50" formAction={deleteFolderAction} type="submit">
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
                    <input className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" name="title" placeholder="新笔记标题" required />
                    <div className="grid gap-3 md:grid-cols-2">
                      <select className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" defaultValue="" name="folder_id">
                        <option value="">不放入目录</option>
                        {repository.folders.map((folder) => (
                          <option key={folder.id} value={folder.id}>
                            {folder.name}
                          </option>
                        ))}
                      </select>
                      <select className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" defaultValue={String(repository.min_clearance_level)} name="min_clearance_level">
                        {levelOptions.map((level) => (
                          <option key={level} value={level}>
                            L{level}
                          </option>
                        ))}
                      </select>
                    </div>
                    <textarea className="min-h-[100px] rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" name="content_text" placeholder="输入笔记正文" required />
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
                          <input className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" defaultValue={note.title} name="title" required />
                          <div className="grid gap-3 md:grid-cols-2">
                            <select className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" defaultValue={note.folder_id ? String(note.folder_id) : ""} name="folder_id">
                              <option value="">不放入目录</option>
                              {repository.folders.map((folder) => (
                                <option key={folder.id} value={folder.id}>
                                  {folder.name}
                                </option>
                              ))}
                            </select>
                            <select className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" defaultValue={String(note.clearance_level)} name="min_clearance_level">
                              {levelOptions.map((level) => (
                                <option key={level} value={level}>
                                  L{level}
                                </option>
                              ))}
                            </select>
                          </div>
                          <textarea className="min-h-[120px] rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" defaultValue={note.content_text} name="content_text" required />
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-xs text-gray-500">附件 {note.attachment_count} 个 · 最近更新 {new Date(note.updated_at).toLocaleString("zh-CN")}</p>
                            <div className="flex flex-wrap gap-2">
                              <Link className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-white" href={`/repositories/${repository.slug}/notes/${note.id}`}>
                                查看详情
                              </Link>
                              <Link className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-white" href={`/repositories/${repository.slug}/notes/${note.id}/edit`}>
                                进入编辑器
                              </Link>
                              <button className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700" type="submit">
                                保存笔记
                              </button>
                              <button className="inline-flex items-center rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50" formAction={deleteNoteAction} type="submit">
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
