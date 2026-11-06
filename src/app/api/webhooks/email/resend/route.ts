import { NextResponse } from "next/server";

import { parseResendEvent, svixHeaders, verifyWebhook } from "@/server/email/webhooks";
import { logger } from "@/server/logger";
import { applyEmailEvent } from "@/server/modules/email/events";

/**
 * Webhook de Resend: entregas, retrasos, rebotes y quejas.
 * - Sin RESEND_WEBHOOK_SECRET el endpoint está desactivado (503).
 * - Firma Svix obligatoria; cuerpo máximo 256 KB.
 * - Idempotente: el mismo evento (svix-id) se aplica una sola vez.
 * - Responde 2xx a todo evento auténtico (aunque no se use) para que el
 *   proveedor no lo reintente; 5xx solo si falla la base de datos.
 */
const MAX_BODY = 256 * 1024;

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: { code: "not_configured" } }, { status: 503 });

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY) return NextResponse.json({ error: { code: "payload_too_large" } }, { status: 413 });
  const body = await request.text();
  if (body.length > MAX_BODY) return NextResponse.json({ error: { code: "payload_too_large" } }, { status: 413 });

  const verification = verifyWebhook(body, svixHeaders(request.headers), secret);
  if (!verification.ok) {
    logger.warn("email_webhook_rejected", { reason: verification.reason });
    return NextResponse.json({ error: { code: "invalid_signature" } }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: { code: "invalid_payload" } }, { status: 400 });
  }
  const event = parseResendEvent(payload);
  if (!event) return NextResponse.json({ ok: true, outcome: "ignored" });

  try {
    const outcome = await applyEmailEvent("resend", verification.id, event);
    return NextResponse.json({ ok: true, outcome });
  } catch (err) {
    logger.error("email_webhook_failed", { error: err });
    return NextResponse.json({ error: { code: "internal_error" } }, { status: 500 });
  }
}
