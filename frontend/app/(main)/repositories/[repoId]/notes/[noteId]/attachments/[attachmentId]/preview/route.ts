import { getSessionToken } from "@/lib/auth";
import { API_BASE_URL } from "@/lib/config";
import MarkdownIt from "markdown-it";

const markdownParser = new MarkdownIt({
  breaks: false,
  html: false,
  linkify: true,
  typographer: true,
});

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ repoId: string; noteId: string; attachmentId: string }>;
  },
): Promise<Response> {
  const { repoId, noteId, attachmentId } = await params;
  const token = await getSessionToken();
  if (!token) {
    return new Response(null, {
      status: 307,
      headers: {
        Location: "/login",
      },
    });
  }

  const response = await fetch(
    `${API_BASE_URL}/repositories/${repoId}/notes/${noteId}/attachments/${attachmentId}/preview`,
    {
      headers: { Authorization: `Bearer ${token}` },
      redirect: "manual",
    }
  );

  if (response.status === 401) {
    return new Response(null, {
      status: 307,
      headers: {
        Location: "/logout",
      },
    });
  }
  if (response.status === 403) {
    return new Response(null, {
      status: 307,
      headers: {
        Location: "/login",
      },
    });
  }

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (location) {
      return new Response(null, {
        status: 307,
        headers: {
          Location: location,
        },
      });
    }
  }

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  if (!response.ok) {
    const detail = await readBackendError(response);
    return new Response(
      renderPreviewPage({
        title: "Preview Error",
        body: `<section class="preview-error"><h1>附件预览失败</h1><p>${escapeHtml(detail)}</p></section>`,
      }),
      {
        status: response.status,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  }

  if (contentType.includes("text/markdown")) {
    const markdown = await response.text();
    return new Response(
      renderPreviewPage({
        title: "Markdown Preview",
        body: `<article class="markdown-body">${markdownParser.render(normalizeMarkdownForPreview(markdown))}</article>`,
      }),
      {
        status: response.status,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  }

  if (contentType.includes("text/plain")) {
    const text = await response.text();
    return new Response(
      renderPreviewPage({
        title: "Text Preview",
        body: `<pre class="text-body">${escapeHtml(text)}</pre>`,
      }),
      {
        status: response.status,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  }

  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      ...(response.headers.get("content-disposition")
        ? { "Content-Disposition": response.headers.get("content-disposition") as string }
        : {}),
    },
  });
}

async function readBackendError(response: Response): Promise<string> {
  const fallback = `后端返回 ${response.status}，请确认附件仍存在且当前账号有权限访问。`;
  try {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const payload = await response.json();
      const detail = typeof payload?.detail === "string" ? payload.detail : JSON.stringify(payload?.detail ?? payload);
      return detail || fallback;
    }
    const text = (await response.text()).trim();
    return text || fallback;
  } catch {
    return fallback;
  }
}

function normalizeMarkdownForPreview(markdown: string): string {
  let inFence = false;
  const normalized = stripOuterMarkdownFence(markdown)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  return normalized
    .split("\n")
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;

      // Markdown requires a space after heading markers, but Chinese docs often omit it.
      return line.replace(/^(\s{0,3}#{1,6})(?!#)(\S.*)$/, "$1 $2");
    })
    .join("\n");
}

function stripOuterMarkdownFence(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const firstContentIndex = lines.findIndex((line) => line.trim() !== "");
  if (firstContentIndex < 0) return normalized;

  let lastContentIndex = lines.length - 1;
  while (lastContentIndex >= 0 && lines[lastContentIndex].trim() === "") {
    lastContentIndex -= 1;
  }

  const firstLine = lines[firstContentIndex].trim();
  const lastLine = lines[lastContentIndex]?.trim() ?? "";
  const bodyLines = lines.slice(firstContentIndex + 1, lastContentIndex);
  const body = bodyLines.join("\n");
  const isPlainOrMarkdownFence = /^```(?:markdown|md)?$/i.test(firstLine);
  const hasMarkdownHeading = /^#{1,6}\S|^#{1,6}\s+/m.test(body);

  if (isPlainOrMarkdownFence && lastLine === "```" && hasMarkdownHeading) {
    return [...lines.slice(0, firstContentIndex), ...bodyLines, ...lines.slice(lastContentIndex + 1)].join("\n");
  }

  return normalized;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderPreviewPage({ title, body }: { title: string; body: string }): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #08090d;
        --panel: rgba(12, 14, 20, 0.92);
        --line: rgba(255, 255, 255, 0.16);
        --text: rgba(255, 255, 255, 0.88);
        --muted: rgba(255, 255, 255, 0.58);
        --accent: #d82633;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at 20% 10%, rgba(216, 38, 51, 0.12), transparent 28rem),
          linear-gradient(135deg, rgba(255,255,255,0.04) 0 12%, transparent 12% 100%),
          var(--bg);
        color: var(--text);
        font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
      }
      main {
        width: min(980px, calc(100vw - 48px));
        margin: 40px auto;
        border: 1px solid var(--line);
        background: var(--panel);
        padding: 32px;
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.36);
      }
      .markdown-body { line-height: 1.85; font-size: 16px; }
      .markdown-body h1, .markdown-body h2, .markdown-body h3 {
        margin: 1.3em 0 0.55em;
        color: #fff;
        letter-spacing: 0.03em;
      }
      .markdown-body h1 { border-bottom: 2px solid var(--accent); padding-bottom: 10px; }
      .markdown-body a { color: #ff5a66; }
      .markdown-body code {
        border: 1px solid var(--line);
        background: rgba(255,255,255,0.07);
        padding: 0.1em 0.35em;
      }
      .markdown-body pre, .text-body {
        overflow: auto;
        border: 1px solid var(--line);
        background: rgba(0, 0, 0, 0.32);
        padding: 18px;
        white-space: pre-wrap;
        line-height: 1.7;
      }
      .markdown-body blockquote {
        margin-left: 0;
        border-left: 3px solid var(--accent);
        padding-left: 16px;
        color: var(--muted);
      }
      .markdown-body table {
        width: 100%;
        border-collapse: collapse;
      }
      .markdown-body th, .markdown-body td {
        border: 1px solid var(--line);
        padding: 8px 10px;
      }
      .preview-error h1 {
        margin: 0 0 14px;
        color: #fff;
        letter-spacing: 0.05em;
      }
      .preview-error p {
        margin: 0;
        color: var(--muted);
        line-height: 1.8;
      }
    </style>
  </head>
  <body>
    <main>${body}</main>
  </body>
</html>`;
}
