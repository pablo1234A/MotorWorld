import type { MailMessage } from './mailer.js';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function layout(title: string, paragraphs: string[], action: { label: string; url: string }, footer: string): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`).join('');
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f4f6fa;font-family:Arial,Helvetica,sans-serif;color:#162033">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;padding:32px">
<tr><td style="font-size:20px;font-weight:bold;letter-spacing:.04em;padding-bottom:24px">PRESUPIO</td></tr>
<tr><td><h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>${body}
<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="background:#1f4fd8;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block">${escapeHtml(action.label)}</a></p>
<p style="font-size:13px;color:#5b6577;margin:0">${escapeHtml(footer)}</p></td></tr>
</table></td></tr></table></body></html>`;
}

export function passwordResetEmail(to: string, name: string, url: string): MailMessage {
  const title = 'Restablece tu contraseña';
  const lines = [
    `Hola ${name},`,
    'Hemos recibido una solicitud para restablecer la contraseña de tu cuenta de Presupio. El enlace caduca en 30 minutos y solo puede usarse una vez.',
  ];
  const footer = 'Si no has sido tú, ignora este mensaje: tu contraseña no cambiará.';
  return {
    template: 'password_reset',
    to,
    subject: 'Presupio · Restablecer contraseña',
    text: `${lines.join('\n\n')}\n\n${url}\n\n${footer}`,
    html: layout(title, lines, { label: 'Restablecer contraseña', url }, footer),
  };
}

export function emailVerificationEmail(to: string, name: string, url: string): MailMessage {
  const title = 'Confirma tu email';
  const lines = [`Hola ${name},`, 'Confirma que este email es tuyo para terminar de activar tu cuenta de Presupio.'];
  const footer = 'Si no has creado una cuenta en Presupio, ignora este mensaje.';
  return {
    template: 'email_verification',
    to,
    subject: 'Presupio · Confirma tu email',
    text: `${lines.join('\n\n')}\n\n${url}\n\n${footer}`,
    html: layout(title, lines, { label: 'Confirmar email', url }, footer),
  };
}

export function invitationEmail(to: string, companyName: string, inviterName: string, url: string): MailMessage {
  const title = `Te han invitado a ${companyName}`;
  const lines = [
    `${inviterName} te ha invitado a unirte a ${companyName} en Presupio, la herramienta para hacer seguimiento de presupuestos enviados.`,
    'La invitación caduca en 7 días.',
  ];
  const footer = 'Si no esperabas esta invitación, ignora este mensaje.';
  return {
    template: 'invitation',
    to,
    subject: `Presupio · Invitación a ${companyName}`,
    text: `${lines.join('\n\n')}\n\n${url}\n\n${footer}`,
    html: layout(title, lines, { label: 'Aceptar invitación', url }, footer),
  };
}
