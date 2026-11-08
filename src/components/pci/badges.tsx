import { daysUntil, formatDate } from "@/lib/dates";
import {
  EQUIPMENT_STATUS_LABELS,
  INCIDENT_STATUS_LABELS,
  RESULT_LABELS,
  SEVERITY_LABELS,
  WORK_ORDER_STATUS_LABELS,
} from "@/lib/pci/labels";

const BASE = "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium";
const TONES = {
  ok: "bg-[var(--success-soft)] text-[var(--success-strong)]",
  warn: "bg-[var(--warning-soft)] text-[var(--foreground)]",
  bad: "bg-[var(--danger-soft)] text-[var(--danger-strong)]",
  info: "bg-[var(--info-soft)] text-[var(--foreground)]",
  neutral: "bg-[var(--surface-2)] text-[var(--muted)]",
  accent: "bg-[var(--accent-soft)] text-[var(--accent)]",
} as const;

export function Badge({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={`${BASE} ${TONES[tone]}`}>{children}</span>;
}

/** Próxima actuación con su estado: vencida, en 30 días o al día. */
export function DueBadge({ date, today }: { date: string | null; today: string }) {
  if (!date) return <span className="text-xs text-[var(--muted)]">Sin vencimiento</span>;
  const d = daysUntil(date, today);
  const hint = d < 0 ? `vencida hace ${-d} d` : d === 0 ? "hoy" : `en ${d} d`;
  return (
    <Badge tone={d < 0 ? "bad" : d <= 30 ? "warn" : "neutral"}>
      {d < 0 ? "⚠ " : ""}
      {formatDate(date)} · {hint}
    </Badge>
  );
}

export function EquipmentStatusBadge({ status }: { status: string }) {
  return <Badge tone={status === "in_service" ? "ok" : status === "out_of_service" ? "bad" : "neutral"}>{EQUIPMENT_STATUS_LABELS[status as keyof typeof EQUIPMENT_STATUS_LABELS] ?? status}</Badge>;
}

export function WorkOrderStatusBadge({ status }: { status: string }) {
  const tone = status === "completed" ? "ok" : status === "canceled" ? "neutral" : status === "in_progress" ? "accent" : status === "assigned" ? "info" : "warn";
  return <Badge tone={tone}>{WORK_ORDER_STATUS_LABELS[status as keyof typeof WORK_ORDER_STATUS_LABELS] ?? status}</Badge>;
}

export function ResultBadge({ result }: { result: string | null }) {
  if (!result) return <Badge tone="neutral">Pendiente</Badge>;
  const tone = result === "compliant" ? "ok" : result === "compliant_with_remarks" ? "warn" : result === "non_compliant" ? "bad" : "neutral";
  return <Badge tone={tone}>{RESULT_LABELS[result as keyof typeof RESULT_LABELS] ?? result}</Badge>;
}

export function SeverityBadge({ severity }: { severity: string }) {
  const tone = severity === "critical" || severity === "high" ? "bad" : severity === "medium" ? "warn" : "neutral";
  return <Badge tone={tone}>{SEVERITY_LABELS[severity as keyof typeof SEVERITY_LABELS] ?? severity}</Badge>;
}

export function IncidentStatusBadge({ status }: { status: string }) {
  const tone = status === "resolved" ? "ok" : status === "dismissed" ? "neutral" : status === "in_progress" ? "info" : "bad";
  return <Badge tone={tone}>{INCIDENT_STATUS_LABELS[status as keyof typeof INCIDENT_STATUS_LABELS] ?? status}</Badge>;
}

/** Tarjeta de cifra para el inicio y los informes. */
export function StatCard({ label, value, href, tone }: { label: string; value: number; href?: string; tone?: "bad" | "warn" }) {
  const inner = (
    <>
      <dt className="text-sm text-[var(--muted)]">{label}</dt>
      <dd className={`mt-1 text-3xl font-semibold tabular-nums ${tone === "bad" && value ? "text-[var(--danger)]" : tone === "warn" && value ? "text-[var(--warning)]" : ""}`}>
        {value.toLocaleString("es-ES")}
      </dd>
    </>
  );
  const cls = `rounded-xl border bg-[var(--surface)] p-5 ${tone === "bad" && value ? "border-[var(--danger)]/40" : "border-[var(--border)]"}`;
  return href ? (
    <a href={href} className={`${cls} block hover:border-[var(--accent)]`}>
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
