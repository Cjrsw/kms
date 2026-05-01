"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

type PasswordVisibilityInputProps = {
  id?: string;
  name: string;
  autoComplete?: string;
  className?: string;
  placeholder?: string;
  required?: boolean;
  hasError?: boolean;
};

export function PasswordVisibilityInput({
  id,
  name,
  autoComplete,
  className = "",
  placeholder,
  required,
  hasError = false,
}: PasswordVisibilityInputProps) {
  const [visible, setVisible] = useState(false);
  const inputType = visible ? "text" : "password";
  const mergedClassName = [className, hasError ? "is-error" : ""].filter(Boolean).join(" ");

  return (
    <div className="kms-password-field">
      <input
        autoComplete={autoComplete}
        className={mergedClassName}
        id={id}
        name={name}
        placeholder={placeholder}
        required={required}
        type={inputType}
      />
      <button
        aria-label={visible ? "隐藏密码" : "显示密码"}
        className="kms-password-toggle"
        onClick={() => setVisible((current) => !current)}
        type="button"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        <span>{visible ? "HIDE" : "SHOW"}</span>
      </button>
    </div>
  );
}
