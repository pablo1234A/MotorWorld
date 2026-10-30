import { createHmac } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { SMTPServer } from 'smtp-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MailgunProvider, sanitizeErrorDetail, SmtpProvider, verifyMailgunSignature, type OutgoingEmail } from '../src/automation/providers.js';
import { isWithinAllowedWindow, localDaysBetween, nextAllowedSlot, stepDueAt, type ContactRules } from '../src/automation/schedule.js';
import { composeMessage, DEFAULT_TEMPLATES, renderBody, SAMPLE_VALUES, TEMPLATE_VARIABLES, validateTemplate } from '../src/automation/templates.js';

const MADRID: ContactRules = { timezone: 'Europe/Madrid', allowedWeekdays: [1, 2, 3, 4, 5], windowStart: '09:00', windowEnd: '19:00' };

const email = (over: Partial<OutgoingEmail> = {}): OutgoingEmail => ({
  deliveryId: '7b7f4c1e-3d55-4c39-9a51-0f0f3f9b2a10',
  from: '"Reformas Prueba" <seguimiento@envios.ejemplo.test>',
  to: 'cliente@ejemplo.test',
  replyTo: 'oficina@ejemplo.test',
  subject: 'Tu presupuesto de cocina',
  text: 'Hola',
  html: '<p>Hola</p>',
  unsubscribeUrl: 'https://api.ejemplo.test/api/v1/public/unsubscribe?token=abc',
  ...over,
});

describe('calendario de seguimiento (zona horaria de la empresa)', () => {
  it('programa 3, 7 y 14 días naturales después, al inicio de la franja', () => {
    // Martes 6 de octubre de 2026, 17:30 en Madrid (15:30 UTC, horario de verano).
    const sent = new Date('2026-10-06T15:30:00Z');
    expect(stepDueAt(sent, 3, MADRID)?.toISOString()).toBe('2026-10-09T07:00:00.000Z'); // viernes 9:00
    expect(stepDueAt(sent, 7, MADRID)?.toISOString()).toBe('2026-10-13T07:00:00.000Z'); // martes 9:00
    expect(stepDueAt(sent, 14, MADRID)?.toISOString()).toBe('2026-10-20T07:00:00.000Z');
  });

  it('salta fines de semana y días no permitidos', () => {
    // Miércoles 7 oct + 3 = sábado 10 → lunes 12 a las 9:00.
    expect(stepDueAt(new Date('2026-10-07T08:00:00Z'), 3, MADRID)?.toISOString()).toBe('2026-10-12T07:00:00.000Z');
  });

  it('respeta el cambio de hora (último domingo de octubre y de marzo)', () => {
    const everyDay = { ...MADRID, allowedWeekdays: [1, 2, 3, 4, 5, 6, 7] };
    // Antes del 25-10-2026 Madrid es UTC+2; después, UTC+1.
    expect(stepDueAt(new Date('2026-10-22T10:00:00Z'), 3, everyDay)?.toISOString()).toBe('2026-10-25T08:00:00.000Z');
    expect(stepDueAt(new Date('2026-10-22T10:00:00Z'), 2, everyDay)?.toISOString()).toBe('2026-10-24T07:00:00.000Z');
    // 29-03-2026: de UTC+1 a UTC+2.
    expect(stepDueAt(new Date('2026-03-26T10:00:00Z'), 2, everyDay)?.toISOString()).toBe('2026-03-28T08:00:00.000Z');
    expect(stepDueAt(new Date('2026-03-26T10:00:00Z'), 3, everyDay)?.toISOString()).toBe('2026-03-29T07:00:00.000Z');
  });

  it('dentro de la franja devuelve el mismo instante; fuera, el siguiente hueco', () => {
    const inside = new Date('2026-10-14T10:00:00Z'); // miércoles 12:00 en Madrid
    expect(isWithinAllowedWindow(inside, MADRID)).toBe(true);
    expect(nextAllowedSlot(inside, MADRID)?.getTime()).toBe(inside.getTime());
    // Miércoles 20:00 → jueves 9:00. Viernes 19:30 → lunes 9:00.
    expect(nextAllowedSlot(new Date('2026-10-14T18:00:00Z'), MADRID)?.toISOString()).toBe('2026-10-15T07:00:00.000Z');
    expect(nextAllowedSlot(new Date('2026-10-16T17:30:00Z'), MADRID)?.toISOString()).toBe('2026-10-19T07:00:00.000Z');
    expect(nextAllowedSlot(inside, { ...MADRID, allowedWeekdays: [] })).toBeNull();
  });

  it('cuenta días naturales en la hora local, no bloques de 24 h', () => {
    // 23:30 del lunes y 00:30 del martes en Madrid: un día natural.
    expect(localDaysBetween(new Date('2026-10-12T21:30:00Z'), new Date('2026-10-12T22:30:00Z'), 'Europe/Madrid')).toBe(1);
  });
});

describe('plantillas', () => {
  const sender = { companyName: 'Reformas Prueba', legalName: 'Reformas Prueba SL', taxId: 'B12345678' };

  it('rellena las variables y limpia los valores', () => {
    const r = renderBody(
      { subject: 'Tu presupuesto de {{ titulo_presupuesto }}', body: 'Hola, {{nombre_cliente}}:\n\nRef. {{referencia}}' },
      { ...SAMPLE_VALUES, nombre_cliente: 'Ana\r\nBcc: otro@ejemplo.test', titulo_presupuesto: 'Baño\ncompleto', referencia: 'P-1' },
    );
    expect(r.subject).toBe('Tu presupuesto de Baño completo');
    expect(r.body).toBe('Hola, Ana Bcc: otro@ejemplo.test:\n\nRef. P-1');
  });

  it('no repite la firma cuando el remitente y la empresa coinciden', () => {
    const r = renderBody(DEFAULT_TEMPLATES[1]!, { ...SAMPLE_VALUES, empresa: 'Reformas Prueba', remitente: 'Reformas Prueba' });
    expect(r.body.endsWith('Un saludo,\nReformas Prueba')).toBe(true);
    const named = renderBody(DEFAULT_TEMPLATES[1]!, { ...SAMPLE_VALUES, empresa: 'Reformas Prueba', remitente: 'Laura' });
    expect(named.body.endsWith('Un saludo,\nLaura\nReformas Prueba')).toBe(true);
  });

  it('el HTML escapa el contenido y el pie legal identifica a la empresa con enlace de baja', () => {
    const m = composeMessage('Asunto', 'Hola, <script>alert(1)</script> & cía', sender, 'https://app.ejemplo.test/baja?token=xyz');
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; cía');
    expect(m.html).toContain('<a href="https://app.ejemplo.test/baja?token=xyz">');
    expect(m.text).toContain('Reformas Prueba SL · NIF B12345678');
    expect(m.text).toContain('puedes darte de baja aquí: https://app.ejemplo.test/baja?token=xyz');
  });

  it('rechaza variables desconocidas, llaves mal cerradas y asuntos de varias líneas', () => {
    expect(() => validateTemplate({ subject: 'Hola', body: 'Precio: {{importe}}' })).toThrow(/no es válida/);
    expect(() => validateTemplate({ subject: 'Hola {{nombre_cliente}', body: 'x' })).toThrow();
    expect(() => validateTemplate({ subject: 'Hola\nBcc: x', body: 'x' })).toThrow();
    expect(() => validateTemplate(DEFAULT_TEMPLATES[1]!)).not.toThrow();
  });

  it('las plantillas iniciales no mencionan precios, descuentos ni promesas', () => {
    expect(Object.keys(TEMPLATE_VARIABLES)).not.toContain('importe');
    for (const t of Object.values(DEFAULT_TEMPLATES)) {
      validateTemplate(t);
      expect(`${t.subject} ${t.body}`).not.toMatch(/€|precio|descuento|oferta|gratis|garantiz/i);
    }
  });
});

describe('detalle de errores sin datos personales', () => {
  it('oculta direcciones de email y recorta', () => {
    expect(sanitizeErrorDetail("'to' parameter is not a valid address: ana.perez@cliente.test")).toBe("'to' parameter is not a valid address: [email]");
    expect(sanitizeErrorDetail('x'.repeat(400))).toHaveLength(300);
  });
});

describe('adaptador de Mailgun contra un servidor HTTP local (no es Mailgun real)', () => {
  let server: http.Server;
  let base = '';
  const requests: Array<{ method: string; url: string; auth: string; form: URLSearchParams }> = [];
  let reply: { status: number; body: unknown } = { status: 200, body: {} };

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        requests.push({ method: req.method!, url: req.url!, auth: req.headers.authorization ?? '', form: new URLSearchParams(raw) });
        res.writeHead(reply.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(reply.body));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const provider = () => new MailgunProvider({ apiKey: 'clave-api-de-prueba', domain: 'mg.ejemplo.test', apiBase: base, webhookSigningKey: 'firma' });

  it('envía con el formato de la API de mensajes y devuelve el id sin < >', async () => {
    reply = { status: 200, body: { id: '<20261028.abc@mg.ejemplo.test>', message: 'Queued. Thank you.' } };
    const result = await provider().send(email());
    expect(result).toEqual({ ok: true, providerMessageId: '20261028.abc@mg.ejemplo.test' });
    const req = requests.at(-1)!;
    expect(req.method).toBe('POST');
    expect(req.url).toBe('/v3/mg.ejemplo.test/messages');
    expect(req.auth).toBe(`Basic ${Buffer.from('api:clave-api-de-prueba').toString('base64')}`);
    expect(req.form.get('to')).toBe('cliente@ejemplo.test');
    expect(req.form.get('h:Reply-To')).toBe('oficina@ejemplo.test');
    expect(req.form.get('h:List-Unsubscribe')).toBe('<https://api.ejemplo.test/api/v1/public/unsubscribe?token=abc>');
    expect(req.form.get('h:List-Unsubscribe-Post')).toBe('List-Unsubscribe=One-Click');
    expect(req.form.get('o:tracking')).toBe('no');
    expect(req.form.get('v:presupio_delivery_id')).toBe('7b7f4c1e-3d55-4c39-9a51-0f0f3f9b2a10');
  });

  it('clasifica los errores: límite y 5xx se reintentan; credenciales y rechazos no', async () => {
    reply = { status: 429, body: { message: 'Too many requests' } };
    expect(await provider().send(email())).toMatchObject({ ok: false, retryable: true, code: 'rate_limited' });
    reply = { status: 503, body: {} };
    expect(await provider().send(email())).toMatchObject({ ok: false, retryable: true, code: 'provider_503' });
    reply = { status: 401, body: { message: 'Forbidden' } };
    expect(await provider().send(email())).toMatchObject({ ok: false, retryable: false, code: 'provider_auth' });
    reply = { status: 400, body: { message: "'to' parameter is not a valid address: cliente@ejemplo.test" } };
    const rejected = await provider().send(email());
    expect(rejected).toEqual({ ok: false, retryable: false, code: 'rejected_400', detail: "'to' parameter is not a valid address: [email]" });
  });

  it('un fallo de red se reintenta', async () => {
    const offline = new MailgunProvider({ apiKey: 'k', domain: 'mg.ejemplo.test', apiBase: 'http://127.0.0.1:9' });
    expect(await offline.send(email())).toMatchObject({ ok: false, retryable: true, code: 'network_error' });
  });

  it('consulta el registro de eventos para reconciliar un envío de resultado desconocido', async () => {
    const id = '7b7f4c1e-3d55-4c39-9a51-0f0f3f9b2a10';
    const calledAt = new Date('2026-10-29T10:00:00Z');
    const lookup = () => provider().lookup({ deliveryId: id, recipient: 'cliente@ejemplo.test', calledAt });
    reply = { status: 200, body: { items: [{ event: 'accepted', 'user-variables': { presupio_delivery_id: id } }] } };
    expect(await lookup()).toBe('accepted');
    const req = requests.at(-1)!;
    expect(req.method).toBe('GET');
    const url = new URL(req.url, 'http://x');
    expect(url.pathname).toBe('/v3/mg.ejemplo.test/events');
    expect(url.searchParams.get('recipient')).toBe('cliente@ejemplo.test');
    expect(Number(url.searchParams.get('begin'))).toBe(calledAt.getTime() / 1000 - 120);
    reply = { status: 200, body: { items: [{ event: 'rejected', 'user-variables': { presupio_delivery_id: id } }] } };
    expect(await lookup()).toBe('rejected');
    // Eventos de OTROS envíos al mismo destinatario no cuentan.
    reply = { status: 200, body: { items: [{ event: 'delivered', 'user-variables': { presupio_delivery_id: 'otro' } }] } };
    expect(await lookup()).toBe('not_found');
    reply = { status: 500, body: {} };
    expect(await lookup()).toBe('not_found');
  });

  it('verifica la firma de los webhooks (HMAC-SHA256, tiempo y formato)', () => {
    const now = Date.now();
    const timestamp = String(Math.floor(now / 1000));
    const token = 'a'.repeat(50);
    const signature = createHmac('sha256', 'clave-firma').update(timestamp + token).digest('hex');
    expect(verifyMailgunSignature('clave-firma', { timestamp, token, signature }, now)).toBe(true);
    expect(verifyMailgunSignature('otra-clave', { timestamp, token, signature }, now)).toBe(false);
    expect(verifyMailgunSignature('clave-firma', { timestamp, token: 'b'.repeat(50), signature }, now)).toBe(false);
    expect(verifyMailgunSignature('clave-firma', { timestamp, token, signature }, now + 16 * 60_000)).toBe(false);
    expect(verifyMailgunSignature('clave-firma', { timestamp, token, signature: 'zz' }, now)).toBe(false);
  });
});

describe('adaptador SMTP contra un servidor SMTP local (intercambio real del protocolo)', () => {
  let server: SMTPServer;
  let port = 0;
  const received: Array<{ rcpt: string[]; raw: string }> = [];

  beforeAll(async () => {
    server = new SMTPServer({
      authOptional: true,
      disabledCommands: ['STARTTLS', 'AUTH'],
      logger: false,
      onRcptTo(address, _session, cb) {
        if (address.address.startsWith('noexiste')) return cb(Object.assign(new Error('Mailbox unavailable'), { responseCode: 550 }));
        if (address.address.startsWith('ocupado')) return cb(Object.assign(new Error('Try again later'), { responseCode: 451 }));
        cb();
      },
      onData(stream, session, cb) {
        let raw = '';
        stream.on('data', (c: Buffer) => (raw += c.toString()));
        stream.on('end', () => {
          received.push({ rcpt: session.envelope.rcptTo.map((r) => r.address), raw });
          cb();
        });
      },
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    port = (server.server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const provider = () => new SmtpProvider({ host: '127.0.0.1', port, secure: false });

  it('entrega el mensaje con Reply-To, baja de un clic e identificador propio', async () => {
    const result = await provider().send(email());
    expect(result).toEqual({ ok: true, providerMessageId: '7b7f4c1e-3d55-4c39-9a51-0f0f3f9b2a10@envios.ejemplo.test' });
    const msg = received.at(-1)!;
    expect(msg.rcpt).toEqual(['cliente@ejemplo.test']);
    expect(msg.raw).toMatch(/^Reply-To: oficina@ejemplo\.test/m);
    // La cabecera puede ir plegada en varias líneas (RFC 5322).
    expect(msg.raw).toMatch(/^List-Unsubscribe:\s+<https:\/\/api\.ejemplo\.test\/api\/v1\/public\/unsubscribe\?token=abc>/m);
    expect(msg.raw).toMatch(/^List-Unsubscribe-Post: List-Unsubscribe=One-Click/m);
    expect(msg.raw).toMatch(/^X-Presupio-Delivery: 7b7f4c1e-3d55-4c39-9a51-0f0f3f9b2a10/m);
  });

  it('un rechazo permanente (5xx) no se reintenta; uno temporal (4xx) sí', async () => {
    expect(await provider().send(email({ to: 'noexiste@ejemplo.test' }))).toMatchObject({ ok: false, retryable: false, code: 'smtp_550' });
    expect(await provider().send(email({ to: 'ocupado@ejemplo.test' }))).toMatchObject({ ok: false, retryable: true, code: 'smtp_451' });
  });
});

describe('email transaccional: tiempos máximos (P3)', () => {
  it('un servidor SMTP que acepta la conexión pero no responde no deja la petición colgada', async () => {
    const { SmtpMailer, SMTP_TIMEOUTS } = await import('../src/mail/mailer.js');
    expect(SMTP_TIMEOUTS).toEqual({ connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000 });
    // Servidor TCP mudo: acepta y nunca envía el saludo SMTP.
    const net = await import('node:net');
    const sockets: import('node:net').Socket[] = [];
    const silent = net.createServer((s) => sockets.push(s));
    await new Promise<void>((r) => silent.listen(0, '127.0.0.1', r));
    try {
      const port = (silent.address() as AddressInfo).port;
      const mailer = new SmtpMailer('Presupio <no-reply@ejemplo.test>', { host: '127.0.0.1', port, secure: false }, undefined, {
        connectionTimeout: 300,
        greetingTimeout: 300,
        socketTimeout: 300,
      });
      const started = Date.now();
      const result = await mailer.send({ template: 'prueba', to: 'ana@ejemplo.test', subject: 'x', text: 'x', html: '<p>x</p>' });
      expect(result.status).toBe('failed');
      expect(Date.now() - started).toBeLessThan(5_000);
    } finally {
      for (const s of sockets) s.destroy();
      await new Promise((r) => silent.close(r));
    }
  });
});
