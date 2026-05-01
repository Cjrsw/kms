"use client";

import { useFormStatus } from "react-dom";

export function LoginSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className={`kms-login-submit-btn ${pending ? "is-loading" : ""}`}
      disabled={pending}
      type="submit"
    >
      <span>{pending ? "AUTHENTICATING... // 正在校验" : "LOGIN // 授权接入"}</span>
    </button>
  );
}
