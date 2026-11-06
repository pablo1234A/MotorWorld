import "server-only";

import { type EmailPort, type OutboundEmail, sanitizeProviderMessage, type SendResult } from "./port";

/**
 * Adaptador de Resend (API HTTP, https://resend.com/docs/api-reference/emails/send-email).
 * Envía la clave de idempotencia en la cabecera `Idempotency-Key`, de modo que
 * un reintento tras un timeout no duplica el envío.
 */
export class ResendEmailAdapter implements EmailPort {
  readonly name = "resend" as const;

  constructor(
    private readonly apiKey: string,
    private readonly endpoint = "https://api.resend.com/emails",
  ) {}

  async send(email: OutboundEmail): Promise<SendResult> {
    let res: Response;
    try {
      res = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": email.idempotencyKey,
        },
        body: JSON.stringify({
          from: email.from,
          to: [email.to],
          reply_to: email.replyTo,
          subject: email.subject,
          html: email.html,
          text: email.text,
          headers: email.headers,
          tags: Object.entries(email.tags ?? {}).map(([name, value]) => ({ name, value: value.replace(/[^A-Za-z0-9_-]/g, "_") })),
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      return { kind: "retryable", code: "network_error", message: sanitizeProviderMessage((err as Error).message ?? "Error de red") };
    }

    let body: { id?: string; name?: string; message?: string } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      // Respuesta sin JSON: se clasifica solo por el estado HTTP.
    }
    if (res.ok && body.id) return { kind: "accepted", messageId: body.id };
    const code = `resend_${res.status}${body.name ? `_${body.name}` : ""}`;
    const message = sanitizeProviderMessage(body.message ?? res.statusText);
    // 429 (límite) y 5xx: temporales. 409 = conflicto de idempotencia en curso: reintentar.
    if (res.status === 429 || res.status === 409 || res.status >= 500) return { kind: "retryable", code, message };
    return { kind: "permanent", code, message };
  }
}
