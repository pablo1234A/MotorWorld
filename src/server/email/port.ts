/**
 * Puerto de envío de correo (ADR-007). La lógica de recordatorios solo conoce
 * esta interfaz; cambiar de proveedor (SMTP, Resend, SES…) no la toca.
 */

export interface OutboundEmail {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  /**
   * Clave de idempotencia: el mismo valor en un reintento no debe producir un
   * segundo envío (si el proveedor lo soporta).
   */
  idempotencyKey: string;
  tags?: Record<string, string>;
}

export type SendResult =
  /** El proveedor ha ACEPTADO el mensaje (no implica entregado). */
  | { kind: "accepted"; messageId: string }
  /** Fallo temporal: reintentar más tarde (límite de envío, caída, timeout). */
  | { kind: "retryable"; code: string; message: string }
  /** Fallo definitivo: no reintentar (dirección inválida, dominio no verificado…). */
  | { kind: "permanent"; code: string; message: string };

export interface EmailPort {
  readonly name: "smtp" | "resend" | "ses" | "sendgrid";
  send(email: OutboundEmail): Promise<SendResult>;
}

/** Recorta y limpia mensajes de error del proveedor antes de guardarlos (sin datos personales). */
export function sanitizeProviderMessage(message: string): string {
  return message
    .replace(/[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/g, "[email]")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 500);
}
