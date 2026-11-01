import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("h-5 w-5 animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

type Tone = "info" | "success" | "warning" | "danger";

const toneStyles: Record<Tone, string> = {
  info: "border-blue/20 bg-blue-50 text-navy",
  success: "border-success/25 bg-success-bg text-success",
  warning: "border-warning/25 bg-warning-bg text-warning",
  danger: "border-danger/25 bg-danger-bg text-danger",
};
const toneIcon: Record<Tone, ReactNode> = {
  info: <Info className="h-4.5 w-4.5" aria-hidden />,
  success: <CheckCircle2 className="h-4.5 w-4.5" aria-hidden />,
  warning: <AlertTriangle className="h-4.5 w-4.5" aria-hidden />,
  danger: <XCircle className="h-4.5 w-4.5" aria-hidden />,
};

export function Alert({ tone = "info", title, children, className }: { tone?: Tone; title?: string; children?: ReactNode; className?: string }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl border px-4 py-3 text-sm", toneStyles[tone], className)}>
      <span className="mt-0.5 shrink-0">{toneIcon[tone]}</span>
      <div className="min-w-0 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="leading-relaxed [&_a]:underline">{children}</div>}
      </div>
    </div>
  );
}

const badgeTones = {
  neutral: "bg-sand text-ink-soft ring-line-strong",
  info: "bg-blue-50 text-blue ring-blue/20",
  success: "bg-success-bg text-success ring-success/20",
  warning: "bg-warning-bg text-warning ring-warning/25",
  danger: "bg-danger-bg text-danger ring-danger/20",
} as const;

export function Badge({ tone = "neutral", children, className }: { tone?: keyof typeof badgeTones; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap", badgeTones[tone], className)}>
      {children}
    </span>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-[var(--radius-card)] border border-dashed border-line-strong bg-white/60 px-6 py-12 text-center">
      {icon && <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-sand text-navy">{icon}</div>}
      <p className="font-semibold text-navy-950">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-sand-200/70", className)} />;
}

export function PageLoading({ label = "Cargando…" }: { label?: string }) {
  return (
    <div className="space-y-6 animate-fade-in" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-48" />
    </div>
  );
}
