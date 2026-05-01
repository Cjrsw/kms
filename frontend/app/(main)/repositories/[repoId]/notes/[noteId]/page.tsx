import Link from "next/link";
import { FileText, MessageCircle, Pencil, ShieldAlert, Star, ThumbsUp, Trash2, AlertCircle } from "lucide-react";
import MarkdownIt from "markdown-it";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AttachmentActions } from "@/components/attachment-actions";
import { NoteIndexStatus } from "@/components/note-index-status";
import { createNoteComment, deleteNoteComment, getNote, getRepository, toggleNoteFavorite, toggleNoteLike } from "@/lib/api";

type NoteDetailPageProps = {
  params: Promise<{ repoId: string; noteId: string }>;
  searchParams?: Promise<{ error?: string }>;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const markdownParser = new MarkdownIt({
  breaks: false,
  html: false,
  linkify: true,
  typographer: true
});

const defaultLinkOpenRenderer =
  markdownParser.renderer.rules.link_open ||
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

markdownParser.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const href = token.attrGet("href") || "";

  if (/^https?:\/\//i.test(href)) {
    token.attrSet("target", "_blank");
    token.attrSet("rel", "noreferrer");
  }

  return defaultLinkOpenRenderer(tokens, idx, options, env, self);
};

const renderMarkdownToHtml = (markdown: string) => markdownParser.render(markdown.replace(/\r\n/g, "\n").trim());

const getTocItems = (markdown: string, fallbackTitle: string) => {
  const headings = Array.from(markdown.matchAll(/^(#{1,4})\s+(.+)$/gm)).map((match) =>
    match[2].replace(/[*_`]/g, "").trim()
  );
  return headings.length ? headings.slice(0, 8) : [fallbackTitle, "COMMENTS", "ATTACHMENTS"];
};

export default async function NoteDetailPage({ params, searchParams }: NoteDetailPageProps) {
  const { repoId, noteId } = await params;
  const query = (searchParams ? await searchParams : undefined) ?? {};

  let repository: Awaited<ReturnType<typeof getRepository>> | null = null;
  let note: Awaited<ReturnType<typeof getNote>> | null = null;

  try {
    repository = await getRepository(repoId);
    note = await getNote(repoId, noteId);
  } catch {
    notFound();
  }

  if (!repository || !note) {
    notFound();
  }

  const backHref = `/repositories/${repoId}${note.folder_id ? `?folder=${note.folder_id}` : ""}`;
  const markdownSource = (note.content_markdown || "").trim();
  let renderedHtml = markdownSource ? renderMarkdownToHtml(markdownSource) : "";

  if (!renderedHtml && note.content_text) {
    renderedHtml = note.content_text
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${escapeHtml(paragraph.trim())}</p>`)
      .join("\n");
  }

  const tocItems = getTocItems(markdownSource, note.title);
  const updatedLabel = new Date(note.updated_at).toLocaleString("zh-CN", { hour12: false });

  async function handleToggleLike() {
    "use server";
    try {
      await toggleNoteLike(repoId, noteId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "点赞失败";
      redirect(`/repositories/${repoId}/notes/${noteId}?error=${encodeURIComponent(msg)}`);
    }
    revalidatePath(`/repositories/${repoId}/notes/${noteId}`);
    redirect(`/repositories/${repoId}/notes/${noteId}`);
  }

  async function handleToggleFavorite() {
    "use server";
    try {
      await toggleNoteFavorite(repoId, noteId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "收藏失败";
      redirect(`/repositories/${repoId}/notes/${noteId}?error=${encodeURIComponent(msg)}`);
    }
    revalidatePath(`/repositories/${repoId}/notes/${noteId}`);
    revalidatePath("/profile");
    revalidatePath("/profile/favorites");
    redirect(`/repositories/${repoId}/notes/${noteId}`);
  }

  async function handleCreateComment(formData: FormData) {
    "use server";
    const content = String(formData.get("content") ?? "").trim();
    try {
      await createNoteComment(repoId, noteId, { content });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "评论失败";
      redirect(`/repositories/${repoId}/notes/${noteId}?error=${encodeURIComponent(msg)}`);
    }
    revalidatePath(`/repositories/${repoId}/notes/${noteId}`);
    redirect(`/repositories/${repoId}/notes/${noteId}`);
  }

  async function handleDeleteComment(formData: FormData) {
    "use server";
    const commentId = Number(String(formData.get("comment_id") ?? "").trim());
    if (!Number.isFinite(commentId)) {
      redirect(`/repositories/${repoId}/notes/${noteId}?error=${encodeURIComponent("缺少评论ID")}`);
    }
    try {
      await deleteNoteComment(repoId, noteId, commentId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "删除评论失败";
      redirect(`/repositories/${repoId}/notes/${noteId}?error=${encodeURIComponent(msg)}`);
    }
    revalidatePath(`/repositories/${repoId}/notes/${noteId}`);
    redirect(`/repositories/${repoId}/notes/${noteId}`);
  }

  return (
    <section className="kms-note-read-layout">
      <header className="kms-note-read-header">
        <Link href={backHref} className="kms-cyber-btn kms-note-back-btn">
          &lt; RETURN // 返回
        </Link>

        <div className="kms-note-title-area">
          <h1 className="kms-note-main-title">{note.title}</h1>
          <div className="kms-note-meta-line">
            AUTHOR: @{note.author_name || "系统"} | DATE: {updatedLabel} | REPO: [{repository.name}] | LEVEL: L
            {note.clearance_level}
          </div>
        </div>

        <div className="kms-note-header-actions">
          <form action={handleToggleLike}>
            <button className={`kms-note-action-btn ${note.liked_by_me ? "active" : ""}`} type="submit">
              <ThumbsUp className="h-3.5 w-3.5" />
              {note.like_count}
            </button>
          </form>
          <form action={handleToggleFavorite}>
            <button className={`kms-note-action-btn ${note.favorited_by_me ? "active" : ""}`} type="submit">
              <Star className="h-3.5 w-3.5" />
              {note.favorite_count}
            </button>
          </form>
          {note.can_edit ? (
            <Link href={`/repositories/${repoId}/notes/${noteId}/edit`} className="kms-note-action-btn">
              <Pencil className="h-3.5 w-3.5" />
              EDIT
            </Link>
          ) : null}
        </div>
      </header>

      {query.error ? (
        <div className="kms-note-error">
          <AlertCircle className="h-4 w-4" />
          <span>{query.error}</span>
        </div>
      ) : null}

      <NoteIndexStatus
        repoSlug={repoId}
        noteId={noteId}
        initialStatus={note.search_index_status}
        initialError={note.search_index_error}
        variant="banner"
      />

      <div className="kms-note-read-body">
        <main className="kms-note-content-area">
          {renderedHtml ? (
            <article className="kms-markdown-body" dangerouslySetInnerHTML={{ __html: renderedHtml }} />
          ) : (
            <div className="kms-note-empty-body">
              <FileText className="h-9 w-9" />
              <span>当前正文为空，请进入编辑页补充内容。</span>
            </div>
          )}

          <section className="kms-note-comments-section">
            <div className="kms-comments-divider">
              <div className="kms-div-line" />
              <div className="kms-div-text">COMMENTS // {note.comments.length}</div>
              <div className="kms-div-line" />
            </div>

            <form action={handleCreateComment} className="kms-comment-input-area">
              <textarea
                name="content"
                required
                maxLength={2000}
                className="kms-cyber-textarea"
                placeholder="写下你的评论。评论只用于互动展示，不进入搜索和问答。"
              />
              <button className="kms-cyber-btn primary kms-submit-comment-btn" type="submit">
                SUBMIT // 发表评论
              </button>
            </form>

            <div className="kms-comments-list">
              {note.comments.length === 0 ? (
                <div className="kms-comment-empty">暂无评论。</div>
              ) : (
                note.comments.map((comment) => (
                  <div key={comment.id} className="kms-comment-item">
                    <div className="kms-comment-meta">
                      @{comment.author_name} / {new Date(comment.created_at).toLocaleString("zh-CN", { hour12: false })}
                      {comment.updated_at !== comment.created_at ? " / EDITED" : ""}
                    </div>
                    <div className="kms-comment-text">{comment.content}</div>
                    {comment.can_delete ? (
                      <form action={handleDeleteComment}>
                        <input type="hidden" name="comment_id" value={comment.id} />
                        <button className="kms-reply-btn" type="submit" title="删除评论">
                          <Trash2 className="h-3.5 w-3.5" />
                          DEL
                        </button>
                      </form>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </section>
        </main>

        <aside className="kms-note-sidebar">
          <section className="kms-sidebar-block">
            <div className="kms-block-title">META DATA</div>
            <div className="kms-note-meta-card">
              <span>
                <ShieldAlert className="h-4 w-4" />
                CLEARANCE
              </span>
              <strong>L{note.clearance_level}</strong>
            </div>
            <div className="kms-note-meta-card">
              <span>NOTE ID</span>
              <strong>#{note.id}</strong>
            </div>
            <div className="kms-note-meta-card">
              <span>DISCUSS</span>
              <strong>{note.comments.length} 条</strong>
            </div>
            <div className="kms-note-meta-card">
              <span>INDEX</span>
              <strong>{note.search_index_status || "indexed"}</strong>
            </div>
          </section>

          <section className="kms-sidebar-block">
            <div className="kms-block-title">ATTACHMENTS // {note.attachments.length}</div>
            <div className="kms-attachment-list">
              {note.attachments.length === 0 ? (
                <div className="kms-note-side-empty">NO FILES</div>
              ) : (
                note.attachments.map((attachment) => (
                  <div key={attachment.id} className="kms-attachment-card">
                    <div className="kms-att-icon">{attachment.file_type.toUpperCase()}</div>
                    <div className="kms-att-name" title={attachment.file_name}>
                      {attachment.file_name}
                    </div>
                    <AttachmentActions
                      repoId={repoId}
                      noteId={noteId}
                      attachmentId={attachment.id}
                      fileType={attachment.file_type}
                    />
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="kms-sidebar-block">
            <div className="kms-block-title">ON THIS NOTE</div>
            <ul className="kms-toc-list">
              {tocItems.map((item, index) => (
                <li key={`${item}-${index}`} className={`kms-toc-item ${index === 0 ? "active" : ""}`}>
                  {item}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </section>
  );
}
