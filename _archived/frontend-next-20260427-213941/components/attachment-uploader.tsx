"use client";

import { useRef } from "react";

type AttachmentUploaderProps = {
  action: (formData: FormData) => void;
  accept?: string;
  label?: string;
  hint?: string;
};

export function AttachmentUploader({ action, accept, label = "选择附件", hint }: AttachmentUploaderProps) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form action={action} ref={formRef} className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <label className="flex cursor-pointer flex-col gap-1 rounded-lg border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-700 transition-colors hover:border-blue-300 hover:bg-blue-50/60">
        <span className="font-medium">{label}</span>
        {hint ? <span className="text-xs text-gray-500">{hint}</span> : null}
        <input
          accept={accept}
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
