import "server-only";

import { redirect } from "next/navigation";

import { getSessionToken } from "./auth";
import { API_BASE_URL } from "./config";

export type AttachmentItem = {
  id: number;
  file_name: string;
  file_type: string;
  file_size: number;
  created_at: string;
  download_url: string | null;
};

export type RepositoryListItem = {
  id: number;
  slug: string;
  name: string;
  description: string;
  min_clearance_level: number;
  note_count: number;
};

export type RepositoryDetail = {
  id: number;
  slug: string;
  name: string;
  description: string;
  min_clearance_level: number;
  folders: Array<{
    id: number;
    name: string;
    parent_id: number | null;
    clearance_level: number;
  }>;
  notes: Array<{
    id: number;
    title: string;
    folder_id: number | null;
    clearance_level: number;
    updated_at: string;
    attachment_count: number;
  }>;
};

export type NoteDetail = {
  id: number;
  repository_id: number;
  folder_id: number | null;
  title: string;
  content_json: string;
  content_text: string;
  clearance_level: number;
  updated_at: string;
  attachments: AttachmentItem[];
};

export type SearchResultItem = {
  note_id: number;
  repository_slug: string;
  repository_name: string;
  title: string;
  snippet: string;
  clearance_level: number;
  attachment_count: number;
  score: number;
  updated_at: string;
};

export type QaSourceItem = {
  note_id: number;
  repository_slug: string;
  repository_name: string;
  title: string;
  snippet: string;
  clearance_level: number;
  attachment_count: number;
  updated_at: string;
};

export type QaAnswer = {
  question: string;
  answer: string;
  source_count: number;
  sources: QaSourceItem[];
};

export type AdminFolderItem = {
  id: number;
  repository_id: number;
  parent_id: number | null;
  name: string;
  clearance_level: number;
  note_count: number;
};

export type AdminNoteItem = {
  id: number;
  repository_id: number;
  folder_id: number | null;
  title: string;
  content_text: string;
  clearance_level: number;
  updated_at: string;
  attachment_count: number;
};

export type AdminRepositoryItem = {
  id: number;
  slug: string;
  name: string;
  description: string;
  min_clearance_level: number;
  folder_count: number;
  note_count: number;
  folders: AdminFolderItem[];
  notes: AdminNoteItem[];
};

export type AdminContent = {
  repository_count: number;
  folder_count: number;
  note_count: number;
  repositories: AdminRepositoryItem[];
};

export type AdminUserItem = {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  department_id: number | null;
  department_name: string | null;
  position: string | null;
  gender: string | null;
  bio: string | null;
  clearance_level: number;
  is_active: boolean;
  deactivated_at: string | null;
  role_code: string;
  need_password_change: boolean;
  created_at: string;
};

export type DepartmentItem = {
  id: number;
  code: string;
  name: string;
  parent_id: number | null;
  is_active: boolean;
  sort_order: number;
  member_count: number;
};

export type AdminUsersResponse = {
  total: number;
  users: AdminUserItem[];
  roles: string[];
  departments: DepartmentItem[];
};

export type AdminCorsOrigins = {
  origins: string[];
};

export type AdminAuthAuditItem = {
  id: number;
  username: string;
  event_type: string;
  status: string;
  ip_address: string;
  user_agent: string;
  detail: string;
  created_at: string;
};

export type AdminAuthAuditResponse = {
  total: number;
  logs: AdminAuthAuditItem[];
};

export type ProfilePayload = {
  email?: string | null;
  phone?: string | null;
  position?: string | null;
  gender?: string | null;
  bio?: string | null;
};

async function getRequiredAccessToken(): Promise<string> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/login");
  }

  return token;
}

async function apiFetch<T>(path: string): Promise<T> {
  const token = await getRequiredAccessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    cache: "no-store"
  });

  if (response.status === 401) {
    redirect("/logout");
  }

  if (!response.ok) {
    throw new Error(`API request failed: ${path}`);
  }

  return (await response.json()) as T;
}

async function apiJsonRequest<T>(path: string, method: "POST" | "PUT" | "DELETE", body?: unknown): Promise<T> {
  const token = await getRequiredAccessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store"
  });

  if (response.status === 401) {
    redirect("/logout");
  }

  if (!response.ok) {
    throw new Error(`API request failed: ${method} ${path}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function getRepositories(): Promise<RepositoryListItem[]> {
  return apiFetch<RepositoryListItem[]>("/repositories");
}

export async function getRepository(slug: string): Promise<RepositoryDetail> {
  return apiFetch<RepositoryDetail>(`/repositories/${slug}`);
}

export async function getNote(repositorySlug: string, noteId: string): Promise<NoteDetail> {
  return apiFetch<NoteDetail>(`/repositories/${repositorySlug}/notes/${noteId}`);
}

export async function createNoteUser(
  repositorySlug: string,
  payload: { title: string; content_text?: string; content_json?: string; folder_id?: number | null; min_clearance_level?: number }
): Promise<NoteDetail> {
  const token = await getRequiredAccessToken();
  const response = await fetch(`${API_BASE_URL}/repositories/${repositorySlug}/notes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (response.status === 401) {
    redirect("/logout");
  }
  if (!response.ok) {
    throw new Error(`API request failed: create note in ${repositorySlug}`);
  }
  return (await response.json()) as NoteDetail;
}

export async function deleteNoteUser(repositorySlug: string, noteId: number): Promise<void> {
  const token = await getRequiredAccessToken();
  const response = await fetch(`${API_BASE_URL}/repositories/${repositorySlug}/notes/${noteId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (response.status === 401) {
    redirect("/logout");
  }
  if (!response.ok) {
    throw new Error(`API request failed: delete note ${noteId}`);
  }
}

export async function createFolderUser(
  repositorySlug: string,
  payload: { name: string; parent_id?: number | null; min_clearance_level?: number }
): Promise<{ id: number; name: string; parent_id: number | null; clearance_level: number }> {
  const token = await getRequiredAccessToken();
  const response = await fetch(`${API_BASE_URL}/repositories/${repositorySlug}/folders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (response.status === 401) {
    redirect("/logout");
  }
  if (!response.ok) {
    throw new Error(`API request failed: create folder in ${repositorySlug}`);
  }
  return (await response.json()) as { id: number; name: string; parent_id: number | null; clearance_level: number };
}

export async function deleteFolderUser(repositorySlug: string, folderId: number): Promise<void> {
  const token = await getRequiredAccessToken();
  const response = await fetch(`${API_BASE_URL}/repositories/${repositorySlug}/folders/${folderId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (response.status === 401) {
    redirect("/logout");
  }
  if (!response.ok) {
    throw new Error(`API request failed: delete folder ${folderId}`);
  }
}

export async function updateNote(
  repositorySlug: string,
  noteId: string,
  payload: { title: string; content_text: string; content_json?: string }
): Promise<NoteDetail> {
  const token = await getRequiredAccessToken();
  const response = await fetch(`${API_BASE_URL}/repositories/${repositorySlug}/notes/${noteId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload),
    cache: "no-store"
  });

  if (response.status === 401) {
    redirect("/logout");
  }

  if (!response.ok) {
    throw new Error(`API request failed: /repositories/${repositorySlug}/notes/${noteId}`);
  }

  return (await response.json()) as NoteDetail;
}

export async function uploadNoteAttachment(
  repositorySlug: string,
  noteId: string,
  file: File
): Promise<AttachmentItem> {
  const token = await getRequiredAccessToken();
  const formData = new FormData();
  formData.set("file", file);

  const response = await fetch(`${API_BASE_URL}/repositories/${repositorySlug}/notes/${noteId}/attachments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: formData,
    cache: "no-store"
  });

  if (response.status === 401) {
    redirect("/logout");
  }

  if (!response.ok) {
    throw new Error(`API request failed: /repositories/${repositorySlug}/notes/${noteId}/attachments`);
  }

  return (await response.json()) as AttachmentItem;
}

export async function deleteNoteAttachment(
  repositorySlug: string,
  noteId: string,
  attachmentId: number
): Promise<void> {
  const token = await getRequiredAccessToken();
  const response = await fetch(
    `${API_BASE_URL}/repositories/${repositorySlug}/notes/${noteId}/attachments/${attachmentId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }
  );

  if (response.status === 401) {
    redirect("/logout");
  }
  if (!response.ok) {
    throw new Error(`API request failed: delete attachment ${attachmentId}`);
  }
}

export async function replaceNoteAttachment(
  repositorySlug: string,
  noteId: string,
  attachmentId: number,
  file: File
): Promise<AttachmentItem> {
  const token = await getRequiredAccessToken();
  const formData = new FormData();
  formData.set("file", file);

  const response = await fetch(
    `${API_BASE_URL}/repositories/${repositorySlug}/notes/${noteId}/attachments/${attachmentId}`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
      cache: "no-store",
    }
  );

  if (response.status === 401) {
    redirect("/logout");
  }
  if (!response.ok) {
    throw new Error(`API request failed: replace attachment ${attachmentId}`);
  }
  return (await response.json()) as AttachmentItem;
}

export async function getSearchResults(query: string): Promise<SearchResultItem[]> {
  const searchParams = new URLSearchParams({ q: query });
  return apiFetch<SearchResultItem[]>(`/search?${searchParams.toString()}`);
}

export async function getQaAnswer(query: string, repositorySlug?: string): Promise<QaAnswer> {
  const searchParams = new URLSearchParams({ q: query });
  if (repositorySlug) {
    searchParams.set("repository_slug", repositorySlug);
  }
  return apiFetch<QaAnswer>(`/qa?${searchParams.toString()}`);
}

export async function getAdminContent(): Promise<AdminContent> {
  return apiFetch<AdminContent>("/admin/content");
}

export async function createRepository(payload: {
  slug: string;
  name: string;
  description: string;
  min_clearance_level: number;
}): Promise<AdminRepositoryItem> {
  return apiJsonRequest<AdminRepositoryItem>("/admin/repositories", "POST", payload);
}

export async function updateRepositoryAdmin(
  repositoryId: string,
  payload: {
    slug: string;
    name: string;
    description: string;
    min_clearance_level: number;
  }
): Promise<AdminRepositoryItem> {
  return apiJsonRequest<AdminRepositoryItem>(`/admin/repositories/${repositoryId}`, "PUT", payload);
}

export async function deleteRepositoryAdmin(repositoryId: string): Promise<void> {
  await apiJsonRequest<void>(`/admin/repositories/${repositoryId}`, "DELETE");
}

export async function createFolderAdmin(payload: {
  repository_id: number;
  parent_id?: number | null;
  name: string;
  min_clearance_level: number;
}): Promise<AdminFolderItem> {
  return apiJsonRequest<AdminFolderItem>("/admin/folders", "POST", payload);
}

export async function updateFolderAdmin(
  folderId: string,
  payload: {
    parent_id?: number | null;
    name: string;
    min_clearance_level: number;
  }
): Promise<AdminFolderItem> {
  return apiJsonRequest<AdminFolderItem>(`/admin/folders/${folderId}`, "PUT", payload);
}

export async function deleteFolderAdmin(folderId: string): Promise<void> {
  await apiJsonRequest<void>(`/admin/folders/${folderId}`, "DELETE");
}

export async function createNoteAdmin(payload: {
  repository_id: number;
  folder_id?: number | null;
  title: string;
  content_text: string;
  min_clearance_level: number;
}): Promise<AdminNoteItem> {
  return apiJsonRequest<AdminNoteItem>("/admin/notes", "POST", payload);
}

export async function updateNoteAdmin(
  noteId: string,
  payload: {
    folder_id?: number | null;
    title: string;
    content_text: string;
    min_clearance_level: number;
  }
): Promise<AdminNoteItem> {
  return apiJsonRequest<AdminNoteItem>(`/admin/notes/${noteId}`, "PUT", payload);
}

export async function deleteNoteAdmin(noteId: string): Promise<void> {
  await apiJsonRequest<void>(`/admin/notes/${noteId}`, "DELETE");
}

export async function getAdminUsers(filters?: {
  department_id?: number | null;
  keyword?: string;
  account_status?: "all" | "active" | "inactive";
}): Promise<AdminUsersResponse> {
  const params = new URLSearchParams();
  if (typeof filters?.department_id === "number") {
    params.set("department_id", String(filters.department_id));
  }
  if (filters?.keyword?.trim()) {
    params.set("keyword", filters.keyword.trim());
  }
  if (filters?.account_status) {
    params.set("account_status", filters.account_status);
  }
  const query = params.toString();
  return apiFetch<AdminUsersResponse>(`/admin/users${query ? `?${query}` : ""}`);
}

export async function createUserAdmin(payload: {
  full_name: string;
  department_id?: number | null;
  position?: string | null;
  gender?: string | null;
  clearance_level: number;
}): Promise<AdminUserItem> {
  return apiJsonRequest<AdminUserItem>("/admin/users", "POST", payload);
}

export async function updateUserAdmin(
  userId: string,
  payload: {
    full_name: string;
    department_id?: number | null;
    position?: string | null;
    gender?: string | null;
    phone?: string | null;
    email?: string | null;
    bio?: string | null;
    clearance_level: number;
    is_active: boolean;
  }
): Promise<AdminUserItem> {
  return apiJsonRequest<AdminUserItem>(`/admin/users/${userId}`, "PUT", payload);
}

export async function deleteUserAdmin(userId: string): Promise<void> {
  await apiJsonRequest<void>(`/admin/users/${userId}`, "DELETE");
}

export async function createDepartmentAdmin(payload: {
  code: string;
  name: string;
  parent_id?: number | null;
  sort_order?: number;
  is_active?: boolean;
}): Promise<DepartmentItem> {
  return apiJsonRequest<DepartmentItem>("/admin/departments", "POST", payload);
}

export async function updateDepartmentAdmin(
  departmentId: string,
  payload: {
    code: string;
    name: string;
    parent_id?: number | null;
    sort_order?: number;
    is_active?: boolean;
  }
): Promise<DepartmentItem> {
  return apiJsonRequest<DepartmentItem>(`/admin/departments/${departmentId}`, "PUT", payload);
}

export async function getAdminCorsOrigins(): Promise<AdminCorsOrigins> {
  return apiFetch<AdminCorsOrigins>("/admin/security/cors-origins");
}

export async function updateAdminCorsOrigins(origins: string[]): Promise<AdminCorsOrigins> {
  return apiJsonRequest<AdminCorsOrigins>("/admin/security/cors-origins", "PUT", { origins });
}

export async function getAdminAuthAudit(limit = 50): Promise<AdminAuthAuditResponse> {
  return apiFetch<AdminAuthAuditResponse>(`/admin/security/auth-audit?limit=${limit}`);
}

export async function updateMyProfile(payload: ProfilePayload): Promise<void> {
  await apiJsonRequest<void>("/auth/me/profile", "PUT", payload);
}

export async function changeMyPassword(payload: { current_password: string; new_password: string }): Promise<void> {
  await apiJsonRequest<void>("/auth/me/password", "POST", payload);
}
