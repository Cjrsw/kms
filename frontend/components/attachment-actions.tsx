"use client";

type AttachmentActionsProps = {
  repoId: string;
  noteId: string;
  attachmentId: number;
  fileType: string;
};

export function AttachmentActions({ repoId, noteId, attachmentId, fileType }: AttachmentActionsProps) {
  const isPdf = fileType.toLowerCase() === "pdf";

  return (
    <div className="flex flex-shrink-0 gap-2 text-xs">
      {isPdf ? (
        <a
          className="rounded border border-gray-300 px-2 py-1 text-gray-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
          href={`/repositories/${repoId}/notes/${noteId}/attachments/${attachmentId}/preview`}
          target="_blank"
        >
          预览
        </a>
      ) : (
        <button
          className="rounded border border-gray-300 px-2 py-1 text-gray-500 transition-colors hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700"
          onClick={() => window.alert("预览仅支持 PDF 文件，请使用下载。")}
          type="button"
        >
          预览
        </button>
      )}

      <a
        className="rounded border border-gray-300 px-2 py-1 text-gray-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
        href={`/repositories/${repoId}/notes/${noteId}/attachments/${attachmentId}/download`}
        target="_blank"
      >
        下载
      </a>
    </div>
  );
}

