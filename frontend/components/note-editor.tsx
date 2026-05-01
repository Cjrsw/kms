"use client";

import { useEffect, useState, useRef } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { EditorContent, useEditor } from "@tiptap/react";
import LinkExtension from "@tiptap/extension-link";
import StarterKit from "@tiptap/starter-kit";
import MarkdownIt from "markdown-it";
import {
  Bold,
  Heading1,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Save,
  X,
  Paperclip,
  Loader2
} from "lucide-react";
import { clsx } from "clsx";

type NoteEditorProps = {
  cancelHref: string;
  initialTitle: string;
  initialContentMarkdown: string;
  initialContentJson: string;
  initialContentText: string;
  initialEditableByClearance?: boolean;
  canChangeEditPolicy?: boolean;
  action: (formData: FormData) => void;
  uploadAction?: (formData: FormData) => Promise<void> | void;
};

const markdownParser = new MarkdownIt({
  breaks: false,
  html: false,
  linkify: true,
  typographer: true
});

type TiptapJsonNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, any>;
  marks?: Array<{ type?: string; attrs?: Record<string, any> }>;
  content?: TiptapJsonNode[];
};

function createFallbackDocument(contentText: string) {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: contentText ? [{ type: "text", text: contentText }] : []
      }
    ]
  };
}

function parseJsonDocument(contentJson: string) {
  try {
    const parsed = JSON.parse(contentJson);
    if (parsed && typeof parsed === "object" && parsed.type === "doc") {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

function parseInitialDocument(contentMarkdown: string, contentJson: string, contentText: string) {
  const jsonDocument = parseJsonDocument(contentJson);
  if (jsonDocument) {
    return jsonDocument;
  }

  if (contentMarkdown.trim()) {
    return markdownParser.render(contentMarkdown);
  }
  return createFallbackDocument(contentText);
}

function getEditorPlainText(editor: { getText: (options?: { blockSeparator?: string }) => string }) {
  return editor.getText({ blockSeparator: "\n" }).trim();
}

function applyMarkdownMarks(value: string, marks?: TiptapJsonNode["marks"]) {
  if (!marks?.length) {
    return value;
  }

  return marks.reduce((current, mark) => {
    switch (mark.type) {
      case "bold":
        return `**${current}**`;
      case "italic":
        return `*${current}*`;
      case "strike":
        return `~~${current}~~`;
      case "code":
        return `\`${current.replace(/`/g, "\\`")}\``;
      case "link": {
        const href = String(mark.attrs?.href || "").trim();
        return href ? `[${current}](${href})` : current;
      }
      default:
        return current;
    }
  }, value);
}

function serializeInlineNodes(nodes: TiptapJsonNode[] = []): string {
  return nodes
    .map((node) => {
      if (node.type === "text") {
        return applyMarkdownMarks(node.text || "", node.marks);
      }
      if (node.type === "hardBreak") {
        return "  \n";
      }
      return serializeInlineNodes(node.content);
    })
    .join("");
}

function indentMarkdown(value: string) {
  return value
    .split("\n")
    .map((line) => (line ? `  ${line}` : line))
    .join("\n");
}

function serializeListItem(node: TiptapJsonNode): string {
  const blocks = node.content || [];
  const [firstBlock, ...restBlocks] = blocks;
  const firstLine =
    firstBlock?.type === "paragraph"
      ? serializeInlineNodes(firstBlock.content)
      : serializeMarkdownNode(firstBlock || { type: "paragraph" });
  const rest = restBlocks.map((block) => indentMarkdown(serializeMarkdownNode(block))).filter(Boolean);

  return [firstLine, ...rest].filter(Boolean).join("\n");
}

function serializeMarkdownNode(node: TiptapJsonNode): string {
  switch (node.type) {
    case "doc":
      return (node.content || []).map(serializeMarkdownNode).filter(Boolean).join("\n\n");
    case "paragraph":
      return serializeInlineNodes(node.content);
    case "heading": {
      const level = Math.min(Math.max(Number(node.attrs?.level || 1), 1), 6);
      return `${"#".repeat(level)} ${serializeInlineNodes(node.content)}`.trim();
    }
    case "bulletList":
      return (node.content || [])
        .map((item) => `- ${serializeListItem(item).replace(/\n/g, "\n  ")}`)
        .join("\n");
    case "orderedList": {
      const start = Number(node.attrs?.start || 1);
      return (node.content || [])
        .map((item, index) => `${start + index}. ${serializeListItem(item).replace(/\n/g, "\n   ")}`)
        .join("\n");
    }
    case "listItem":
      return serializeListItem(node);
    case "blockquote":
      return serializeMarkdownNode({ type: "doc", content: node.content })
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    case "codeBlock": {
      const language = String(node.attrs?.language || "").trim();
      return `\`\`\`${language}\n${serializeInlineNodes(node.content)}\n\`\`\``;
    }
    case "horizontalRule":
      return "---";
    case "hardBreak":
      return "  \n";
    case "text":
      return applyMarkdownMarks(node.text || "", node.marks);
    default:
      return serializeInlineNodes(node.content);
  }
}

function getEditorMarkdown(editor: { getJSON: () => TiptapJsonNode }) {
  return serializeMarkdownNode(editor.getJSON()).trim();
}

export function NoteEditor({
  cancelHref,
  initialTitle,
  initialContentMarkdown,
  initialContentJson,
  initialContentText,
  initialEditableByClearance = false,
  canChangeEditPolicy = false,
  action,
  uploadAction
}: NoteEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [contentText, setContentText] = useState(initialContentText);
  const [contentMarkdown, setContentMarkdown] = useState(initialContentMarkdown || initialContentText);
  const [contentJson, setContentJson] = useState(
    initialContentJson || JSON.stringify(createFallbackDocument(initialContentText))
  );
  const [isUploading, setIsUploading] = useState(false);
  const [editableByClearance, setEditableByClearance] = useState(initialEditableByClearance);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contentTextInputRef = useRef<HTMLInputElement>(null);
  const contentMarkdownInputRef = useRef<HTMLInputElement>(null);
  const contentJsonInputRef = useRef<HTMLInputElement>(null);

  function syncEditorFields(currentEditor: {
    getText: (options?: { blockSeparator?: string }) => string;
    getJSON: () => TiptapJsonNode;
  }) {
    const nextContentText = getEditorPlainText(currentEditor);
    const nextContentMarkdown = getEditorMarkdown(currentEditor) || nextContentText;
    const nextContentJson = JSON.stringify(currentEditor.getJSON());

    setContentText(nextContentText);
    setContentMarkdown(nextContentMarkdown);
    setContentJson(nextContentJson);

    if (contentTextInputRef.current) {
      contentTextInputRef.current.value = nextContentText;
    }
    if (contentMarkdownInputRef.current) {
      contentMarkdownInputRef.current.value = nextContentMarkdown;
    }
    if (contentJsonInputRef.current) {
      contentJsonInputRef.current.value = nextContentJson;
    }
  }

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      LinkExtension.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https"
      })
    ],
    content: parseInitialDocument(initialContentMarkdown, initialContentJson, initialContentText),
    editorProps: {
      attributes: {
        class: "kms-editor-prosemirror"
      }
    },
    onUpdate: ({ editor: currentEditor }) => {
      syncEditorFields(currentEditor);
    }
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    syncEditorFields(editor);
  }, [editor]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !uploadAction) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("attachment", file);
      await uploadAction(formData);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  const toolbarItems = [
    {
      label: "加粗",
      icon: Bold,
      active: editor?.isActive("bold") ?? false,
      onClick: () => editor?.chain().focus().toggleBold().run()
    },
    {
      label: "斜体",
      icon: Italic,
      active: editor?.isActive("italic") ?? false,
      onClick: () => editor?.chain().focus().toggleItalic().run()
    },
    {
      label: "一级标题",
      icon: Heading1,
      active: editor?.isActive("heading", { level: 1 }) ?? false,
      onClick: () => editor?.chain().focus().toggleHeading({ level: 1 }).run()
    },
    {
      label: "二级标题",
      icon: Heading2,
      active: editor?.isActive("heading", { level: 2 }) ?? false,
      onClick: () => editor?.chain().focus().toggleHeading({ level: 2 }).run()
    },
    {
      label: "无序列表",
      icon: List,
      active: editor?.isActive("bulletList") ?? false,
      onClick: () => editor?.chain().focus().toggleBulletList().run()
    },
    {
      label: "有序列表",
      icon: ListOrdered,
      active: editor?.isActive("orderedList") ?? false,
      onClick: () => editor?.chain().focus().toggleOrderedList().run()
    },
    {
      label: "引用块",
      icon: Quote,
      active: editor?.isActive("blockquote") ?? false,
      onClick: () => editor?.chain().focus().toggleBlockquote().run()
    },
    {
      label: "清除链接",
      icon: Link2,
      active: editor?.isActive("link") ?? false,
      onClick: () => editor?.chain().focus().unsetLink().run()
    }
  ];

  return (
    <div className="kms-note-editor">
      <form
        action={action}
        className="kms-note-editor-form"
        id="note-form"
        onSubmit={() => {
          if (editor) {
            syncEditorFields(editor);
          }
        }}
      >
        <section className="kms-editor-title-panel">
          <div className="kms-editor-panel-head">
            <label htmlFor="title">TITLE // 笔记标题</label>
            <div className="kms-editor-title-right">
              <span>{title.length} CHARS</span>
              {canChangeEditPolicy ? (
                <button
                  type="button"
                  className={clsx(
                    "kms-editor-policy-btn",
                    editableByClearance ? "open" : "private"
                  )}
                  onClick={() => setEditableByClearance(!editableByClearance)}
                  title={editableByClearance ? "公开编辑" : "私人编辑"}
                >
                  {editableByClearance ? "公开" : "私人"}
                </button>
              ) : null}
            </div>
          </div>
          <div className="kms-editor-title-body">
            <input
              className="kms-editor-title-input"
              id="title"
              name="title"
              placeholder="请输入笔记标题..."
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </div>
        </section>

        <input type="hidden" name="editable_by_clearance" value={editableByClearance ? "true" : "false"} />

        <section className="kms-editor-body-panel">
          <div className="kms-editor-toolbar">
            <label>CONTENT // 正文编辑区</label>

            <div className="kms-editor-tools">
              {toolbarItems.map((item) => {
                const Icon = item.icon;

                return (
                  <button
                    key={item.label}
                    className={clsx(
                      "kms-editor-tool-btn",
                      item.active && "active"
                    )}
                    onClick={item.onClick}
                    type="button"
                    title={item.label}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                );
              })}

              {uploadAction && (
                <>
                  <div className="kms-editor-tool-divider" />
                  <button
                    className="kms-editor-upload-btn"
                    type="button"
                    title="上传附件"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Paperclip className="h-4 w-4" />
                    )}
                    <span className="text-xs font-semibold">{isUploading ? '上传中...' : '上传附件'}</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={handleFileChange}
                  />
                </>
              )}
            </div>
          </div>

          <div className="kms-editor-canvas">
            <EditorContent editor={editor} />
          </div>

          <input ref={contentTextInputRef} name="content_text" type="hidden" value={contentText} readOnly />
          <input ref={contentMarkdownInputRef} name="content_markdown" type="hidden" value={contentMarkdown} readOnly />
          <input ref={contentJsonInputRef} name="content_json" type="hidden" value={contentJson} readOnly />

          <div className="kms-editor-footer">
            <p>
              保存时同步写入 Markdown、结构化 JSON 与纯文本；搜索和问答使用纯文本/Markdown 内容，评论不会进入检索。
            </p>
            <div className="kms-editor-footer-actions">
              <Link
                href={cancelHref}
                className="kms-cyber-btn kms-editor-cancel-btn"
              >
                <X className="h-4 w-4" />
                CANCEL
              </Link>
              <SaveNoteButton />
            </div>
          </div>
        </section>
      </form>
    </div>
  );
}

function SaveNoteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="kms-cyber-btn primary kms-editor-save-btn"
      type="submit"
      form="note-form"
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      {pending ? "上传中..." : "SAVE // 保存"}
    </button>
  );
}
