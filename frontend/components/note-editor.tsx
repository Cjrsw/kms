"use client";

import { useEffect, useState } from "react";
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
  Quote
} from "lucide-react";

type NoteEditorProps = {
  cancelHref: string;
  initialTitle: string;
  initialContentJson: string;
  initialContentText: string;
  action: (formData: FormData) => void;
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
  action
}: NoteEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [contentText, setContentText] = useState(initialContentText);
  const [contentJson, setContentJson] = useState(
    initialContentJson || JSON.stringify(createFallbackDocument(initialContentText))
  );

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
          "min-h-[420px] px-5 py-5 text-[15px] leading-relaxed text-gray-700 outline-none ProseMirror"
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
      label: "引用",
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
    <form action={action} className="grid gap-6">
      <section className="rounded-xl border border-gray-300 bg-white shadow-sm">
        <div className="border-b border-gray-200 bg-gray-50 p-4">
          <label className="block text-sm font-semibold text-gray-700" htmlFor="title">
            标题
          </label>
        </div>
        <div className="p-5">
          <input
            className="block w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-700 outline-none transition-all hover:bg-white focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
            id="title"
            name="title"
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-gray-300 bg-white shadow-sm focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
        <div className="border-b border-gray-200 bg-gray-50 p-4">
          <label className="block text-sm font-semibold text-gray-700">正文</label>
        </div>

        <div className="border-b border-gray-100 bg-white px-4 py-3">
          <div className="flex flex-wrap items-center gap-1">
            {toolbarItems.map((item) => {
              const Icon = item.icon;

              return (
                <button
                  key={item.label}
                  className={`inline-flex items-center rounded px-2.5 py-1.5 text-xs transition-colors ${
                    item.active
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600 hover:bg-gray-200 hover:text-gray-900"
                  }`}
                  onClick={item.onClick}
                  type="button"
                >
                  <Icon className="mr-1.5 h-3.5 w-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <EditorContent editor={editor} />

        <input name="content_text" type="hidden" value={contentText} />
        <input name="content_json" type="hidden" value={contentJson} />

        <div className="flex justify-between gap-3 border-t border-gray-200 bg-gray-50 p-3">
          <p className="px-2 py-2 text-xs text-gray-500">当前会同时保存结构化 JSON 和纯文本，方便后续 Elasticsearch 建索引。</p>
          <div className="flex gap-3">
            <Link
              href={cancelHref}
              className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-white"
            >
              取消
            </Link>
            <button
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
              type="submit"
            >
              保存笔记内容
            </button>
          </div>
        </div>
      </section>
    </form>
  );
}
