import { Badge } from "@/components/ui/feedback";
import type { TemplateMeta } from "@/lib/data/panel";

export const fmtDate = (iso: string | null | undefined, withTime = false) =>
  iso
    ? new Intl.DateTimeFormat("es-ES", {
        day: "numeric",
        month: "short",
        year: "numeric",
        ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
        timeZone: "Europe/Madrid",
      }).format(new Date(iso))
    : "—";

/** Estado de revisión jurídica de la plantilla con la que se generó un documento. */
export function ReviewBadge({ template, revoked }: { template: TemplateMeta | null; revoked?: boolean }) {
  if (revoked) return <Badge tone="danger">Acceso revocado</Badge>;
  if (!template) return <Badge>Sin información</Badge>;
  if (template.is_demo) return <Badge tone="warning">Demostración · no válido</Badge>;
  if (template.legal_reviewed_at) return <Badge tone="success">Plantilla revisada</Badge>;
  return <Badge tone="warning">Pendiente de revisión</Badge>;
}

const SUB_LABEL: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info" }> = {
  active: { label: "Activa", tone: "success" },
  trialing: { label: "En prueba", tone: "info" },
  past_due: { label: "Pago pendiente", tone: "warning" },
  unpaid: { label: "Impagada", tone: "danger" },
  canceled: { label: "Cancelada", tone: "neutral" },
  incomplete: { label: "Incompleta", tone: "warning" },
  incomplete_expired: { label: "Caducada", tone: "neutral" },
  paused: { label: "En pausa", tone: "neutral" },
};

export function SubscriptionBadge({ status }: { status: string }) {
  const s = SUB_LABEL[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

const PAY_LABEL: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info" }> = {
  succeeded: { label: "Pagado", tone: "success" },
  pending: { label: "Pendiente", tone: "info" },
  failed: { label: "Fallido", tone: "danger" },
  refunded: { label: "Reembolsado", tone: "neutral" },
  partially_refunded: { label: "Reembolso parcial", tone: "neutral" },
  disputed: { label: "En disputa", tone: "warning" },
};

export function PaymentBadge({ status }: { status: string }) {
  const s = PAY_LABEL[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
