import type { ReactNode } from "react";

type Tone = "error" | "success" | "info" | "warning";

const TONES: Record<Tone, string> = {
  error: "border-[var(--danger)]/30 bg-[var(--danger-soft)] text-[var(--danger-strong)]",
  success: "border-[var(--success)]/30 bg-[var(--success-soft)] text-[var(--success-strong)]",
  info: "border-[var(--accent)]/25 bg-[var(--accent-soft)] text-[var(--foreground)]",
  warning: "border-[var(--warning)]/30 bg-[var(--warning-soft)] text-[var(--foreground)]",
};

export function Alert({ tone = "info", title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${TONES[tone]}`}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={title ? "mt-1" : ""}>{children}</div> : null}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 ${className}`}>{children}</section>;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-lg bg-[var(--surface-2)] ${className}`} />;
}

export function PageLoading({ label = "Cargando…" }: { label?: string }) {
  return (
    <div className="flex flex-col gap-4" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
    </div>
  );
}
