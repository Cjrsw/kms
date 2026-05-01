"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { PasswordVisibilityInput } from "@/components/password-visibility-input";
import { ProfileAvatarInput } from "@/components/profile-avatar-input";
import type { FavoriteNotesResponse, MyNotesResponse } from "@/lib/api";
import type { AuthUser } from "@/lib/auth";

import { changePasswordAction, updateProfileAction } from "./actions";

type ProfileMode = "edit" | "password" | null;

type ProfileWorkspaceProps = {
  currentUser: AuthUser;
  favorites: FavoriteNotesResponse;
  myNotes: MyNotesResponse;
  initialMode: ProfileMode;
  profileSaved: boolean;
  passwordError: string | null;
};

export function ProfileWorkspace({
  currentUser,
  favorites,
  myNotes,
  initialMode,
  profileSaved,
  passwordError,
}: ProfileWorkspaceProps) {
  const [mode, setMode] = useState<ProfileMode>(initialMode);
  const avatarUrl = currentUser.has_avatar_upload ? "/api/profile/avatar" : null;
  const isAdmin = currentUser.role_codes.includes("admin");
  const roleLabel = isAdmin ? "管理员" : "员工";
  const displayName = currentUser.full_name || currentUser.username;
  const avatarInitial = displayName.trim().slice(0, 1).toUpperCase() || "K";
  const viewportClassName = [
    "kms-profile-right-viewport",
    mode === "edit" ? "is-editing" : "",
    mode === "password" ? "is-pwding" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="kms-profile-page">
      {currentUser.need_password_change ? (
        <div className="kms-profile-alert">
          <ShieldAlert className="h-4 w-4" />
          <span>当前仍在使用默认密码，请尽快前往“密码修改”完成更新。</span>
        </div>
      ) : null}
      {profileSaved ? <div className="kms-profile-alert success">个人资料已保存。</div> : null}
      {passwordError ? <div className="kms-profile-alert danger">{resolvePasswordError(passwordError)}</div> : null}

      <div className="kms-profile-layout">
        <aside className="kms-profile-sidebar custom-scrollbar">
          <section className="kms-profile-card">
            <div className="kms-profile-header">
              <div className="kms-profile-avatar-box">
                {avatarUrl ? (
                  <img alt={`${displayName} avatar`} className="kms-profile-avatar-image" src={avatarUrl} />
                ) : (
                  <span className="kms-profile-avatar-id">{avatarInitial}</span>
                )}
                <span className="kms-profile-avatar-grid" aria-hidden="true" />
              </div>
              <div className="kms-profile-title">
                <span className="kms-profile-label">USER PROFILE</span>
                <h1>{displayName}</h1>
                <p>
                  {currentUser.position || roleLabel} // L{currentUser.clearance_level}
                </p>
              </div>
            </div>

            <div className="kms-profile-info-matrix">
              <ProfileInfo label="ACC // 账号" value={currentUser.username} />
              <ProfileInfo label="DEPT // 部门" value={currentUser.department_name || "未设置"} />
              <ProfileInfo label="TEL // 电话" value={currentUser.phone || "未设置"} />
              <ProfileInfo label="MAIL // 邮箱" value={currentUser.email || "未设置"} />
              <ProfileInfo label="SEX // 性别" value={currentUser.gender || "未设置"} />
            </div>

            <div className="kms-profile-bio">
              <span>BIO // 个人简介</span>
              <p>{currentUser.bio || "暂无个人简介。"}</p>
            </div>

            <nav className="kms-profile-actions" aria-label="个人中心操作">
              <button className="kms-profile-action-link" onClick={() => setMode("edit")} type="button">
                <span>信息编辑</span>
                <small>// EDIT</small>
              </button>
              <button className="kms-profile-action-link" onClick={() => setMode("password")} type="button">
                <span>密码修改</span>
                <small>// PWD</small>
              </button>
              {isAdmin ? (
                <Link href="/admin" className="kms-profile-action-link">
                  <span>后台入口</span>
                  <small>// ADMIN</small>
                </Link>
              ) : null}
              <a href="/logout" className="kms-profile-action-link">
                <span>退出登录</span>
                <small>// LOGOUT</small>
              </a>
            </nav>
          </section>
        </aside>

        <section className={viewportClassName}>
          <div className="kms-profile-main">
            <ProfileListSection
              count={myNotes.total}
              emptyTitle="NO NOTES"
              emptyText="暂无由你创建的笔记。"
              icon="■"
              items={myNotes.items.map((item) => ({
                key: `note-${item.note_id}`,
                href: item.href,
                actionHref: `${item.href}/edit`,
                actionLabel: "编辑",
                title: item.title,
                tag: item.repository_name,
                date: formatDate(item.updated_at, "更新于"),
              }))}
              title="NOTES // 我的笔记"
            />

            <ProfileListSection
              count={favorites.total}
              emptyTitle="NO FAVORITES"
              emptyText="暂无收藏笔记。进入笔记详情后可通过收藏按钮加入这里。"
              icon="★"
              items={favorites.items.map((item) => ({
                key: `favorite-${item.note_id}`,
                href: item.href,
                actionHref: item.href,
                actionLabel: "查看",
                title: item.title,
                tag: item.repository_name,
                date: formatDate(item.updated_at, "收藏于"),
              }))}
              title="FAVORITES // 我的收藏"
            />
          </div>

          <ProfileEditView currentUser={currentUser} avatarUrl={avatarUrl} onCancel={() => setMode(null)} />
          <ProfilePasswordView onCancel={() => setMode(null)} />
        </section>
      </div>
    </div>
  );
}

function ProfileInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="kms-profile-info-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ProfileListSection({
  title,
  count,
  icon,
  emptyTitle,
  emptyText,
  items,
}: {
  title: string;
  count: number;
  icon: string;
  emptyTitle: string;
  emptyText: string;
  items: Array<{
    key: string;
    href: string;
    actionHref: string;
    actionLabel: string;
    title: string;
    tag: string;
    date: string;
  }>;
}) {
  return (
    <section className="kms-profile-section">
      <div className="kms-profile-section-header">
        <span className="kms-profile-section-title">{title}</span>
        <span className="kms-profile-section-line" />
        <span className="kms-profile-section-count">Total: {count}</span>
      </div>

      {items.length === 0 ? (
        <div className="kms-profile-empty">
          <span>{emptyTitle}</span>
          <p>{emptyText}</p>
        </div>
      ) : (
        <ul className="kms-profile-list custom-scrollbar">
          {items.slice(0, 10).map((item, index) => (
            <li key={item.key} className="kms-profile-list-item" style={{ "--item-index": index } as CSSProperties}>
              <div className="kms-profile-list-icon">{icon}</div>
              <div className="kms-profile-list-content">
                <Link href={item.href}>
                  <h3>{item.title}</h3>
                </Link>
                <div className="kms-profile-list-meta">
                  <span>{item.tag}</span>
                  <time>{item.date}</time>
                </div>
              </div>
              <Link href={item.actionHref} className="kms-profile-list-action">
                {item.actionLabel}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ProfileEditView({
  currentUser,
  avatarUrl,
  onCancel,
}: {
  currentUser: AuthUser;
  avatarUrl: string | null;
  onCancel: () => void;
}) {
  return (
    <div className="kms-profile-edit-view">
      <div className="kms-profile-edit-header">
        <span>PROFILE CONFIG // 个人信息配置</span>
        <div />
      </div>

      <form action={updateProfileAction} className="kms-profile-edit-form">
        <ProfileAvatarInput defaultPreviewUrl={avatarUrl} displayName={currentUser.full_name || currentUser.username} />

        <div className="kms-profile-edit-grid">
          <ProfileReadonlyField label="姓名 (NAME)" value={currentUser.full_name} />
          <ProfileReadonlyField label="账号 (ACCOUNT)" value={currentUser.username} />
          <ProfileReadonlyField label="部门 (DEPT)" value={currentUser.department_name || "未设置"} />
          <ProfileReadonlyField label="密级 (LEVEL)" value={`L${currentUser.clearance_level}`} />
          <ProfileInput label="电话 (TEL)" name="phone" defaultValue={currentUser.phone || ""} placeholder="请输入联系电话" />
          <ProfileInput label="邮箱 (MAIL)" name="email" defaultValue={currentUser.email || ""} placeholder="请输入邮箱" />
          <ProfileInput label="职位 (POSITION)" name="position" defaultValue={currentUser.position || ""} placeholder="请输入职位" />
          <label className="kms-profile-edit-field">
            <span>性别 (SEX)</span>
            <select name="gender" defaultValue={currentUser.gender || ""}>
              <option value="">未设置</option>
              <option value="男">男</option>
              <option value="女">女</option>
            </select>
          </label>
        </div>

        <label className="kms-profile-edit-field">
          <span>个人简介 (BIO)</span>
          <textarea name="bio" defaultValue={currentUser.bio || ""} rows={4} placeholder="请输入个人简介" />
        </label>

        <div className="kms-profile-edit-actions">
          <button className="kms-cyber-btn ghost" onClick={onCancel} type="button">
            CANCEL // 取消
          </button>
          <button className="kms-cyber-btn" type="submit">
            SAVE // 保存
          </button>
        </div>
      </form>
    </div>
  );
}

function ProfilePasswordView({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="kms-profile-pwd-view kms-profile-edit-view">
      <div className="kms-profile-edit-header">
        <span>SECURITY CONFIG // 安全配置</span>
        <div />
      </div>

      <form action={changePasswordAction} className="kms-profile-edit-form">
        <ProfileInput label="当前密码 (OLD PASSWORD)" name="current_password" placeholder="输入当前密码" type="password" />
        <ProfileInput label="新密码 (NEW PASSWORD)" name="new_password" placeholder="新密码需包含字母和数字" type="password" />
        <ProfileInput label="确认密码 (CONFIRM PASSWORD)" name="confirm_password" placeholder="再次输入新密码" type="password" />

        <div className="kms-profile-edit-actions">
          <button className="kms-cyber-btn ghost" onClick={onCancel} type="button">
            CANCEL // 取消
          </button>
          <button className="kms-cyber-btn" type="submit">
            UPDATE // 更新
          </button>
        </div>
      </form>
    </div>
  );
}

function ProfileReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="kms-profile-edit-field">
      <span>{label}</span>
      <input value={value} disabled readOnly />
    </label>
  );
}

function ProfileInput({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder: string;
  type?: string;
}) {
  const passwordAutoComplete =
    name === "current_password" ? "current-password" : name.includes("password") ? "new-password" : undefined;

  return (
    <label className="kms-profile-edit-field">
      <span>{label}</span>
      {type === "password" ? (
        <PasswordVisibilityInput autoComplete={passwordAutoComplete} name={name} placeholder={placeholder} />
      ) : (
        <input name={name} defaultValue={defaultValue} placeholder={placeholder} type={type} />
      )}
    </label>
  );
}

function formatDate(value: string, prefix: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return `${prefix} --`;
  }
  return `${prefix} ${date.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" })}`;
}

function resolvePasswordError(code: string) {
  if (code === "required") {
    return "请填写当前密码、新密码和确认密码。";
  }
  if (code === "rule") {
    return "新密码必须为 6-64 位且包含字母和数字。";
  }
  if (code === "confirm") {
    return "两次输入的新密码不一致。";
  }
  if (code === "incorrect") {
    return "当前密码不正确。";
  }
  return "密码修改失败，请检查输入后重试。";
}
