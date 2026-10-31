export const JOB_STATUS: Record<string, { label: string; tone: "neutral" | "ok" | "warn" | "bad" | "info" | "star" }> = {
  SCHEDULED: { label: "Programado", tone: "info" },
  QUEUED: { label: "En cola", tone: "info" },
  SENDING: { label: "Enviando", tone: "info" },
  SENT: { label: "Enviado", tone: "ok" },
  DELIVERED: { label: "Entregado", tone: "ok" },
  FAILED: { label: "Fallido", tone: "bad" },
  BOUNCED: { label: "Rechazado", tone: "bad" },
  ON_HOLD: { label: "En espera", tone: "warn" },
  BLOCKED: { label: "Bloqueado", tone: "warn" },
  CANCELED: { label: "Cancelado", tone: "neutral" },
};
export const REQUEST_STATUS: Record<string, { label: string; tone: "neutral" | "ok" | "warn" | "bad" | "info" }> = {
  NONE: { label: "Sin solicitud", tone: "neutral" },
  PENDING: { label: "Pendiente", tone: "info" },
  SENT: { label: "Enviada", tone: "ok" },
  FAILED: { label: "Fallida", tone: "bad" },
  BLOCKED: { label: "Bloqueada", tone: "warn" },
};
export const SUB_STATUS: Record<string, { label: string; tone: "neutral" | "ok" | "warn" | "bad" | "info" }> = {
  ACTIVE: { label: "Activa", tone: "ok" },
  TRIALING: { label: "Periodo de prueba", tone: "ok" },
  PAST_DUE: { label: "Pago pendiente", tone: "bad" },
  UNPAID: { label: "Impagada", tone: "bad" },
  INCOMPLETE: { label: "Pago incompleto", tone: "warn" },
  INCOMPLETE_EXPIRED: { label: "Caducada", tone: "neutral" },
  CANCELED: { label: "Cancelada", tone: "neutral" },
  PAUSED: { label: "En pausa", tone: "warn" },
};
export const SOURCE_LABEL: Record<string, string> = { MANUAL: "Manual", CSV: "Importación CSV", API: "API", WEBHOOK: "Webhook", CAMPAIGN: "Campaña" };
export const LOG_EVENT_LABEL: Record<string, string> = {
  CREATED: "Creado", SCHEDULED: "Programado", QUEUED: "En cola", SEND_ATTEMPT: "Intento de envío", SENT: "Enviado", RETRY_SCHEDULED: "Reintento programado",
  FAILED: "Fallido", BOUNCED: "Rechazado", AUTH_ERROR: "Error de autorización", ON_HOLD: "En espera", BLOCKED_LIMIT: "Límite alcanzado", BLOCKED: "Bloqueado",
  CANCELED: "Cancelado", CLICKED: "Clic en el enlace", UNSUBSCRIBED: "Baja", REQUEUED: "Reanudado",
};
