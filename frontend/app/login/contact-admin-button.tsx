"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";

export function ContactAdminButton() {
  const [message, setMessage] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submitResetRequest() {
    const username = document.querySelector<HTMLInputElement>("#loginUsername")?.value.trim() ?? "";
    if (!username) {
      setMessage("请先填写识别码，再申请管理员重置密码。");
      setIsOpen(true);
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/auth/password-reset-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username }),
      });
      setMessage(
        response.ok
          ? "已申请，管理员会在后台消息中看到你的重置密码请求。"
          : "申请提交失败，请稍后重试或直接联系管理员。",
      );
      setIsOpen(true);
    });
  }

  return (
    <>
      <button className="kms-contact-admin" disabled={isPending} onClick={submitResetRequest} type="button">
        {isPending ? "REQUESTING..." : "CONTACT ADMIN?"}
      </button>
      {isOpen ? (
        <div className="kms-login-modal-backdrop" role="dialog" aria-modal="true">
          <div className="kms-login-modal">
            <div className="kms-login-modal-header">
              <h2>RESET REQUEST // 重置申请</h2>
              <button className="kms-login-modal-close" onClick={() => setIsOpen(false)} type="button" aria-label="关闭">
                <X size={18} />
              </button>
            </div>
            <p>{message}</p>
            <div className="kms-login-modal-actions">
              <button className="kms-cyber-btn primary" onClick={() => setIsOpen(false)} type="button">
                OK // 确认
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
