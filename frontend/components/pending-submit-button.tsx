"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

type PendingSubmitButtonProps = {
  className: string;
  children: ReactNode;
  pendingChildren: ReactNode;
};

export function PendingSubmitButton({ className, children, pendingChildren }: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? pendingChildren : children}
    </button>
  );
}
