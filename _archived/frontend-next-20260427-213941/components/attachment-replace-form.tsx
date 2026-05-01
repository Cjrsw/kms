"use client";

import { useRef } from "react";
import { RefreshCw } from "lucide-react";

type AttachmentReplaceFormProps = {
  action: (formData: FormData) => void;
  attachmentId: number;
};

export function AttachmentReplaceForm({ action, attachmentId }: AttachmentReplaceFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form action={action} ref={formRef} className="relative flex">
      <input name="attachment_id" type="hidden" value={attachmentId} />
      <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 hover:text-indigo-600">
        <RefreshCw className="h-3 w-3" />
        替换
        <input
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="sr-only"
          name="attachment"
          type="file"
          onChange={(event) => {
            if (event.currentTarget.files && event.currentTarget.files.length > 0) {
              formRef.current?.requestSubmit();
            }
          }}
        />
      </label>
    </form>
  );
}
