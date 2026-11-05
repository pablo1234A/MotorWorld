import { daysUntil, formatDate } from "@/lib/dates";
import { VEHICLE_STATUS_LABELS } from "@/lib/validation/workshop";

const BASE = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

export function VehicleStatusBadge({ status }: { status: string }) {
  const tone =
    status === "active" ? "bg-[var(--success-soft)] text-[var(--success-strong)]" : "bg-[var(--surface-2)] text-[var(--muted)]";
  return <span className={`${BASE} ${tone}`}>{VEHICLE_STATUS_LABELS[status as keyof typeof VEHICLE_STATUS_LABELS] ?? status}</span>;
}

/** Próxima revisión con aviso visual si está vencida o cerca. */
export function NextServiceBadge({ date, today }: { date: string | null; today: string }) {
  if (!date) return <span className="text-sm text-[var(--muted)]">Sin fecha</span>;
  const days = daysUntil(date, today);
  const tone =
    days < 0
      ? "bg-[var(--danger-soft)] text-[var(--danger-strong)]"
      : days <= 30
        ? "bg-[var(--warning-soft)] text-[var(--foreground)]"
        : "bg-[var(--surface-2)] text-[var(--foreground)]";
  const hint = days < 0 ? `vencida hace ${-days} d` : days === 0 ? "hoy" : `en ${days} d`;
  return (
    <span className={`${BASE} ${tone}`} title={hint}>
      {formatDate(date)} · {hint}
    </span>
  );
}
