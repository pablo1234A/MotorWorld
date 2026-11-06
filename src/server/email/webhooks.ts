import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Webhooks del proveedor de correo.
 *
 * Resend firma sus webhooks con el esquema de Svix / "Standard Webhooks":
 *   cabeceras  svix-id, svix-timestamp, svix-signature ("v1,<base64> v1,<base64>…")
 *   secreto    "whsec_<base64>" (se usa la clave decodificada)
 *   firma      base64(HMAC-SHA256(clave, `${id}.${timestamp}.${cuerpo}`))
 * Se rechazan marcas de tiempo con más de 5 minutos de diferencia (reenvíos
 * antiguos capturados). La comparación es en tiempo constante.
 */

export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export interface WebhookHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

export function svixHeaders(headers: Headers): WebhookHeaders {
  return {
    id: headers.get("svix-id") ?? headers.get("webhook-id"),
    timestamp: headers.get("svix-timestamp") ?? headers.get("webhook-timestamp"),
    signature: headers.get("svix-signature") ?? headers.get("webhook-signature"),
  };
}

function secretKey(secret: string): Buffer {
  return Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
}

export function signWebhook(secret: string, id: string, timestamp: string, body: string): string {
  return createHmac("sha256", secretKey(secret)).update(`${id}.${timestamp}.${body}`).digest("base64");
}

export type WebhookVerification = { ok: true; id: string } | { ok: false; reason: "missing_headers" | "stale" | "bad_signature" };

export function verifyWebhook(body: string, h: WebhookHeaders, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): WebhookVerification {
  if (!h.id || !h.timestamp || !h.signature || !/^\d{1,12}$/.test(h.timestamp)) return { ok: false, reason: "missing_headers" };
  if (Math.abs(nowSeconds - Number(h.timestamp)) > WEBHOOK_TOLERANCE_SECONDS) return { ok: false, reason: "stale" };
  const expected = Buffer.from(signWebhook(secret, h.id, h.timestamp, body));
  for (const part of h.signature.split(" ")) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    const given = Buffer.from(sig);
    if (given.length === expected.length && timingSafeEqual(given, expected)) return { ok: true, id: h.id };
  }
  return { ok: false, reason: "bad_signature" };
}

export interface EmailEvent {
  type: string; // delivered | delivery_delayed | bounced | complained | sent | opened | clicked | …
  messageId: string;
  occurredAt: Date;
  bounceType: "hard" | "soft" | "undetermined" | null;
}

/**
 * Evento de Resend → evento interno. Solo se extrae lo necesario: nunca se
 * guardan direcciones, asunto ni contenido. Devuelve null si no es un evento
 * de correo reconocible.
 */
export function parseResendEvent(payload: unknown): EmailEvent | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as { type?: unknown; created_at?: unknown; data?: { email_id?: unknown; bounce?: { type?: unknown } } };
  if (typeof p.type !== "string" || !p.type.startsWith("email.")) return null;
  const messageId = p.data?.email_id;
  if (typeof messageId !== "string" || messageId.length === 0 || messageId.length > 200) return null;
  const occurredAt = typeof p.created_at === "string" ? new Date(p.created_at) : new Date();
  const bounce = p.data?.bounce?.type;
  const type = p.type.slice("email.".length);
  return {
    type,
    messageId,
    occurredAt: Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
    bounceType:
      type !== "bounced" ? null : bounce === "Permanent" ? "hard" : bounce === "Transient" ? "soft" : "undetermined",
  };
}
