import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import Link from "next/link";
import { X } from "lucide-react";

export function AdminPageSection({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div>
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.24em] text-red-500">{eyebrow}</p> : null}
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">{title}</h1>
        {description ? <p className="mt-2 text-sm leading-6 text-white/48">{description}</p> : null}
      </div>
      {action ? <div className="flex items-center gap-3">{action}</div> : null}
    </div>
  );
}

export function AdminCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-none border border-white/10 bg-white/[0.045] shadow-[0_24px_70px_rgba(0,0,0,0.28)] backdrop-blur-sm ${className}`}>{children}</section>;
}

export function AdminMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <AdminCard className="p-5">
      <p className="text-sm font-medium text-white/48">{label}</p>
      <p className="mt-4 text-3xl font-bold tracking-tight text-white">{value}</p>
      {hint ? <p className="mt-2 text-xs text-white/35">{hint}</p> : null}
    </AdminCard>
  );
}

export function AdminToolbar({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">{children}</div>;
}

export function AdminModal({
  title,
  description,
  closeHref,
  children,
}: {
  title: string;
  description?: string;
  closeHref: string;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-5xl border border-white/12 bg-[#090b10] shadow-[0_32px_90px_rgba(0,0,0,0.55)]">
        <div className="flex items-start justify-between border-b border-white/10 px-6 py-5">
          <div>
            <h2 className="text-2xl font-semibold text-white">{title}</h2>
            {description ? <p className="mt-1 text-sm text-white/45">{description}</p> : null}
          </div>
          <Link
            href={closeHref}
            className="border border-white/12 p-2 text-white/45 transition-colors hover:border-red-500/50 hover:bg-red-500/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </Link>
        </div>
        <div className="px-6 py-6">{children}</div>
      </div>
    </div>
  );
}

export function AdminFieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-2 block text-sm font-medium text-white/62">{children}</label>;
}

export function AdminInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-11 w-full rounded-none border border-white/12 bg-black/25 px-4 text-sm text-white outline-none transition-all placeholder:text-white/25 focus:border-red-500/60 focus:ring-4 focus:ring-red-500/10 ${props.className ?? ""}`}
    />
  );
}

export function AdminSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`h-11 w-full rounded-none border border-white/12 bg-black/25 px-4 text-sm text-white outline-none transition-all focus:border-red-500/60 focus:ring-4 focus:ring-red-500/10 ${props.className ?? ""}`}
    />
  );
}

export function AdminTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-none border border-white/12 bg-black/25 px-4 py-3 text-sm text-white outline-none transition-all placeholder:text-white/25 focus:border-red-500/60 focus:ring-4 focus:ring-red-500/10 ${props.className ?? ""}`}
    />
  );
}

export function AdminPrimaryButton({
  children,
  type = "button",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      type={type}
      className={`inline-flex h-11 items-center justify-center rounded-none border border-red-500/40 bg-red-600 px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 ${className}`}
    >
      {children}
    </button>
  );
}

export function AdminSecondaryButton({
  children,
  type = "button",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      type={type}
      className={`inline-flex h-11 items-center justify-center rounded-none border border-white/15 bg-white/[0.04] px-5 text-sm font-medium text-white/75 transition-colors hover:border-white/30 hover:bg-white/10 hover:text-white ${className}`}
    >
      {children}
    </button>
  );
}

export function AdminDangerButton({
  children,
  type = "button",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      type={type}
      className={`inline-flex h-9 items-center justify-center rounded-none border border-red-500/35 bg-red-500/10 px-3 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/20 hover:text-white ${className}`}
    >
      {children}
    </button>
  );
}

export function buildAdminQuery(
  current: Record<string, string | string[] | undefined> | undefined,
  updates: Record<string, string | number | null | undefined>,
) {
  const params = new URLSearchParams();
  Object.entries(current ?? {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
      return;
    }
    if (value !== undefined) {
      params.set(key, value);
    }
  });
  Object.entries(updates).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") {
      params.delete(key);
      return;
    }
    params.set(key, String(value));
  });
  const query = params.toString();
  return query ? `?${query}` : "";
}
