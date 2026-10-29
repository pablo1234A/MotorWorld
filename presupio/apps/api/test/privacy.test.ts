import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { dispatchCompany, planCompany, type EngineDeps } from '../src/automation/engine.js';
import { FakeProvider } from './fake-provider.js';
import { addMember, createQuote, createTestApp, registerAccount, uniqueEmail, verifyEmail, type RegisteredAccount } from './helpers.js';

/*
 * P1-03: supresión (anonimización) de los datos de un contacto o de un presupuesto.
 * Se comprueba qué se borra, qué se conserva (intentos facturados, métricas, exclusiones
 * activas), los permisos, el aislamiento y que el motor no vuelve a usar esos datos.
 */

const DAY = 86_400_000;
const fake = new FakeProvider('privacidad');
const { app, db, config, mailer } = await createTestApp(
  (c) => {
    c.automation.fromEmail = 'seguimiento@envios.ejemplo.test';
  },
  { followUpProvider: fake },
);
const owner = new pg.Pool({ connectionString: process.env.TEST_MIGRATION_DATABASE_URL, max: 2 });
afterAll(() => owner.end());
const deps = (now = new Date()): EngineDeps => ({ db, config, provider: fake, now: () => now });

async function automated(acc: RegisteredAccount, approval = false) {
  await verifyEmail(app, mailer, acc);
  await acc.client.patch('/company/settings', {
    allowedWeekdays: [1, 2, 3, 4, 5, 6, 7],
    contactWindowStart: '00:00',
    contactWindowEnd: '23:59',
    requireManualApproval: approval,
    legalBasisNote: 'Clientes que han pedido presupuesto (interés legítimo).',
    replyToEmail: 'oficina@ejemplo.test',
  });
  expect((await acc.client.post('/automation/enable', { confirmLegalBasis: true })).status).toBe(200);
}

/** Un cliente con historia completa: email automático enviado, nota, venta con evidencia, paso aprobado. */
async function clientWithHistory(acc: RegisteredAccount) {
  const email = uniqueEmail('ana.cliente');
  const q1 = await createQuote(acc.client, {
    title: 'Reforma baño',
    sentAt: new Date(Date.now() - 3 * DAY - 3_600_000).toISOString(),
    contact: { fullName: 'Ana Privada Pérez', email, phone: '+34611222333', organization: 'Casa Ana' },
  });
  await planCompany(deps(), acc.companyId);
  expect(await dispatchCompany(deps(), acc.companyId)).toMatchObject({ sent: 1 });
  const q2 = await createQuote(acc.client, { title: 'Cocina', contactId: q1.contact.id, contact: undefined });
  await acc.client.post(`/quotes/${q2.id}/follow-ups`, { channel: 'phone', title: 'Llamar', notes: 'Ana prefiere que la llamen tarde, DNI 12345678Z' });
  expect((await acc.client.post(`/quotes/${q2.id}/status`, { status: 'accepted', evidence: 'Contrato firmado por Ana Privada', note: 'Nota con datos de Ana' })).status).toBe(200);
  // Un paso automático aprobado (instantánea con el nombre del cliente) para otro presupuesto suyo.
  await owner.query("UPDATE company_settings SET require_manual_approval = true WHERE company_id = $1", [acc.companyId]);
  const q3 = await createQuote(acc.client, { title: 'Terraza', contactId: q1.contact.id, contact: undefined, sentAt: new Date(Date.now() - 3 * DAY - 3_600_000).toISOString() });
  await planCompany(deps(), acc.companyId);
  const [pending] = (await acc.client.get(`/quotes/${q3.id}/follow-ups?status=all`)).body.items;
  expect((await acc.client.post(`/follow-ups/${pending.id}/approve`)).status).toBe(200);
  await acc.client.post('/exclusions', { contactId: q1.contact.id, channel: 'whatsapp', reason: 'opt_out_request', notes: 'Lo pidió Ana por teléfono' });
  return { email, contactId: q1.contact.id as string, quotes: [q1, q2, q3] };
}

describe('supresión de un contacto (anonimización)', () => {
  it('exige permiso, confirmación expresa y pertenecer a la empresa', async () => {
    const acc = await registerAccount(app);
    const q = await createQuote(acc.client);
    const member = await addMember(app, acc, 'member');
    const other = await registerAccount(app);
    expect((await member.client.post(`/contacts/${q.contact.id}/anonymize`, { confirm: 'ANONIMIZAR' })).status).toBe(403);
    expect((await other.client.post(`/contacts/${q.contact.id}/anonymize`, { confirm: 'ANONIMIZAR' })).status).toBe(404);
    expect((await acc.client.post(`/contacts/${q.contact.id}/anonymize`, {})).status).toBe(400);
    expect((await acc.client.post(`/contacts/${q.contact.id}/anonymize`, { confirm: 'si' })).status).toBe(400);
    expect((await acc.client.get(`/contacts/${q.contact.id}`)).status).toBe(200); // nada cambió
  });

  it('borra los datos personales en todas partes, conserva lo necesario y el motor ya no los usa', async () => {
    const acc = await registerAccount(app);
    await automated(acc);
    const { email, contactId, quotes } = await clientWithHistory(acc);
    const usageBefore = (await acc.client.get('/usage')).body.usage.attempts.used;
    const res = await acc.client.post(`/contacts/${contactId}/anonymize`, { confirm: 'ANONIMIZAR' });
    expect(res.status).toBe(200);
    expect(res.body.anonymized).toMatchObject({ quotes: 3 });
    expect(res.body.anonymized.cancelledFollowUps).toBeGreaterThanOrEqual(1);

    // Ningún rastro en la exportación completa de la empresa, salvo la exclusión activa.
    const full = (await acc.client.get('/company/export')).body;
    const exported = JSON.stringify({ ...full, exclusions: null });
    for (const secret of ['Ana Privada', email, '611222333', 'Casa Ana', '12345678Z', 'Contrato firmado por Ana', 'Nota con datos de Ana', 'Lo pidió Ana']) {
      expect(exported, secret).not.toContain(secret);
    }
    // La exclusión activa (WhatsApp) conserva solo el teléfono, que es lo que necesita para
    // seguir respetando la baja; ni email ni notas.
    const activeExclusion = full.exclusions.items.find((e: { contactId: string }) => e.contactId === contactId);
    expect(activeExclusion).toMatchObject({ channel: 'whatsapp', email: null, phone: '+34611222333', notes: null });
    const c = (await owner.query('SELECT full_name, email, phone, organization, notes, anonymized_at FROM contacts WHERE id = $1', [contactId])).rows[0];
    expect(c).toMatchObject({ full_name: 'Contacto anonimizado', email: null, phone: null, organization: null, notes: null });
    expect(c.anonymized_at).toBeTruthy();
    const deliveries = (await owner.query('SELECT recipient, subject, body_text FROM message_deliveries WHERE quote_id = ANY($1)', [quotes.map((q) => q.id)])).rows;
    expect(deliveries.length).toBeGreaterThan(0);
    expect(deliveries.every((d) => d.recipient === '[suprimido]' && d.subject === null && d.body_text === null)).toBe(true);
    // Se conserva: el intento facturado, la exclusión activa (para respetar la baja) y las filas.
    expect((await acc.client.get('/usage')).body.usage.attempts.used).toBe(usageBefore);
    expect((await owner.query("SELECT count(*)::int n FROM attempt_events WHERE quote_id = ANY($1) AND status = 'counted'", [quotes.map((q) => q.id)])).rows[0].n).toBe(1);
    const excl = (await owner.query('SELECT lifted_at, notes FROM contact_exclusions WHERE contact_id = $1', [contactId])).rows;
    expect(excl).toEqual([{ lifted_at: null, notes: null }]);

    // La API ya no lo muestra; sus presupuestos siguen, sin nombre del cliente.
    expect((await acc.client.get(`/contacts/${contactId}`)).status).toBe(404);
    expect((await acc.client.get('/contacts?limit=100')).body.items.some((i: { id: string }) => i.id === contactId)).toBe(false);
    expect((await acc.client.get(`/quotes/${quotes[0]!.id}`)).body.quote.contact.fullName).toBe('Contacto anonimizado');
    expect((await acc.client.post(`/contacts/${contactId}/anonymize`, { confirm: 'ANONIMIZAR' })).status).toBe(404);

    // El motor no programa ni envía nada a esa persona.
    fake.sent.length = 0;
    await owner.query('UPDATE company_settings SET require_manual_approval = false WHERE company_id = $1', [acc.companyId]);
    const later = new Date(Date.now() + 6 * DAY);
    await planCompany(deps(later), acc.companyId);
    await dispatchCompany(deps(later), acc.companyId);
    expect(fake.sentTo(email)).toHaveLength(0);
    expect(fake.sent.filter((m) => m.to === '[suprimido]')).toHaveLength(0);
    const log = (await acc.client.get('/activity')).body.items.map((a: { action: string }) => a.action);
    expect(log).toContain('contact.anonymized');
    await acc.client.post('/automation/disable');
  });

  it('se puede atender aunque la cuenta esté en solo lectura', async () => {
    const acc = await registerAccount(app);
    const q = await createQuote(acc.client);
    await owner.query("UPDATE subscriptions SET trial_ends_at = now() - interval '1 hour' WHERE company_id = $1", [acc.companyId]);
    expect((await acc.client.post('/quotes', { title: 'x', contact: { fullName: 'y', phone: '+34600000000' } })).status).toBe(403);
    expect((await acc.client.post(`/contacts/${q.contact.id}/anonymize`, { confirm: 'ANONIMIZAR' })).status).toBe(200);
    expect((await acc.client.post(`/quotes/${q.id}/erase`, { confirm: 'ELIMINAR' })).status).toBe(200);
  });
});

describe('eliminación de un presupuesto', () => {
  it('exige permiso y confirmación, suprime sus datos, lo oculta y conserva lo facturado', async () => {
    const acc = await registerAccount(app);
    await automated(acc);
    const q = await createQuote(acc.client, { title: 'Ático de la familia García', reference: 'REF-GARCIA', description: 'Planos de la casa de los García', sentAt: new Date(Date.now() - 3 * DAY - 3_600_000).toISOString() });
    await planCompany(deps(), acc.companyId);
    await dispatchCompany(deps(), acc.companyId);
    await planCompany(deps(new Date(Date.now() + 4 * DAY)), acc.companyId); // paso 2 pendiente
    const member = await addMember(app, acc, 'member');
    const other = await registerAccount(app);
    expect((await member.client.post(`/quotes/${q.id}/erase`, { confirm: 'ELIMINAR' })).status).toBe(403);
    expect((await other.client.post(`/quotes/${q.id}/erase`, { confirm: 'ELIMINAR' })).status).toBe(404);
    expect((await acc.client.post(`/quotes/${q.id}/erase`, { confirm: 'eliminar' })).status).toBe(400);
    const used = (await acc.client.get('/usage')).body.usage.attempts.used;

    const res = await acc.client.post(`/quotes/${q.id}/erase`, { confirm: 'ELIMINAR' });
    expect(res.status).toBe(200);
    expect(res.body.erased.cancelledFollowUps).toBe(1);
    expect((await acc.client.get(`/quotes/${q.id}`)).status).toBe(404);
    expect((await acc.client.patch(`/quotes/${q.id}`, { title: 'x' })).status).toBe(404);
    expect((await acc.client.post(`/quotes/${q.id}/status`, { status: 'responded' })).status).toBe(404);
    expect((await acc.client.post(`/quotes/${q.id}/erase`, { confirm: 'ELIMINAR' })).status).toBe(404);
    expect((await acc.client.get('/quotes?limit=100')).body.items).toHaveLength(0);
    expect((await acc.client.get('/follow-ups?status=all')).body.items).toHaveLength(0);
    const exported = JSON.stringify((await acc.client.get('/company/export')).body);
    for (const secret of ['García', 'REF-GARCIA', 'Planos']) expect(exported, secret).not.toContain(secret);
    expect(exported).toContain('Presupuesto eliminado');
    // Lo facturado se conserva y no se puede reducir borrando presupuestos.
    expect((await acc.client.get('/usage')).body.usage.attempts.used).toBe(used);
    fake.sent.length = 0;
    await dispatchCompany(deps(new Date(Date.now() + 5 * DAY)), acc.companyId);
    expect(fake.sentTo(q.contact.email)).toHaveLength(0);
    await acc.client.post('/automation/disable');
  });
});
