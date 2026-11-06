import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

import { type EmailPort, type OutboundEmail, sanitizeProviderMessage, type SendResult } from "./port";

/**
 * Adaptador SMTP genérico (Amazon SES por SMTP, Mailpit en local, etc.).
 * SMTP no admite claves de idempotencia: la protección contra reenvíos la da
 * el dispatcher comprobando `email_logs` antes de reintentar.
 */
export class SmtpEmailAdapter implements EmailPort {
  readonly name = "smtp" as const;
  private readonly transport: Transporter;

  constructor(url: string) {
    const u = new URL(url);
    this.transport = nodemailer.createTransport({
      host: u.hostname,
      port: Number(u.port || (u.protocol === "smtps:" ? 465 : 587)),
      secure: u.protocol === "smtps:",
      auth: u.username ? { user: decodeURIComponent(u.username), pass: decodeURIComponent(u.password) } : undefined,
      // Tiempos acotados: un servidor lento no bloquea el lote.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  async send(email: OutboundEmail): Promise<SendResult> {
    try {
      const info = await this.transport.sendMail({
        from: email.from,
        to: email.to,
        replyTo: email.replyTo,
        subject: email.subject,
        html: email.html,
        text: email.text,
        headers: { ...email.headers, "X-RevisaYa-Idempotency-Key": email.idempotencyKey },
      });
      if (info.rejected?.length) {
        return { kind: "permanent", code: "smtp_rejected", message: "El servidor rechazó el destinatario" };
      }
      return { kind: "accepted", messageId: String(info.messageId ?? "").replace(/^<|>$/g, "") || email.idempotencyKey };
    } catch (err) {
      const e = err as { responseCode?: number; code?: string; message?: string };
      const code = e.responseCode ? `smtp_${e.responseCode}` : (e.code ?? "smtp_error");
      const message = sanitizeProviderMessage(e.message ?? "Error SMTP");
      // 5xx = rechazo definitivo; 4xx y errores de red = temporales.
      if (e.responseCode && e.responseCode >= 500) return { kind: "permanent", code, message };
      return { kind: "retryable", code, message };
    }
  }
}
