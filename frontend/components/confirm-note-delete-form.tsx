"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useFormStatus } from "react-dom";
import { Trash2, X } from "lucide-react";

type ConfirmNoteDeleteFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  noteId: number;
  noteTitle: string;
};

export function ConfirmNoteDeleteForm({ action, noteId, noteTitle }: ConfirmNoteDeleteFormProps) {
  const [open, setOpen] = useState(false);
  const modal =
    open && typeof document !== "undefined"
      ? createPortal(
          <div className="kms-confirm-backdrop" role="presentation">
            <form action={action} className="kms-confirm-dialog">
              <input name="note_id" type="hidden" value={noteId} />
              <div className="kms-confirm-header">
                <span>DELETE NOTE // 删除笔记</span>
                <button
                  aria-label="关闭确认弹窗"
                  className="kms-cyber-btn ghost kms-confirm-close"
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p>
                确认删除笔记 <strong>“{noteTitle}”</strong>？删除后会同步清理相关附件、全文索引和向量数据。
              </p>
              <div className="kms-confirm-actions">
                <button className="kms-cyber-btn ghost" onClick={() => setOpen(false)} type="button">
                  CANCEL // 取消
                </button>
                <ConfirmDeleteSubmitButton />
              </div>
            </form>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        className="kms-profile-action-btn danger"
        onClick={() => setOpen(true)}
        title="删除笔记"
        type="button"
      >
        <Trash2 className="h-3.5 w-3.5" />
        DEL
      </button>

      {modal}
    </>
  );
}

function ConfirmDeleteSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="kms-cyber-btn" disabled={pending} type="submit">
      {pending ? "DELETING..." : "DELETE // 确认删除"}
    </button>
  );
}
