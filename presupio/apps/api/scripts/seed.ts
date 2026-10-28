/**
 * Datos de demostración FICTICIOS para desarrollo local (útiles para la fase 2: frontend).
 * Usa la propia API, así que respeta todas las validaciones y reglas de negocio.
 */
import { randomBytes } from 'node:crypto';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db/database.js';
import { DisabledMailer } from '../src/mail/mailer.js';

const config = loadConfig();
if (config.env === 'production') {
  console.error('db:seed no se ejecuta en producción.');
  process.exit(1);
}
config.logLevel = 'silent';

const email = process.env.SEED_EMAIL ?? 'demo@presupio.test';
const password = process.env.SEED_PASSWORD ?? `Demo-${randomBytes(6).toString('base64url')}`;

const db = createDb(config.databaseUrl, 2);
const app = await buildApp({ config, db, mailer: new DisabledMailer() });
let cookie = '';

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, body?: unknown) {
  const res = await app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    ...(body ? { payload: JSON.stringify(body) } : {}),
  });
  const setCookie = res.headers['set-cookie'];
  if (setCookie) cookie = String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(';')[0]!;
  const json = res.body ? res.json() : undefined;
  if (res.statusCode >= 400) throw Object.assign(new Error(`${method} ${url} → ${res.statusCode} ${JSON.stringify(json)}`), { status: res.statusCode });
  return json;
}

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

try {
  try {
    await call('POST', '/auth/register', {
      fullName: 'Marta Demo',
      email,
      password,
      companyName: 'Reformas Demo SL',
      acceptTerms: true,
    });
  } catch (error) {
    if ((error as { status?: number }).status === 409) {
      console.log(`La cuenta ${email} ya existe: no se crean datos nuevos.`);
      process.exit(0);
    }
    throw error;
  }

  await call('PATCH', '/company', { legalName: 'Reformas Demo, S.L.', taxId: 'B00000000', phone: '+34910000000' });

  const quotes = [
    { title: 'Reforma integral de piso 90 m²', ref: 'P-2026-101', amount: 4_850_000, sent: 21, contact: ['Lucía Ficticia', 'lucia@cliente.test', '+34600000001'] },
    { title: 'Cocina abierta y suelo radiante', ref: 'P-2026-102', amount: 2_390_000, sent: 12, contact: ['Javier Inventado', 'javier@cliente.test', '+34600000002'] },
    { title: 'Baño completo con plato de ducha', ref: 'P-2026-103', amount: 890_000, sent: 9, contact: ['Comunidad Calle Falsa 123', 'admin@comunidad.test', null] },
    { title: 'Cambio de ventanas (aislamiento)', ref: 'P-2026-104', amount: 1_240_000, sent: 30, contact: ['Ana Ejemplo', 'ana@cliente.test', '+34600000004'] },
    { title: 'Reforma de local comercial', ref: 'P-2026-105', amount: 6_700_000, sent: 45, contact: ['Bar La Prueba', 'gerencia@bar.test', '+34600000005'] },
    { title: 'Pintura y alisado de paredes', ref: 'P-2026-106', amount: 320_000, sent: null, contact: ['Pedro Muestra', null, '+34600000006'] },
  ] as const;

  const ids: string[] = [];
  for (const q of quotes) {
    const [fullName, cEmail, phone] = q.contact;
    const res = await call('POST', '/quotes', {
      title: q.title,
      reference: q.ref,
      amountCents: q.amount,
      status: q.sent === null ? 'draft' : 'sent',
      ...(q.sent !== null ? { sentAt: daysAgo(q.sent) } : {}),
      contact: { fullName, ...(cEmail ? { email: cEmail } : {}), ...(phone ? { phone } : {}) },
    });
    ids.push(res.quote.id);
  }

  // P-101: seguimiento realizado → el cliente responde → acepta con contrato (venta recuperada).
  await call('POST', `/quotes/${ids[0]}/follow-ups`, { channel: 'phone', status: 'completed', outcome: 'left_message', completedAt: daysAgo(14) });
  await call('POST', `/quotes/${ids[0]}/status`, { status: 'responded', occurredAt: daysAgo(12), note: 'Pide ajustar acabados' });
  await call('POST', `/quotes/${ids[0]}/status`, { status: 'accepted', occurredAt: daysAgo(5), evidence: 'Contrato firmado nº DEMO-001', acceptedAmountCents: 4_700_000 });

  // P-102: seguimiento por email hecho, responde (oportunidad reactivada, sin venta todavía).
  await call('POST', `/quotes/${ids[1]}/follow-ups`, { channel: 'email', status: 'completed', outcome: 'contacted', completedAt: daysAgo(6) });
  await call('POST', `/quotes/${ids[1]}/status`, { status: 'responded', occurredAt: daysAgo(4) });

  // P-103: pendiente con seguimiento programado.
  await call('POST', `/quotes/${ids[2]}/follow-ups`, { channel: 'phone', dueAt: new Date(Date.now() + 86_400_000).toISOString(), notes: 'Llamar al administrador de la finca' });

  // P-104: rechazado tras seguimiento.
  await call('POST', `/quotes/${ids[3]}/follow-ups`, { channel: 'phone', status: 'completed', outcome: 'contacted', completedAt: daysAgo(20) });
  await call('POST', `/quotes/${ids[3]}/status`, { status: 'rejected', occurredAt: daysAgo(18), rejectionReason: 'Eligió otra empresa por precio' });

  // P-105: el cliente pidió no recibir más emails.
  const detail = await call('GET', `/quotes/${ids[4]}`);
  await call('POST', '/exclusions', { contactId: detail.quote.contact.id, channel: 'email', reason: 'opt_out_request', notes: 'Solicitado por teléfono' });

  console.log('Datos de demostración creados (todos ficticios).');
  console.log(`  Email:      ${email}`);
  console.log(`  Contraseña: ${password}${process.env.SEED_PASSWORD ? ' (SEED_PASSWORD)' : '  ← generada; guárdala, no se vuelve a mostrar'}`);
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await app.close();
  await db.destroy();
}
