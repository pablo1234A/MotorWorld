import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { withTenant } from '../src/db/database.js';
import { createQuote, createTestApp, registerAccount } from './helpers.js';

const { app, db } = await createTestApp();

// Dos empresas independientes con datos propios.
const a = await registerAccount(app, 'Empresa A Reformas');
const b = await registerAccount(app, 'Empresa B Reformas');
const quoteA = await createQuote(a.client);
const followUpA = (await a.client.post(`/quotes/${quoteA.id}/follow-ups`, { channel: 'phone', title: 'Llamar' })).body.followUp;
const exclusionA = (await a.client.post('/exclusions', { email: 'no-molestar@ejemplo.test', reason: 'opt_out_request' })).body.exclusion;
const quoteB = await createQuote(b.client);

describe('aislamiento entre empresas a través de la API', () => {
  it('B no ve los presupuestos, contactos, seguimientos ni actividad de A en los listados', async () => {
    const quotes = await b.client.get('/quotes?archived=all&limit=100');
    expect(quotes.body.items.map((q: { id: string }) => q.id)).toEqual([quoteB.id]);

    const contacts = await b.client.get('/contacts?limit=100');
    expect(contacts.body.items.map((c: { id: string }) => c.id)).toEqual([quoteB.contact.id]);

    const followUps = await b.client.get('/follow-ups?status=all&limit=100');
    expect(followUps.body.items).toEqual([]);

    const exclusions = await b.client.get('/exclusions?status=all');
    expect(exclusions.body.items).toEqual([]);

    const activity = await b.client.get('/activity?limit=100');
    expect(activity.body.items.every((e: { entityId: string | null }) => e.entityId !== quoteA.id)).toBe(true);

    const summary = await b.client.get('/quotes/summary');
    expect(summary.body.summary.byStatus.sent).toBe(1);

    const members = await b.client.get('/members');
    expect(members.body.items.map((m: { userId: string }) => m.userId)).toEqual([b.userId]);
  });

  it('B recibe 404 (no 403) al pedir por id recursos de A', async () => {
    const urls = [
      `/quotes/${quoteA.id}`,
      `/quotes/${quoteA.id}/activity`,
      `/quotes/${quoteA.id}/follow-ups`,
      `/contacts/${quoteA.contact.id}`,
      `/follow-ups/${followUpA.id}`,
    ];
    for (const url of urls) {
      const res = await b.client.get(url);
      expect(res.status, url).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
  });

  it('B no puede modificar recursos de A', async () => {
    const attempts = [
      b.client.patch(`/quotes/${quoteA.id}`, { title: 'Hackeado' }),
      b.client.post(`/quotes/${quoteA.id}/status`, { status: 'rejected' }),
      b.client.post(`/quotes/${quoteA.id}/archive`),
      b.client.post(`/quotes/${quoteA.id}/follow-ups`, { channel: 'task' }),
      b.client.patch(`/contacts/${quoteA.contact.id}`, { fullName: 'Hackeado' }),
      b.client.post(`/follow-ups/${followUpA.id}/complete`, {}),
      b.client.post(`/follow-ups/${followUpA.id}/cancel`, {}),
      b.client.patch(`/follow-ups/${followUpA.id}`, { title: 'Hackeado' }),
      b.client.post(`/exclusions/${exclusionA.id}/lift`, { reason: 'Quiero contactar' }),
      b.client.patch(`/members/${a.userId}`, { role: 'viewer' }),
      b.client.delete(`/members/${a.userId}`),
    ];
    for (const res of await Promise.all(attempts)) expect([403, 404]).toContain(res.status);

    const check = await a.client.get(`/quotes/${quoteA.id}`);
    expect(check.body.quote.title).not.toBe('Hackeado');
    expect(check.body.quote.status).toBe('sent');
    expect(check.body.quote.archivedAt).toBeNull();
    const fu = await a.client.get(`/follow-ups/${followUpA.id}`);
    expect(fu.body.followUp.status).toBe('pending');
  });

  it('B no puede enlazar su presupuesto a un contacto o usuario de A', async () => {
    const withForeignContact = await b.client.post('/quotes', { title: 'Robo de contacto', contactId: quoteA.contact.id });
    expect(withForeignContact.status).toBe(404);

    const changeContact = await b.client.patch(`/quotes/${quoteB.id}`, { contactId: quoteA.contact.id });
    expect(changeContact.status).toBe(404);

    const foreignOwner = await b.client.patch(`/quotes/${quoteB.id}`, { ownerUserId: a.userId });
    expect(foreignOwner.status).toBe(400);

    const foreignAssignee = await b.client.post(`/quotes/${quoteB.id}/follow-ups`, { channel: 'task', assignedUserId: a.userId });
    expect(foreignAssignee.status).toBe(400);
  });

  it('enviar companyId en el cuerpo no cambia de empresa (campo rechazado)', async () => {
    const res = await b.client.post('/quotes', {
      title: 'Intento',
      companyId: a.companyId,
      contact: { fullName: 'X', email: 'x@ejemplo.test' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d: { path: string; message: string }) => /companyId|reconocid|desconocid/i.test(d.message + d.path))).toBe(true);
  });

  it('cambiar de empresa solo es posible hacia empresas de las que se es miembro', async () => {
    const res = await b.client.post('/auth/switch-company', { companyId: a.companyId });
    expect(res.status).toBe(404);
    expect((await b.client.get('/me')).body.company.id).toBe(b.companyId);
  });
});

describe('aislamiento en la base de datos (Row-Level Security)', () => {
  it('sin empresa activa, el rol de la aplicación no ve ninguna fila', async () => {
    const counts = await db.transaction().execute(async (trx) => {
      const tables = ['companies', 'memberships', 'quotes', 'contacts', 'follow_ups', 'activity_log', 'subscriptions', 'company_settings'];
      const out: Record<string, number> = {};
      for (const t of tables) {
        const r = await sql<{ n: string }>`select count(*) as n from ${sql.table(t)}`.execute(trx);
        out[t] = Number(r.rows[0]!.n);
      }
      return out;
    });
    for (const [table, n] of Object.entries(counts)) expect(n, table).toBe(0);
  });

  it('con la empresa B activa, una consulta sin filtro no devuelve datos de A', async () => {
    const rows = await withTenant(db, { companyId: b.companyId, userId: b.userId }, (trx) =>
      trx.selectFrom('quotes').select(['id', 'companyId']).execute(),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.companyId === b.companyId)).toBe(true);
  });

  it('con la empresa B activa no se pueden insertar ni modificar filas de A', async () => {
    await expect(
      withTenant(db, { companyId: b.companyId, userId: b.userId }, (trx) =>
        trx
          .insertInto('contacts')
          .values({
            companyId: a.companyId,
            fullName: 'Inyectado',
            email: 'inyectado@ejemplo.test',
            phone: null,
            organization: null,
            preferredChannel: null,
            notes: null,
            createdByUserId: null,
          })
          .execute(),
      ),
    ).rejects.toThrow(/row-level security/);

    const updated = await withTenant(db, { companyId: b.companyId, userId: b.userId }, (trx) =>
      trx.updateTable('quotes').set({ title: 'Hackeado' }).where('id', '=', quoteA.id).executeTakeFirst(),
    );
    expect(Number(updated.numUpdatedRows)).toBe(0);
  });

  it('el rol de la aplicación no puede desactivar RLS ni borrar el historial', async () => {
    await expect(sql`alter table quotes disable row level security`.execute(db)).rejects.toThrow(/must be owner|permission denied/);
    await expect(
      withTenant(db, { companyId: a.companyId, userId: a.userId }, (trx) => trx.deleteFrom('activityLog').execute()),
    ).rejects.toThrow(/permission denied/);
  });

  it('la base de datos impide enlazar un presupuesto con un contacto de otra empresa', async () => {
    // Segunda barrera independiente de RLS: la clave foránea compuesta (company_id, contact_id).
    await expect(
      withTenant(db, { companyId: b.companyId, userId: b.userId }, (trx) =>
        trx.updateTable('quotes').set({ contactId: quoteA.contact.id }).where('id', '=', quoteB.id).execute(),
      ),
    ).rejects.toThrow(/quotes_contact_fk/);
  });
});
