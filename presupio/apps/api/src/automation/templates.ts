import { errors } from '../lib/errors.js';

/** Variables disponibles en las plantillas. No hay importes, precios ni descuentos a propósito. */
export const TEMPLATE_VARIABLES = {
  nombre_cliente: 'Nombre del cliente',
  titulo_presupuesto: 'Título del presupuesto',
  referencia: 'Referencia del presupuesto (puede estar vacía)',
  fecha_envio: 'Fecha en que se envió el presupuesto',
  empresa: 'Nombre comercial de tu empresa',
  remitente: 'Nombre del remitente configurado',
} as const;

export type TemplateVariable = keyof typeof TEMPLATE_VARIABLES;
export type TemplateValues = Record<TemplateVariable, string>;

const PLACEHOLDER = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;

export interface TemplateInput {
  subject: string;
  body: string;
}

/** Valida una plantilla: solo variables conocidas, llaves bien cerradas y asunto en una línea. */
export function validateTemplate(input: TemplateInput): void {
  const details: Array<{ path: string; message: string }> = [];
  for (const field of ['subject', 'body'] as const) {
    const text = input[field];
    for (const match of text.matchAll(PLACEHOLDER)) {
      if (!(match[1]! in TEMPLATE_VARIABLES)) {
        details.push({ path: field, message: `Variable desconocida: {{${match[1]}}}` });
      }
    }
    const rest = text.replace(PLACEHOLDER, '');
    if (rest.includes('{{') || rest.includes('}}')) {
      details.push({ path: field, message: 'Hay llaves {{ }} sin cerrar o mal escritas' });
    }
  }
  if (/[\r\n]/.test(input.subject)) details.push({ path: 'subject', message: 'El asunto debe ocupar una sola línea' });
  if (details.length) throw errors.validation('La plantilla no es válida.', details);
}

/** Limpia un valor que viene de datos introducidos por usuarios antes de insertarlo. */
function cleanValue(value: string, max = 200): string {
  return value
    // Caracteres de control (incluido el salto de línea) fuera de un valor de una sola línea: es intencionado.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function fill(text: string, values: TemplateValues): string {
  return text.replace(PLACEHOLDER, (_m, name: string) => cleanValue(values[name as TemplateVariable] ?? ''));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export interface Sender {
  companyName: string;
  legalName: string | null;
  taxId: string | null;
}

export interface RenderedMessage {
  subject: string;
  /** Cuerpo escrito en la plantilla (lo que se revisa y aprueba). */
  body: string;
  /** Texto completo enviado, con el pie legal y el enlace de baja. */
  text: string;
  html: string;
}

/** Pie obligatorio (no editable): identifica a la empresa y ofrece la baja (LSSI art. 21). */
export function legalFooter(sender: Sender, unsubscribeUrl: string): string {
  const identity = [cleanValue(sender.legalName ?? sender.companyName), sender.taxId ? `NIF ${cleanValue(sender.taxId, 20)}` : null]
    .filter(Boolean)
    .join(' · ');
  return [
    '—',
    identity,
    `Te escribimos porque solicitaste un presupuesto a ${cleanValue(sender.companyName)}. Si no quieres recibir más correos de seguimiento, puedes darte de baja aquí: ${unsubscribeUrl}`,
  ].join('\n');
}

/** Rellena asunto y cuerpo; el cuerpo aprobado puede venir ya rellenado (instantánea). */
export function renderBody(input: TemplateInput, values: TemplateValues): { subject: string; body: string } {
  return {
    subject: fill(input.subject, values).replace(/[\r\n]+/g, ' ').trim().slice(0, 250),
    body: dropRepeatedLines(fill(input.body, values)).trim(),
  };
}

/**
 * Quita una línea idéntica a la anterior: si no hay remitente configurado, {{remitente}} y
 * {{empresa}} dan el mismo nombre y la firma lo repetiría.
 */
function dropRepeatedLines(text: string): string {
  return text
    .split('\n')
    .filter((line, i, lines) => i === 0 || !line.trim() || line.trim() !== lines[i - 1]!.trim())
    .join('\n');
}

export function composeMessage(subject: string, body: string, sender: Sender, unsubscribeUrl: string): RenderedMessage {
  const footer = legalFooter(sender, unsubscribeUrl);
  const text = `${body}\n\n${footer}\n`;
  const htmlBody = escapeHtml(body).replace(/\n/g, '<br>');
  const htmlFooter = escapeHtml(footer)
    .replace(/\n/g, '<br>')
    .replace(escapeHtml(unsubscribeUrl), `<a href="${escapeHtml(unsubscribeUrl)}">${escapeHtml(unsubscribeUrl)}</a>`);
  const html = `<!doctype html><html lang="es"><body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#17221e">
<div>${htmlBody}</div>
<p style="margin-top:24px;font-size:12px;color:#5f6e67">${htmlFooter}</p>
</body></html>`;
  return { subject, body, text, html };
}

/** Plantillas iniciales (versión 1). Breves, educadas y sin precios, descuentos ni promesas. */
export const DEFAULT_TEMPLATES: Record<number, TemplateInput> = {
  1: {
    subject: 'Tu presupuesto de {{titulo_presupuesto}}',
    body: [
      'Hola, {{nombre_cliente}}:',
      '',
      'Queríamos saber si has podido revisar el presupuesto de {{titulo_presupuesto}} que te enviamos. Si tienes alguna duda o necesitas que aclaremos algún detalle, estaremos encantados de ayudarte.',
      '',
      'Un saludo,',
      '{{remitente}}',
      '{{empresa}}',
    ].join('\n'),
  },
  2: {
    subject: 'Sobre tu presupuesto de {{titulo_presupuesto}}',
    body: [
      'Hola, {{nombre_cliente}}:',
      '',
      'Te escribimos de nuevo por el presupuesto de {{titulo_presupuesto}}. Si te viene bien, podemos llamarte para repasarlo juntos y resolver cualquier duda. Basta con que respondas a este correo.',
      '',
      'Un saludo,',
      '{{remitente}}',
      '{{empresa}}',
    ].join('\n'),
  },
  3: {
    subject: 'Tu presupuesto de {{titulo_presupuesto}}',
    body: [
      'Hola, {{nombre_cliente}}:',
      '',
      'No queremos insistir más de la cuenta. Si ya has tomado una decisión sobre el presupuesto de {{titulo_presupuesto}}, nos ayudaría mucho saberlo, sea cual sea. Y si más adelante quieres retomarlo, aquí estaremos.',
      '',
      'Un saludo,',
      '{{remitente}}',
      '{{empresa}}',
    ].join('\n'),
  },
};

export function defaultTemplate(step: number): TemplateInput {
  return DEFAULT_TEMPLATES[step] ?? DEFAULT_TEMPLATES[3]!;
}

/** Valores de ejemplo para la vista previa (claramente ficticios). */
export const SAMPLE_VALUES: TemplateValues = {
  nombre_cliente: 'Nombre del cliente',
  titulo_presupuesto: 'Reforma de cocina',
  referencia: 'P-0000',
  fecha_envio: '1 de octubre de 2026',
  empresa: 'Tu empresa',
  remitente: 'Tu nombre',
};
