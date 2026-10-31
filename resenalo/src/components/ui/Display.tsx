import clsx from "clsx";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

export function Card({ className, children, padded = true }: { className?: string; children: ReactNode; padded?: boolean }) {
  return <div className={clsx("card", padded && "p-5 sm:p-6", className)}>{children}</div>;
}

export function CardHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? <p className="mt-1 text-sm text-ink-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

type Tone = "neutral" | "ok" | "warn" | "bad" | "info" | "star";
const tones: Record<Tone, string> = {
  neutral: "bg-ink-100 text-ink-700",
  ok: "bg-ok-50 text-ok-700",
  warn: "bg-warn-50 text-warn-700",
  bad: "bg-bad-50 text-bad-700",
  info: "bg-info-50 text-info-700",
  star: "bg-star-50 text-star-800",
};
export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone], className)}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

const alertIcon = { info: Info, ok: CheckCircle2, warn: AlertTriangle, bad: XCircle };
export function Alert({ tone = "info", title, children, action, className }: { tone?: "info" | "ok" | "warn" | "bad"; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  const Icon = alertIcon[tone];
  const t = { info: "border-info-600/20 bg-info-50 text-info-700", ok: "border-ok-600/20 bg-ok-50 text-ok-700", warn: "border-warn-600/25 bg-warn-50 text-warn-700", bad: "border-bad-600/20 bg-bad-50 text-bad-700" }[tone];
  return (
    <div className={clsx("flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center", t, className)} role={tone === "bad" ? "alert" : "status"}>
      <div className="flex min-w-0 flex-1 gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="min-w-0 text-sm">
          {title ? <p className="font-semibold">{title}</p> : null}
          {children ? <div className={clsx(title && "mt-0.5", "text-ink-700")}>{children}</div> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      {icon ? <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-cream-200 text-ink-600">{icon}</div> : null}
      <h3 className="text-base font-semibold">{title}</h3>
      {children ? <div className="mt-1.5 max-w-md text-sm text-ink-500">{children}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Progress({ value, tone = "ink", label }: { value: number; tone?: "ink" | "warn" | "bad"; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={clsx("h-full rounded-full transition-[width]", tone === "ink" ? "bg-ink-800" : tone === "warn" ? "bg-warn-600" : "bg-bad-600")} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Stat({ label, value, hint, icon }: { label: ReactNode; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-ink-500">{label}</p>
        {icon ? <span className="text-ink-400">{icon}</span> : null}
      </div>
      <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-ink-900 sm:text-[28px]">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold sm:text-[28px]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-ink-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
