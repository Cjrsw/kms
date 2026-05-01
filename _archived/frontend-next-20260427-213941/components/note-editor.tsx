"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { EditorContent, useEditor } from "@tiptap/react";
import LinkExtension from "@tiptap/extension-link";
import StarterKit from "@tiptap/starter-kit";
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
  initialContentJson: string;
  initialContentText: string;
  action: (formData: FormData) => void;
  uploadAction?: (formData: FormData) => Promise<void> | void;
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

function parseInitialDocument(contentJson: string, contentText: string) {
  try {
    const parsed = JSON.parse(contentJson);
    if (parsed && typeof parsed === "object" && parsed.type === "doc") {
      return parsed;
    }
  } catch {
    return createFallbackDocument(contentText);
  }

  return createFallbackDocument(contentText);
}

function getEditorPlainText(editor: { getText: (options?: { blockSeparator?: string }) => string }) {
  return editor.getText({ blockSeparator: "\n" }).trim();
}

export function NoteEditor({
  cancelHref,
  initialTitle,
  initialContentJson,
  initialContentText,
  action,
  uploadAction
}: NoteEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [contentText, setContentText] = useState(initialContentText);
  const [contentJson, setContentJson] = useState(
    initialContentJson || JSON.stringify(createFallbackDocument(initialContentText))
  );
  const [isUploading, setIsUploading] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    content: parseInitialDocument(initialContentJson, initialContentText),
    editorProps: {
      attributes: {
        class:
          "min-h-[460px] px-8 py-6 text-lg leading-loose text-slate-800 outline-none ProseMirror prose prose-slate prose-lg max-w-none focus:outline-none"
      }
    },
    onUpdate: ({ editor: currentEditor }) => {
      setContentText(getEditorPlainText(currentEditor));
      setContentJson(JSON.stringify(currentEditor.getJSON()));
    }
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    setContentText(getEditorPlainText(editor));
    setContentJson(JSON.stringify(editor.getJSON()));
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
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in">
      <form action={action} className="space-y-6" id="note-form">
        <section className="rounded-3xl border border-slate-200/60 bg-white shadow-soft transition-all focus-within:shadow-floating focus-within:border-indigo-300">
          <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4 rounded-t-3xl">
            <label className="block text-sm font-bold tracking-widest uppercase text-slate-400" htmlFor="title">
              笔记标题
            </label>
          </div>
          <div className="p-6">
            <input
              className="w-full border-none bg-transparent px-2 py-2 text-2xl font-bold text-slate-900 outline-none placeholder:text-slate-300 focus:ring-0"
              id="title"
              name="title"
              placeholder="在这里输入一个响亮的标题..."
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </div>
        </section>

        <section className="flex flex-col overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-soft transition-all focus-within:shadow-floating focus-within:border-indigo-300">
          <div className="flex flex-wrap items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-3 gap-4">
            <label className="text-sm font-bold tracking-widest uppercase text-slate-400 shrink-0">正文编辑区</label>
            
            <div className="flex flex-wrap items-center gap-1">
              {toolbarItems.map((item) => {
                const Icon = item.icon;

                return (
                  <button
                    key={item.label}
                    className={clsx(
                      "inline-flex h-9 w-9 items-center justify-center rounded-xl transition-all",
                      item.active
                        ? "bg-indigo-100 text-indigo-700 shadow-sm"
                        : "text-slate-500 hover:bg-slate-200 hover:text-slate-900"
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
                  <div className="mx-2 h-5 w-[1px] bg-slate-300"></div>
                  <button
                    className="group relative inline-flex h-9 items-center justify-center gap-2 rounded-xl px-3 text-slate-500 transition-all hover:bg-slate-200 hover:text-slate-900"
                    type="button"
                    title="上传附件"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                    ) : (
                      <Paperclip className="h-4 w-4 group-hover:text-indigo-600 transition-colors" />
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

          <div className="flex-1 bg-white">
            <EditorContent editor={editor} />
          </div>

          <input name="content_text" type="hidden" value={contentText} />
          <input name="content_json" type="hidden" value={contentJson} />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-slate-100 bg-slate-50/50 p-5">
            <p className="text-xs font-medium text-slate-400">
              自动保存结构化 JSON 与纯文本，优化 Elasticsearch 检索体验。
            </p>
            <div className="flex gap-3 shrink-0">
              <Link
                href={cancelHref}
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:text-slate-900"
              >
                <X className="h-4 w-4" />
                放弃修改
              </Link>
              <button
                className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-8 py-2.5 text-sm font-bold text-white shadow-soft transition-all hover:-translate-y-0.5 hover:bg-indigo-700 hover:shadow-floating active:scale-95"
                type="submit"
                form="note-form"
              >
                <Save className="h-4 w-4" />
                保存笔记
              </button>
            </div>
          </div>
        </section>
      </form>
    </div>
  );
}
