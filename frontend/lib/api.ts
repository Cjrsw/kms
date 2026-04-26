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
  cover_image_url: string;
  has_cover_image_upload: boolean;
  min_clearance_level: number;
  folder_count: number;
  note_count: number;
  latest_notes: Array<{
    id: number;
    title: string;
    folder_id: number | null;
    author_name: string;
    author_user_id: number | null;
    clearance_level: number;
    created_at: string;
    updated_at: string;
    attachment_count: number;
    can_delete: boolean;
  }>;
};

export type RepositoryDetail = {
  id: number;
  slug: string;
  name: string;
  description: string;
  cover_image_url: string;
  has_cover_image_upload: boolean;
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
    author_name: string;
    author_user_id: number | null;
    clearance_level: number;
    created_at: string;
    updated_at: string;
    attachment_count: number;
    can_delete: boolean;
  }>;
};

export type NoteCommentItem = {
  id: number;
  author_user_id: number | null;
  author_name: string;
  content: string;
  created_at: string;
  updated_at: string;
  can_delete: boolean;
};

export type NoteDetail = {
  id: number;
  repository_id: number;
  folder_id: number | null;
  title: string;
  author_name: string;
  author_user_id: number | null;
  content_json: string;
  content_text: string;
  clearance_level: number;
  updated_at: string;
  can_delete: boolean;
  like_count: number;
  liked_by_me: boolean;
  favorite_count: number;
  favorited_by_me: boolean;
  comments: NoteCommentItem[];
  attachments: AttachmentItem[];
};

export type FavoriteNoteItem = {
  note_id: number;
  repository_slug: string;
  repository_name: string;
  title: string;
  author_name: string;
  clearance_level: number;
  updated_at: string;
  href: string;
};

export type FavoriteNotesResponse = {
  total: number;
  items: FavoriteNoteItem[];
};

export type SearchResultItem = {
  note_id: number;
  repository_slug: string;
  repository_name: string;
  title: string;
  author_name: string;
  snippet: string;
  clearance_level: number;
  attachment_count: number;
  score: number;
  updated_at: string;
};

export type SearchResponse = {
  total: number;
  page: number;
  page_size: number;
  items: SearchResultItem[];
};

export type SearchQueryParams = {
  q?: string;
  repository_slug?: string;
  author?: string;
  file_type?: "all" | "note" | "pdf" | "docx";
  date_from?: string;
  date_to?: string;
  sort_by?: "relevance" | "updated_desc" | "updated_asc";
  page?: number;
  page_size?: number;
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
  conversation_id: number | null;
  conversation_title: string | null;
  model_id: number | null;
  model_name: string;
  recall_mode: string;
  citation_status: "ok" | "partial" | "missing";
  trace_id: string;
  question: string;
  answer: string;
  source_count: number;
  sources: QaSourceItem[];
};

export type QaFailure = {
  error_code: string;
  error_category: string;
  user_message: string;
  hint: string;
  trace_id: string;
  conversation_id: number | null;
  conversation_title: string | null;
};

export type QaResponseEnvelope = {
  status: "ok" | "failed";
  data: QaAnswer | null;
  error: QaFailure | null;
};

export type QaConversationMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  status: "success" | "failed";
  error_code: string;
  error_category: string;
  trace_id: string;
  model_name: string;
  citation_status: "ok" | "partial" | "missing" | "";
  source_count: number;
  sources: QaSourceItem[];
  created_at: string;
};

export type QaConversationSummary = {
  id: number;
  title: string;
  repository_slug: string | null;
  last_question: string;
  message_count: number;
  created_at: string;
  updated_at: string;
};

export type QaConversationListResponse = {
  total: number;
  items: QaConversationSummary[];
};

export type QaConversationDetail = QaConversationSummary & {
  messages: QaConversationMessage[];
};

export type QaModelOption = {
  id: number;
  name: string;
  model_name: string;
  provider: "openai_compatible";
};

export type QaAvailableModels = {
  models: QaModelOption[];
  user_default_model_id: number | null;
  system_default_model_id: number | null;
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
  cover_image_url: string;
  has_cover_image_upload: boolean;
  min_clearance_level: number;
  folder_count: number;
  note_count: number;
  folders: AdminFolderItem[];
  notes: AdminNoteItem[];
};

export type AdminRepositorySummaryItem = {
  id: number;
  slug: string;
  name: string;
  description: string;
  cover_image_url: string;
  has_cover_image_upload: boolean;
  min_clearance_level: number;
  folder_count: number;
  note_count: number;
  folders: AdminFolderItem[];
};

export type AdminContent = {
  repository_count: number;
  folder_count: number;
  note_count: number;
  repositories: AdminRepositoryItem[];
};

export type AdminRepositoriesResponse = {
  total: number;
  repositories: AdminRepositorySummaryItem[];
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

export type AdminAiModel = {
  id: number;
  name: string;
  provider: "openai_compatible";
  capability: "chat" | "embedding";
  api_base_url: string;
  model_name: string;
  api_key_masked: string;
  extra_headers: Record<string, string>;
  extra_body: Record<string, unknown>;
  max_tokens: number | null;
  timeout_seconds: number;
  description: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type AdminAiModelDefaults = {
  chat_default_model_id: number | null;
  embedding_default_model_id: number | null;
};

export type AdminAiModelsResponse = {
  total: number;
  defaults: AdminAiModelDefaults;
  models: AdminAiModel[];
};

export type AdminQaSystemPrompt = {
  system_prompt: string;
  updated_at: string | null;
};

export type QaAuditItem = {
  id: number;
  username: string;
  question: string;
  repository_slug: string;
  model_name: string;
  status: string;
  error_code: string;
  error_category: string;
  hint: string;
  trace_id: string;
  latency_ms: number;
  source_count: number;
  recall_mode: string;
  created_at: string;
};

export type QaAuditResponse = {
  total: number;
  logs: QaAuditItem[];
};

export type UserModelPreference = {
  chat_model_id: number | null;
  system_default_chat_model_id: number | null;
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

async function buildApiError(response: Response, fallback: string): Promise<Error> {
  try {
    const payload = (await response.json()) as { detail?: string | { message?: string } };
    const detail = payload?.detail;
    if (typeof detail === "string" && detail.trim()) {
      return new Error(detail);
    }
    if (detail && typeof detail === "object" && typeof detail.message === "string" && detail.message.trim()) {
      return new Error(detail.message);
    }
  } catch {
    // ignore parse failure and keep fallback
  }
  return new Error(fallback);
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
    throw await buildApiError(response, `API request failed: ${path}`);
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
    throw await buildApiError(response, `API request failed: ${method} ${path}`);
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
    throw await buildApiError(response, `API request failed: create note in ${repositorySlug}`);
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
    throw await buildApiError(response, `API request failed: delete note ${noteId}`);
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
    throw await buildApiError(response, `API request failed: create folder in ${repositorySlug}`);
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
    throw await buildApiError(response, `API request failed: delete folder ${folderId}`);
  }
}

export async function toggleNoteLike(repositorySlug: string, noteId: string): Promise<{ like_count: number; liked_by_me: boolean }> {
  return apiJsonRequest<{ like_count: number; liked_by_me: boolean }>(
    `/repositories/${repositorySlug}/notes/${noteId}/like`,
    "POST"
  );
}

export async function createNoteComment(
  repositorySlug: string,
  noteId: string,
  payload: { content: string }
): Promise<NoteCommentItem> {
  return apiJsonRequest<NoteCommentItem>(`/repositories/${repositorySlug}/notes/${noteId}/comments`, "POST", payload);
}

export async function deleteNoteComment(
  repositorySlug: string,
  noteId: string,
  commentId: number
): Promise<void> {
  await apiJsonRequest<void>(`/repositories/${repositorySlug}/notes/${noteId}/comments/${commentId}`, "DELETE");
}

export async function toggleNoteFavorite(
  repositorySlug: string,
  noteId: string
): Promise<{ favorite_count: number; favorited_by_me: boolean }> {
  return apiJsonRequest<{ favorite_count: number; favorited_by_me: boolean }>(
    `/repositories/${repositorySlug}/notes/${noteId}/favorite`,
    "POST"
  );
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
    throw await buildApiError(response, `API request failed: /repositories/${repositorySlug}/notes/${noteId}`);
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
    throw await buildApiError(response, `API request failed: /repositories/${repositorySlug}/notes/${noteId}/attachments`);
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
    throw await buildApiError(response, `API request failed: delete attachment ${attachmentId}`);
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
    throw await buildApiError(response, `API request failed: replace attachment ${attachmentId}`);
  }
  return (await response.json()) as AttachmentItem;
}

export async function getSearchResults(params: SearchQueryParams): Promise<SearchResponse> {
  const searchParams = new URLSearchParams();
  if (params.q && params.q.trim()) {
    searchParams.set("q", params.q.trim());
  }
  if (params.repository_slug) {
    searchParams.set("repository_slug", params.repository_slug);
  }
  if (params.author?.trim()) {
    searchParams.set("author", params.author.trim());
  }
  if (params.file_type && params.file_type !== "all") {
    searchParams.set("file_type", params.file_type);
  }
  if (params.date_from) {
    searchParams.set("date_from", params.date_from);
  }
  if (params.date_to) {
    searchParams.set("date_to", params.date_to);
  }
  if (params.sort_by) {
    searchParams.set("sort_by", params.sort_by);
  }
  if (typeof params.page === "number" && params.page > 0) {
    searchParams.set("page", String(params.page));
  }
  if (typeof params.page_size === "number" && params.page_size > 0) {
    searchParams.set("page_size", String(params.page_size));
  }
  return apiFetch<SearchResponse>(`/search?${searchParams.toString()}`);
}

export async function getSearchSuggestions(query: string, repositorySlug?: string): Promise<string[]> {
  const searchParams = new URLSearchParams({ q: query });
  if (repositorySlug) {
    searchParams.set("repository_slug", repositorySlug);
  }
  const response = await apiFetch<{ suggestions: string[] }>(`/search/suggest?${searchParams.toString()}`);
  return response.suggestions || [];
}

export async function getSearchAuthorSuggestions(query?: string, repositorySlug?: string): Promise<string[]> {
  const searchParams = new URLSearchParams();
  if (query?.trim()) {
    searchParams.set("q", query.trim());
  }
  if (repositorySlug) {
    searchParams.set("repository_slug", repositorySlug);
  }
  const suffix = searchParams.toString();
  const response = await apiFetch<{ suggestions: string[] }>(`/search/authors${suffix ? `?${suffix}` : ""}`);
  return response.suggestions || [];
}

export async function askQa(payload: {
  question: string;
  repository_slug?: string;
  model_id?: number | null;
}): Promise<QaResponseEnvelope> {
  return apiJsonRequest<QaResponseEnvelope>("/qa", "POST", {
    question: payload.question,
    repository_slug: payload.repository_slug ?? null,
    model_id: payload.model_id ?? null,
  });
}

export async function getQaAvailableModels(): Promise<QaAvailableModels> {
  return apiFetch<QaAvailableModels>("/qa/models");
}

export async function getAdminContent(): Promise<AdminContent> {
  return apiFetch<AdminContent>("/admin/content");
}

export async function getAdminRepositories(): Promise<AdminRepositoriesResponse> {
  return apiFetch<AdminRepositoriesResponse>("/admin/repositories");
}

export async function createRepository(payload: {
  slug: string;
  name: string;
  description: string;
  cover_image_url: string;
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
    cover_image_url: string;
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

export async function getAdminQaAudit(limit = 50): Promise<QaAuditResponse> {
  return apiFetch<QaAuditResponse>(`/admin/security/qa-audit?limit=${limit}`);
}

export async function getAdminAiModels(): Promise<AdminAiModelsResponse> {
  return apiFetch<AdminAiModelsResponse>("/admin/ai/models");
}

export async function createAdminAiModel(payload: {
  name: string;
  provider?: "openai_compatible";
  capability: "chat" | "embedding";
  api_base_url: string;
  model_name: string;
  api_key: string;
  extra_headers?: Record<string, string>;
  extra_body?: Record<string, unknown>;
  max_tokens?: number | null;
  timeout_seconds?: number;
  description?: string;
  is_enabled?: boolean;
}): Promise<AdminAiModel> {
  return apiJsonRequest<AdminAiModel>("/admin/ai/models", "POST", payload);
}

export async function updateAdminAiModel(
  modelId: number,
  payload: {
    name: string;
    provider?: "openai_compatible";
    capability: "chat" | "embedding";
    api_base_url: string;
    model_name: string;
    api_key?: string;
    extra_headers?: Record<string, string>;
    extra_body?: Record<string, unknown>;
    max_tokens?: number | null;
    timeout_seconds?: number;
    description?: string;
    is_enabled?: boolean;
  }
): Promise<AdminAiModel> {
  return apiJsonRequest<AdminAiModel>(`/admin/ai/models/${modelId}`, "PUT", payload);
}

export async function enableAdminAiModel(modelId: number): Promise<AdminAiModel> {
  return apiJsonRequest<AdminAiModel>(`/admin/ai/models/${modelId}/enable`, "POST");
}

export async function disableAdminAiModel(modelId: number): Promise<AdminAiModel> {
  return apiJsonRequest<AdminAiModel>(`/admin/ai/models/${modelId}/disable`, "POST");
}

export async function deleteAdminAiModel(modelId: number): Promise<void> {
  await apiJsonRequest<void>(`/admin/ai/models/${modelId}`, "DELETE");
}

export async function updateAdminAiDefaults(payload: {
  chat_default_model_id: number | null;
  embedding_default_model_id: number | null;
}): Promise<AdminAiModelDefaults> {
  return apiJsonRequest<AdminAiModelDefaults>("/admin/ai/defaults", "PUT", payload);
}

export async function getAdminQaSystemPrompt(): Promise<AdminQaSystemPrompt> {
  return apiFetch<AdminQaSystemPrompt>("/admin/ai/system-prompt");
}

export async function updateAdminQaSystemPrompt(payload: { system_prompt: string }): Promise<AdminQaSystemPrompt> {
  return apiJsonRequest<AdminQaSystemPrompt>("/admin/ai/system-prompt", "PUT", payload);
}

export async function updateMyProfile(payload: ProfilePayload): Promise<void> {
  await apiJsonRequest<void>("/auth/me/profile", "PUT", payload);
}

export async function uploadMyAvatar(file: File): Promise<void> {
  const token = await getRequiredAccessToken();
  const formData = new FormData();
  formData.set("file", file);
  const response = await fetch(`${API_BASE_URL}/auth/me/avatar`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
    cache: "no-store",
  });

  if (response.status === 401) {
    redirect("/logout");
  }
  if (!response.ok) {
    throw await buildApiError(response, "API request failed: upload avatar");
  }
}

export async function deleteMyAvatar(): Promise<void> {
  await apiJsonRequest<void>("/auth/me/avatar", "DELETE");
}

export async function getMyFavorites(): Promise<FavoriteNotesResponse> {
  return apiFetch<FavoriteNotesResponse>("/auth/me/favorites");
}

export async function changeMyPassword(payload: { current_password: string; new_password: string }): Promise<void> {
  await apiJsonRequest<void>("/auth/me/password", "POST", payload);
}

export async function getMyModelPreference(): Promise<UserModelPreference> {
  return apiFetch<UserModelPreference>("/auth/me/model-preference");
}

export async function updateMyModelPreference(payload: { chat_model_id: number | null }): Promise<UserModelPreference> {
  return apiJsonRequest<UserModelPreference>("/auth/me/model-preference", "PUT", payload);
}
