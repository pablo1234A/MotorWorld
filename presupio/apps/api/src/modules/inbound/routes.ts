import type { FastifyInstance } from 'fastify';
import { verifyMailgunSignature } from '../../automation/providers.js';
import { hashToken } from '../../lib/crypto.js';
import { processInboundEmail, type InboundEmail } from './service.js';

/**
 * Adaptador de Mailgun para el correo entrante (acción forward() de una ruta de recepción).
 * Mailgun envía el mensaje ya analizado como formulario (multipart/form-data o
 * application/x-www-form-urlencoded) con timestamp, token y signature, firmados con la misma
 * clave que los webhooks de eventos. Formato pendiente de comprobar con una cuenta real de
 * Mailgun (docs/automatizacion.md): las cabeceras se leen tanto de message-headers como de
 * los campos sueltos, sin distinguir mayúsculas.
 */
export function mailgunInboundEmail(form: FormData): { email: InboundEmail; signature: { timestamp: string; token: string; signature: string } } {
  const field = new Map<string, string>();
  for (const [k, v] of form.entries()) if (typeof v === 'string') field.set(k.toLowerCase(), v);
  const headers: Record<string, string> = {};
  try {
    const list = JSON.parse(field.get('message-headers') ?? '[]') as Array<[string, string]>;
    for (const [name, value] of Array.isArray(list) ? list : []) {
      if (typeof name === 'string' && typeof value === 'string') headers[name.toLowerCase()] ??= value;
    }
  } catch {
    // Sin cabeceras estructuradas: se usan los campos sueltos.
  }
  const header = (name: string) => headers[name] ?? field.get(name) ?? null;
  const date = header('date');
  const email: InboundEmail = {
    recipients: (field.get('recipient') ?? header('to') ?? '').split(',').map((r) => r.trim()).filter(Boolean),
    sender: (field.get('sender') ?? header('from') ?? '').replace(/^.*<([^>]+)>.*$/, '$1').trim().toLowerCase() || null,
    subject: (header('subject') ?? '').slice(0, 300),
    messageId: header('message-id'),
    inReplyTo: header('in-reply-to'),
    references: header('references'),
    date: date ? new Date(date) : null,
    headers: Object.fromEntries(
      ['auto-submitted', 'x-autoreply', 'x-autorespond', 'x-autoresponder', 'precedence', 'content-type'].flatMap((h) => {
        const v = header(h);
        return v ? [[h, v]] : [];
      }),
    ),
  };
  return { email, signature: { timestamp: field.get('timestamp') ?? '', token: field.get('token') ?? '', signature: field.get('signature') ?? '' } };
}

export async function inboundRoutes(app: FastifyInstance) {
  // En este ámbito el cuerpo se recibe en bruto y se analiza con la API estándar FormData.
  const raw = (_req: unknown, body: Buffer, done: (err: Error | null, body?: unknown) => void) => done(null, body);
  app.addContentTypeParser('multipart/form-data', { parseAs: 'buffer', bodyLimit: 10 * 1024 * 1024 }, raw);
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'buffer', bodyLimit: 10 * 1024 * 1024 }, raw);

  app.post('/mailgun', { config: { auth: 'none', rateLimit: { max: 600, timeWindow: 60_000 } }, bodyLimit: 10 * 1024 * 1024 }, async (req, reply) => {
    const domain = app.config.automation.inboundDomain;
    const signingKey = app.config.automation.mailgun?.webhookSigningKey;
    if (!domain || !signingKey || app.followUpProvider.name !== 'mailgun') {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada.' } });
    }
    if (!Buffer.isBuffer(req.body)) return reply.status(415).send({ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Formato no admitido.' } });
    let form: FormData;
    try {
      form = await new Request('http://inbound.local/', { method: 'POST', headers: { 'content-type': String(req.headers['content-type']) }, body: req.body }).formData();
    } catch {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Formulario no válido.' } });
    }
    const { email, signature } = mailgunInboundEmail(form);
    if (!verifyMailgunSignature(signingKey, signature)) {
      req.log.warn('Correo entrante con firma no válida');
      return reply.status(401).send({ error: { code: 'INVALID_SIGNATURE', message: 'Firma no válida.' } });
    }
    // Antirrepetición de la entrega firmada (además del Message-Id del propio mensaje).
    const fresh = await app.db
      .insertInto('webhookEvents')
      .values({ provider: 'mailgun-inbound', tokenHash: hashToken(signature.token), eventType: 'inbound', deliveryId: null })
      .onConflict((oc) => oc.doNothing())
      .returning('id')
      .executeTakeFirst();
    if (!fresh) return { status: 'duplicate' };
    const result = await processInboundEmail(app.db, { provider: 'mailgun', domain, email });
    req.log.info({ status: result.status }, 'Correo entrante procesado');
    return result;
  });
}
