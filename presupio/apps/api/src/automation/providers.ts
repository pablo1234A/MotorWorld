import { createHmac, timingSafeEqual } from 'node:crypto';
import nodemailer, { type Transporter } from 'nodemailer';
import type { AppConfig } from '../config.js';

export interface OutgoingEmail {
  /** Identificador interno del intento (permite casar los webhooks con el envío). */
  deliveryId: string;
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  html: string;
  /** URL de baja de un clic (RFC 8058). */
  unsubscribeUrl: string;
}

export type SendResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; retryable: boolean; code: string; detail: string };

export interface FollowUpEmailProvider {
  readonly name: 'disabled' | 'mailgun' | 'smtp' | string;
  readonly configured: boolean;
  /** Si el proveedor confirma la entrega (webhooks). Sin esto, el estado máximo es "enviado". */
  readonly tracksDelivery: boolean;
  send(email: OutgoingEmail): Promise<SendResult>;
  /**
   * Opcional: consulta al proveedor si aceptó un envío de resultado desconocido. Solo lo
   * implementan los proveedores con registro de eventos consultable (Mailgun). `not_found` no
   * prueba nada (los eventos pueden tardar o haber caducado): el envío sigue pendiente de revisión.
   */
  lookup?(query: DeliveryLookup): Promise<'accepted' | 'rejected' | 'not_found'>;
}

export interface DeliveryLookup {
  deliveryId: string;
  recipient: string;
  /** Hora en que se llamó al proveedor (la búsqueda se acota alrededor de ella). */
  calledAt: Date;
}

/** Quita direcciones de email y recorta: el detalle del error no debe guardar datos personales. */
export function sanitizeErrorDetail(value: unknown): string {
  return String(value ?? '')
    .replace(/[^\s<>"'@]+@[^\s<>"'@]+/g, '[email]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

function listUnsubscribeHeaders(email: OutgoingEmail): Record<string, string> {
  return {
    'List-Unsubscribe': `<${email.unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

// ---------------------------------------------------------------------------
// Sin proveedor: nunca simula un envío
// ---------------------------------------------------------------------------

export class DisabledProvider implements FollowUpEmailProvider {
  readonly name = 'disabled';
  readonly configured = false;
  readonly tracksDelivery = false;
  async send(): Promise<SendResult> {
    return { ok: false, retryable: false, code: 'provider_not_configured', detail: 'No hay proveedor de email configurado' };
  }
}

// ---------------------------------------------------------------------------
// Mailgun (API HTTP, región UE por defecto)
// ---------------------------------------------------------------------------

export class MailgunProvider implements FollowUpEmailProvider {
  readonly name = 'mailgun';
  readonly configured = true;
  readonly tracksDelivery: boolean;

  constructor(
    private readonly options: { apiKey: string; domain: string; apiBase: string; webhookSigningKey?: string | undefined },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    // Sin clave de firma no se pueden aceptar webhooks, así que no hay confirmación de entrega.
    this.tracksDelivery = !!options.webhookSigningKey;
  }

  async send(email: OutgoingEmail): Promise<SendResult> {
    const form = new URLSearchParams();
    form.set('from', email.from);
    form.set('to', email.to);
    form.set('subject', email.subject);
    form.set('text', email.text);
    form.set('html', email.html);
    form.set('h:Reply-To', email.replyTo);
    for (const [name, value] of Object.entries(listUnsubscribeHeaders(email))) form.set(`h:${name}`, value);
    // Sin seguimiento de aperturas ni clics: no se necesitan y afectan a la privacidad.
    form.set('o:tracking', 'no');
    form.set('o:tracking-opens', 'no');
    form.set('o:tracking-clicks', 'no');
    form.set('o:tag', 'presupio-seguimiento');
    form.set('v:presupio_delivery_id', email.deliveryId);

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.options.apiBase}/v3/${encodeURIComponent(this.options.domain)}/messages`, {
        method: 'POST',
        headers: {
          authorization: `Basic ${Buffer.from(`api:${this.options.apiKey}`).toString('base64')}`,
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: form.toString(),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      return { ok: false, retryable: true, code: 'network_error', detail: sanitizeErrorDetail((error as Error).message) };
    }

    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (res.ok) {
      const id = typeof body.id === 'string' ? body.id.replace(/^<|>$/g, '') : null;
      return { ok: true, providerMessageId: id };
    }
    const detail = sanitizeErrorDetail(body.message ?? res.statusText);
    if (res.status === 429) return { ok: false, retryable: true, code: 'rate_limited', detail };
    if (res.status >= 500) return { ok: false, retryable: true, code: `provider_${res.status}`, detail };
    if (res.status === 401 || res.status === 403) return { ok: false, retryable: false, code: 'provider_auth', detail };
    return { ok: false, retryable: false, code: `rejected_${res.status}`, detail };
  }

  /**
   * Busca en el registro de eventos de Mailgun (Events API) los eventos del destinatario en
   * torno a la hora de la llamada y comprueba la variable presupio_delivery_id. Cualquier
   * evento posterior a la aceptación (accepted, delivered, failed tras aceptar…) prueba que el
   * email se envió; solo «rejected» prueba que no. Cualquier error de red → not_found.
   * NOTA: verificado con un servidor simulado; pendiente de comprobar con Mailgun real.
   */
  async lookup(query: DeliveryLookup): Promise<'accepted' | 'rejected' | 'not_found'> {
    const begin = Math.floor(query.calledAt.getTime() / 1000) - 120;
    const end = begin + 2 * 3600;
    const params = new URLSearchParams({ begin: String(begin), end: String(end), ascending: 'yes', limit: '300', recipient: query.recipient });
    try {
      const res = await this.fetchImpl(`${this.options.apiBase}/v3/${encodeURIComponent(this.options.domain)}/events?${params}`, {
        headers: { authorization: `Basic ${Buffer.from(`api:${this.options.apiKey}`).toString('base64')}`, accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return 'not_found';
      const body = (await res.json()) as { items?: Array<{ event?: string; 'user-variables'?: Record<string, unknown> }> };
      const ours = (body.items ?? []).filter((e) => e['user-variables']?.presupio_delivery_id === query.deliveryId);
      if (ours.some((e) => e.event && e.event !== 'rejected')) return 'accepted';
      if (ours.some((e) => e.event === 'rejected')) return 'rejected';
      return 'not_found';
    } catch {
      return 'not_found';
    }
  }
}

export interface MailgunSignature {
  timestamp: string;
  token: string;
  signature: string;
}

/**
 * Verifica la firma de un webhook de Mailgun: HMAC-SHA256(timestamp + token) con la
 * clave de firma de webhooks, comparación en tiempo constante y antigüedad máxima.
 */
export function verifyMailgunSignature(signingKey: string, sig: MailgunSignature, nowMs = Date.now(), maxAgeMs = 15 * 60_000): boolean {
  if (!/^\d{1,12}$/.test(sig.timestamp) || !/^[0-9a-f]{64}$/i.test(sig.signature) || !sig.token || sig.token.length > 200) return false;
  if (Math.abs(nowMs - Number(sig.timestamp) * 1000) > maxAgeMs) return false;
  const expected = createHmac('sha256', signingKey).update(sig.timestamp + sig.token).digest();
  const given = Buffer.from(sig.signature, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// ---------------------------------------------------------------------------
// SMTP genérico (cualquier servidor autorizado). Solo puede confirmar "enviado".
// ---------------------------------------------------------------------------

export class SmtpProvider implements FollowUpEmailProvider {
  readonly name = 'smtp';
  readonly configured = true;
  readonly tracksDelivery = false;
  private readonly transport: Transporter;

  constructor(smtp: NonNullable<AppConfig['mail']['smtp']>) {
    this.transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      requireTLS: !smtp.secure && smtp.host !== '127.0.0.1' && smtp.host !== 'localhost',
      auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    });
  }

  async send(email: OutgoingEmail): Promise<SendResult> {
    const domain = email.from.match(/@([^>\s]+)/)?.[1] ?? 'presupio.invalid';
    try {
      const info = await this.transport.sendMail({
        from: email.from,
        to: email.to,
        replyTo: email.replyTo,
        subject: email.subject,
        text: email.text,
        html: email.html,
        messageId: `<${email.deliveryId}@${domain}>`,
        headers: { ...listUnsubscribeHeaders(email), 'X-Presupio-Delivery': email.deliveryId },
      });
      if ((info.rejected ?? []).length > 0) {
        return { ok: false, retryable: false, code: 'recipient_rejected', detail: 'El servidor rechazó la dirección del destinatario' };
      }
      return { ok: true, providerMessageId: String(info.messageId).replace(/^<|>$/g, '') };
    } catch (error) {
      const e = error as Error & { responseCode?: number; code?: string };
      if (e.responseCode && e.responseCode >= 500) {
        return { ok: false, retryable: false, code: `smtp_${e.responseCode}`, detail: sanitizeErrorDetail(e.message) };
      }
      return { ok: false, retryable: true, code: e.responseCode ? `smtp_${e.responseCode}` : (e.code ?? 'smtp_error'), detail: sanitizeErrorDetail(e.message) };
    }
  }
}

export function createFollowUpProvider(config: AppConfig): FollowUpEmailProvider {
  switch (config.automation.provider) {
    case 'mailgun':
      return new MailgunProvider(config.automation.mailgun!);
    case 'smtp':
      return new SmtpProvider(config.mail.smtp!);
    default:
      return new DisabledProvider();
  }
}
