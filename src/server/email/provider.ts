import "server-only";

import type { EmailPort } from "./port";
import { ResendEmailAdapter } from "./resend";
import { SmtpEmailAdapter } from "./smtp";

/**
 * Proveedor de correo configurado, o null si no hay ninguno. Sin proveedor el
 * motor NO envía ni simula envíos: los recordatorios quedan programados y la
 * ejecución lo registra como «proveedor no configurado».
 */
export function getEmailProvider(env: Record<string, string | undefined> = process.env): EmailPort | null {
  const provider = env.EMAIL_PROVIDER;
  if (provider === "resend" && env.RESEND_API_KEY) return new ResendEmailAdapter(env.RESEND_API_KEY);
  if (provider === "smtp" && env.SMTP_URL) return new SmtpEmailAdapter(env.SMTP_URL);
  return null;
}

export interface SenderConfig {
  /** Dominio de envío compartido de RevisaYa (ADR-007, P1), p. ej. avisos.revisaya.es */
  sharedDomain: string;
  /** Base pública de la aplicación para enlaces (baja, citas). */
  appUrl: string;
  /** Secreto para firmar enlaces de los correos. */
  linkSecret: string;
}

/** Configuración necesaria para enviar; null si falta algo (no se envía). */
export function getSenderConfig(env: Record<string, string | undefined> = process.env): SenderConfig | null {
  const sharedDomain = env.EMAIL_SHARED_DOMAIN;
  const appUrl = env.APP_URL;
  const linkSecret = env.EMAIL_LINK_SECRET;
  if (!sharedDomain || !appUrl || !linkSecret || linkSecret.length < 32) return null;
  return { sharedDomain, appUrl, linkSecret };
}
