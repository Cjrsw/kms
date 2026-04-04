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

export type SearchFilters = {
  repositorySlug?: string;
  fileType?: string;
  updatedWithin?: string;
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
  mode: "empty" | "no_results" | "fallback" | "llm";
  model: string | null;
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

export type AdminRoleItem = {
  code: string;
  name: string;
};

export type AdminUserItem = {
  id: number;
  username: string;
  full_name: string;
  email: string;
  clearance_level: number;
  is_active: boolean;
  role_codes: string[];
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
  user_count: number;
  repository_count: number;
  folder_count: number;
  note_count: number;
  users: AdminUserItem[];
  available_roles: AdminRoleItem[];
  repositories: AdminRepositoryItem[];
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
    redirect("/login");
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
    redirect("/login");
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

export async function updateNote(
  repositorySlug: string,
  noteId: string,
  payload: { title: string; content_text: string; content_json?: string }
): Promise<NoteDetail> {
  return apiJsonRequest<NoteDetail>(`/repositories/${repositorySlug}/notes/${noteId}`, "PUT", payload);
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
    redirect("/login");
  }

  if (!response.ok) {
    throw new Error(`API request failed: /repositories/${repositorySlug}/notes/${noteId}/attachments`);
  }

  return (await response.json()) as AttachmentItem;
}

export async function replaceNoteAttachment(
  repositorySlug: string,
  noteId: string,
  attachmentId: string,
  file: File
): Promise<AttachmentItem> {
  const token = await getRequiredAccessToken();
  const formData = new FormData();
  formData.set("file", file);

  const response = await fetch(
    `${API_BASE_URL}/repositories/${repositorySlug}/notes/${noteId}/attachments/${attachmentId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData,
      cache: "no-store"
    }
  );

  if (response.status === 401) {
    redirect("/login");
  }

  if (!response.ok) {
    throw new Error(`API request failed: /repositories/${repositorySlug}/notes/${noteId}/attachments/${attachmentId}`);
  }

  return (await response.json()) as AttachmentItem;
}

export async function deleteNoteAttachment(
  repositorySlug: string,
  noteId: string,
  attachmentId: string
): Promise<void> {
  await apiJsonRequest<void>(`/repositories/${repositorySlug}/notes/${noteId}/attachments/${attachmentId}`, "DELETE");
}

export async function getSearchResults(query: string, filters: SearchFilters = {}): Promise<SearchResultItem[]> {
  const searchParams = new URLSearchParams({ q: query });
  if (filters.repositorySlug) {
    searchParams.set("repository_slug", filters.repositorySlug);
  }
  if (filters.fileType) {
    searchParams.set("file_type", filters.fileType);
  }
  if (filters.updatedWithin) {
    searchParams.set("updated_within", filters.updatedWithin);
  }
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

export async function createUserAdmin(payload: {
  username: string;
  full_name: string;
  email: string;
  password: string;
  clearance_level: number;
  is_active: boolean;
  role_codes: string[];
}): Promise<AdminUserItem> {
  return apiJsonRequest<AdminUserItem>("/admin/users", "POST", payload);
}

export async function updateUserAdmin(
  userId: string,
  payload: {
    full_name: string;
    email: string;
    password?: string;
    clearance_level: number;
    is_active: boolean;
    role_codes: string[];
  }
): Promise<AdminUserItem> {
  return apiJsonRequest<AdminUserItem>(`/admin/users/${userId}`, "PUT", payload);
}

export async function deleteUserAdmin(userId: string): Promise<void> {
  await apiJsonRequest<void>(`/admin/users/${userId}`, "DELETE");
}
