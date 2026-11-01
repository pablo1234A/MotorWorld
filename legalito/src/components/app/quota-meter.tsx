import { fmtDate } from "./status";
import { cn } from "@/lib/cn";

/** Uso del cupo mensual de documentos de la suscripción. */
export function QuotaMeter({ quota, className }: { quota: { limit: number | null; used: number; periodEnd: string | null }; className?: string }) {
  const unlimited = quota.limit === null;
  const pct = unlimited ? 0 : Math.min(100, Math.round((quota.used / quota.limit!) * 100));
  const tone = unlimited ? "bg-blue" : pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-warning" : "bg-blue";
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted">Documentos este periodo</span>
        <span className="font-medium text-ink tabular-nums">{unlimited ? `${quota.used} · ilimitados` : `${quota.used} de ${quota.limit}`}</span>
      </div>
      {!unlimited && (
        <div className="h-1.5 overflow-hidden rounded-full bg-sand-200" role="progressbar" aria-valuenow={quota.used} aria-valuemin={0} aria-valuemax={quota.limit!} aria-label="Cupo de documentos usado">
          <div className={cn("h-full rounded-full transition-[width]", tone)} style={{ width: `${Math.max(pct, 2)}%` }} />
        </div>
      )}
      {quota.periodEnd && <p className="text-xs text-subtle">Se renueva el {fmtDate(quota.periodEnd)}</p>}
    </div>
  );
}
