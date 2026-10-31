import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../env";
import { logger } from "../logger";
import { escapeHtml } from "@/lib/template";

/**
 * Correo transaccional de la plataforma (verificación de cuenta, recuperación
 * de contraseña, avisos de autorización). Se envía por SMTP propio de Reseñalo,
 * NUNCA con la cuenta conectada del cliente.
 */
let transporter: Transporter | null = null;

function getTransport(): Transporter | null {
  const e = env();
  if (!e.SMTP_HOST) return null;
  transporter ??= nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_SECURE === "true",
    auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
  });
  return transporter;
}

export function resetSystemMailer() {
  transporter = null;
}

export type SystemEmail = { to: string; subject: string; heading: string; paragraphs: string[]; action?: { label: string; url: string }; footnote?: string };

export function renderSystemEmail(m: SystemEmail) {
  const text = [m.heading, "", ...m.paragraphs.flatMap((p) => [p, ""]), m.action ? `${m.action.label}: ${m.action.url}\n` : "", m.footnote ?? "", "", "— Reseñalo"].join("\n");
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f6f2ea;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" style="padding:28px 12px;"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border:1px solid #ebe4d8;border-radius:12px;">
<tr><td style="padding:28px 32px;">
<p style="margin:0 0 24px;font-size:18px;font-weight:bold;color:#2b2523;"><span style="color:#f5b82e;">&#9733;</span> Reseñalo</p>
<h1 style="margin:0 0 16px;font-size:20px;color:#2b2523;">${escapeHtml(m.heading)}</h1>
${m.paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#4a423f;">${escapeHtml(p)}</p>`).join("")}
${m.action ? `<p style="margin:24px 0;"><a href="${escapeHtml(m.action.url)}" style="display:inline-block;background:#2b2523;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;">${escapeHtml(m.action.label)}</a></p><p style="margin:0 0 14px;font-size:12px;color:#7a716d;word-break:break-all;">${escapeHtml(m.action.url)}</p>` : ""}
${m.footnote ? `<p style="margin:16px 0 0;font-size:12px;color:#7a716d;">${escapeHtml(m.footnote)}</p>` : ""}
</td></tr></table></td></tr></table></body></html>`;
  return { text, html };
}

export async function sendSystemEmail(m: SystemEmail): Promise<{ delivered: boolean }> {
  const t = getTransport();
  const { text, html } = renderSystemEmail(m);
  if (!t) {
    if (env().NODE_ENV === "production") {
      logger.error({ to: m.to, subject: m.subject }, "SMTP no configurado: no se puede enviar el correo del sistema");
      return { delivered: false };
    }
    // En desarrollo sin SMTP se muestra en consola para poder completar los flujos localmente.
    logger.warn({ to: m.to, subject: m.subject, action: m.action?.url }, "[DEV] SMTP no configurado — correo del sistema mostrado en el log");
    return { delivered: false };
  }
  await t.sendMail({ from: env().MAIL_FROM, to: m.to, subject: m.subject, text, html });
  return { delivered: true };
}
