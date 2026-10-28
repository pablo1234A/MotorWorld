import { describe, expect, it } from 'vitest';
import { createQuote, createTestApp, registerAccount, uniqueEmail } from './helpers.js';

const { app } = await createTestApp();
const acc = await registerAccount(app);
const c = acc.client;

describe('presupuestos: CRUD', () => {
  it('crea un presupuesto con contacto nuevo, propietario por defecto y estado enviado', async () => {
    const email = uniqueEmail('cliente');
    const res = await c.post('/quotes', {
      title: 'Reforma de baño',
      reference: 'P-2026-001',
      amountCents: 950_000,
      validUntil: '2099-12-31',
      contact: { fullName: 'Laura Cliente', email, phone: '600 11 22 33' },
    });
    expect(res.status).toBe(201);
    const q = res.body.quote;
    expect(q).toMatchObject({
      title: 'Reforma de baño',
      reference: 'P-2026-001',
      amountCents: 950_000,
      currency: 'EUR',
      status: 'sent',
      validUntil: '2099-12-31',
      contact: { fullName: 'Laura Cliente', email, phone: '600112233' },
      owner: { id: acc.userId },
      outcome: { responded: false, reactivated: false, recoveredSale: false },
    });
    expect(q.sentAt).toBeTruthy();

    // Mismo email → se reutiliza el contacto, sin duplicados.
    const second = await c.post('/quotes', { title: 'Segunda obra', contact: { fullName: 'Laura C.', email } });
    expect(second.body.quote.contact.id).toBe(q.contact.id);

    const dup = await c.post('/quotes', { title: 'Duplicado', reference: 'P-2026-001', contactId: q.contact.id });
    expect(dup.status).toBe(409);
  });

  it('lista, filtra, busca y pagina', async () => {
    const own = await registerAccount(app);
    for (let i = 0; i < 5; i++) await createQuote(own.client, { title: `Obra ${i}` });
    await createQuote(own.client, { title: 'Borrador cocina', status: 'draft' });

    const page1 = await own.client.get('/quotes?limit=4');
    expect(page1.body.items).toHaveLength(4);
    expect(page1.body.nextCursor).toBeTruthy();
    const page2 = await own.client.get(`/quotes?limit=4&cursor=${page1.body.nextCursor}`);
    expect(page2.body.items).toHaveLength(2);
    expect(page2.body.nextCursor).toBeNull();
    const ids = [...page1.body.items, ...page2.body.items].map((q: { id: string }) => q.id);
    expect(new Set(ids).size).toBe(6);

    const drafts = await own.client.get('/quotes?status=draft');
    expect(drafts.body.items.map((q: { title: string }) => q.title)).toEqual(['Borrador cocina']);
    const search = await own.client.get('/quotes?q=cocina');
    expect(search.body.items).toHaveLength(1);
    // Los comodines de LIKE se tratan como texto literal.
    expect((await own.client.get('/quotes?q=%25')).body.items).toHaveLength(0);
  });

  it('actualiza campos permitidos y rechaza campos protegidos', async () => {
    const q = await createQuote(c);
    const ok = await c.patch(`/quotes/${q.id}`, { title: 'Título nuevo', amountCents: 1_000_000 });
    expect(ok.status).toBe(200);
    expect(ok.body.quote).toMatchObject({ title: 'Título nuevo', amountCents: 1_000_000 });

    for (const body of [{ status: 'accepted' }, { reactivatedAt: new Date().toISOString() }, { acceptedAt: new Date().toISOString() }, { companyId: acc.companyId }]) {
      const res = await c.patch(`/quotes/${q.id}`, body);
      expect(res.status).toBe(400);
    }
    expect((await c.get(`/quotes/${q.id}`)).body.quote.status).toBe('sent');
  });

  it('archiva y desarchiva; un archivado no se edita', async () => {
    const q = await createQuote(c);
    await c.post(`/quotes/${q.id}/follow-ups`, { channel: 'phone' });
    const arch = await c.post(`/quotes/${q.id}/archive`);
    expect(arch.status).toBe(200);
    expect(arch.body.cancelledFollowUps).toBe(1);
    expect((await c.patch(`/quotes/${q.id}`, { title: 'X' })).status).toBe(409);
    expect((await c.get('/quotes?archived=true')).body.items.map((x: { id: string }) => x.id)).toContain(q.id);
    expect((await c.post(`/quotes/${q.id}/unarchive`)).status).toBe(200);
  });
});

describe('presupuestos: estados', () => {
  it('borrador → enviado fija la fecha de envío', async () => {
    const q = await createQuote(c, { status: 'draft' });
    expect(q.sentAt).toBeNull();
    const res = await c.post(`/quotes/${q.id}/status`, { status: 'sent' });
    expect(res.status).toBe(200);
    expect(res.body.quote.sentAt).toBeTruthy();
  });

  it('rechaza transiciones no permitidas', async () => {
    const q = await createQuote(c, { status: 'draft' });
    const res = await c.post(`/quotes/${q.id}/status`, { status: 'accepted', evidence: 'Contrato' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('una respuesta sin seguimiento previo NO es una oportunidad reactivada', async () => {
    const q = await createQuote(c);
    const res = await c.post(`/quotes/${q.id}/status`, { status: 'responded' });
    expect(res.body.quote.outcome).toEqual({ responded: true, reactivated: false, recoveredSale: false });
    expect(res.body.reactivated).toBe(false);
  });

  it('respuesta tras un seguimiento → reactivada; aceptación con evidencia → venta recuperada', async () => {
    const q = await createQuote(c);
    // Seguimiento realizado y registrado.
    const fu = await c.post(`/quotes/${q.id}/follow-ups`, { channel: 'phone', status: 'completed', outcome: 'left_message' });
    expect(fu.status).toBe(201);
    // Otro seguimiento pendiente que debe detenerse al responder el cliente.
    await c.post(`/quotes/${q.id}/follow-ups`, { channel: 'email' });
    // Una tarea interna no se detiene con la respuesta.
    await c.post(`/quotes/${q.id}/follow-ups`, { channel: 'task', title: 'Preparar contrato' });

    const responded = await c.post(`/quotes/${q.id}/status`, { status: 'responded' });
    expect(responded.body.reactivated).toBe(true);
    expect(responded.body.cancelledFollowUps).toBe(1);
    expect(responded.body.quote.outcome).toEqual({ responded: true, reactivated: true, recoveredSale: false });

    // Aceptar exige evidencia.
    const noEvidence = await c.post(`/quotes/${q.id}/status`, { status: 'accepted' });
    expect(noEvidence.status).toBe(400);

    const accepted = await c.post(`/quotes/${q.id}/status`, { status: 'accepted', evidence: 'Contrato firmado nº 45', acceptedAmountCents: 1_800_000 });
    expect(accepted.status).toBe(200);
    expect(accepted.body.quote.outcome.recoveredSale).toBe(true);
    expect(accepted.body.quote.acceptance).toMatchObject({
      evidence: 'Contrato firmado nº 45',
      amountCents: 1_800_000,
      amountSource: 'declared_by_company',
      confirmedByUserId: acc.userId,
    });

    // Aceptado es definitivo para un usuario normal; ya no admite seguimientos.
    const after = await c.post(`/quotes/${q.id}/follow-ups`, { channel: 'phone' });
    expect(after.status).toBe(409);

    const history = await c.get(`/quotes/${q.id}/activity`);
    const actions = history.body.items.map((e: { action: string }) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['quote.created', 'follow_up.logged', 'quote.status_changed']));
  });

  it('un rechazo tras seguimiento cuenta como respuesta pero no como reactivación', async () => {
    const q = await createQuote(c);
    await c.post(`/quotes/${q.id}/follow-ups`, { channel: 'phone', status: 'completed', outcome: 'contacted' });
    const res = await c.post(`/quotes/${q.id}/status`, { status: 'rejected', rejectionReason: 'Precio' });
    expect(res.body.quote.outcome).toEqual({ responded: true, reactivated: false, recoveredSale: false });
    expect(res.body.quote.rejectionReason).toBe('Precio');
  });

  it('el propietario puede corregir un estado final', async () => {
    const q = await createQuote(c);
    await c.post(`/quotes/${q.id}/status`, { status: 'rejected' });
    const res = await c.post(`/quotes/${q.id}/status`, { status: 'responded', note: 'Rechazo registrado por error' });
    expect(res.status).toBe(200);
    expect(res.body.quote.rejectedAt).toBeNull();
  });

  it('no acepta fechas futuras ni anteriores al envío', async () => {
    const q = await createQuote(c);
    const future = await c.post(`/quotes/${q.id}/status`, { status: 'responded', occurredAt: '2999-01-01T00:00:00Z' });
    expect(future.status).toBe(400);
    const before = await c.post(`/quotes/${q.id}/status`, { status: 'responded', occurredAt: '2000-01-01T00:00:00Z' });
    expect(before.status).toBe(400);
  });

  it('resumen para el panel', async () => {
    const own = await registerAccount(app);
    const q = await createQuote(own.client);
    await own.client.post(`/quotes/${q.id}/follow-ups`, { channel: 'phone', status: 'completed' });
    await own.client.post(`/quotes/${q.id}/status`, { status: 'accepted', evidence: 'Pedido confirmado' });
    await createQuote(own.client);
    const s = (await own.client.get('/quotes/summary')).body.summary;
    expect(s.byStatus).toEqual({ draft: 0, sent: 1, responded: 0, accepted: 1, rejected: 0 });
    expect(s).toMatchObject({ reactivated: 1, recoveredSales: 1, recoveredAmountCents: 1_850_000, recoveredAmountSource: 'declared_by_company' });
  });
});

describe('seguimientos y tareas', () => {
  it('crea, edita, completa y cancela', async () => {
    const q = await createQuote(c);
    const created = await c.post(`/quotes/${q.id}/follow-ups`, { channel: 'phone', dueAt: '2099-01-01T09:00:00Z', notes: 'Preguntar por la financiación' });
    expect(created.status).toBe(201);
    const fu = created.body.followUp;
    expect(fu).toMatchObject({ status: 'pending', title: 'Llamada de seguimiento', assignedUser: { id: acc.userId }, quote: { id: q.id } });

    expect((await c.patch(`/follow-ups/${fu.id}`, { title: 'Llamar a Laura' })).body.followUp.title).toBe('Llamar a Laura');
    const done = await c.post(`/follow-ups/${fu.id}/complete`, { outcome: 'no_answer' });
    expect(done.body.followUp).toMatchObject({ status: 'completed', outcome: 'no_answer', completedByUserId: acc.userId });
    expect((await c.get(`/quotes/${q.id}`)).body.quote.lastFollowUpAt).toBeTruthy();
    // No se completa dos veces.
    expect((await c.post(`/follow-ups/${fu.id}/complete`, {})).status).toBe(409);

    const other = (await c.post(`/quotes/${q.id}/follow-ups`, { channel: 'email' })).body.followUp;
    const cancelled = await c.post(`/follow-ups/${other.id}/cancel`, { reason: 'Ya no aplica' });
    expect(cancelled.body.followUp).toMatchObject({ status: 'cancelled', cancelReason: 'Ya no aplica' });

    const mine = await c.get('/follow-ups?assignedTo=me&status=all');
    expect(mine.body.items.length).toBeGreaterThanOrEqual(2);
  });

  it('no permite contactar con el cliente de un presupuesto en borrador (sí tareas internas)', async () => {
    const q = await createQuote(c, { status: 'draft' });
    expect((await c.post(`/quotes/${q.id}/follow-ups`, { channel: 'phone' })).status).toBe(409);
    expect((await c.post(`/quotes/${q.id}/follow-ups`, { channel: 'task', title: 'Revisar mediciones' })).status).toBe(201);
  });
});

describe('exclusiones (no contactar)', () => {
  it('detiene seguimientos pendientes e impide crear nuevos por el canal excluido', async () => {
    const q = await createQuote(c);
    await c.post(`/quotes/${q.id}/follow-ups`, { channel: 'email' });
    await c.post(`/quotes/${q.id}/follow-ups`, { channel: 'phone' });

    const ex = await c.post('/exclusions', { contactId: q.contact.id, channel: 'email', reason: 'opt_out_request', notes: 'Pidió por teléfono no recibir emails' });
    expect(ex.status).toBe(201);
    expect(ex.body.cancelledFollowUps).toBe(1);

    const blocked = await c.post(`/quotes/${q.id}/follow-ups`, { channel: 'email' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('CONTACT_EXCLUDED');
    // Otros canales siguen permitidos.
    expect((await c.post(`/quotes/${q.id}/follow-ups`, { channel: 'phone' })).status).toBe(201);

    // Levantar la exclusión (propietario/administrador) exige motivo.
    expect((await c.post(`/exclusions/${ex.body.exclusion.id}/lift`, {})).status).toBe(400);
    expect((await c.post(`/exclusions/${ex.body.exclusion.id}/lift`, { reason: 'Nos pidió volver a recibirlos' })).status).toBe(200);
    expect((await c.post(`/quotes/${q.id}/follow-ups`, { channel: 'email' })).status).toBe(201);
  });

  it('una exclusión por email afecta a cualquier contacto con ese email y a todos los canales', async () => {
    const email = uniqueEmail('baja');
    const q = await createQuote(c, { contact: { fullName: 'Baja Total', email } });
    await c.post('/exclusions', { email, reason: 'opt_out_request' });
    for (const channel of ['email', 'phone', 'whatsapp', 'sms', 'in_person']) {
      expect((await c.post(`/quotes/${q.id}/follow-ups`, { channel })).status, channel).toBe(409);
    }
  });
});

describe('contactos', () => {
  it('crea, consulta con sus presupuestos y actualiza', async () => {
    const created = await c.post('/contacts', { fullName: 'Pedro Ficticio', phone: '+34 611 22 33 44' });
    expect(created.status).toBe(201);
    expect(created.body.contact.phone).toBe('+34611223344');
    const id = created.body.contact.id;
    await c.post('/quotes', { title: 'Obra Pedro', contactId: id });
    const detail = await c.get(`/contacts/${id}`);
    expect(detail.body.quotes).toHaveLength(1);
    const upd = await c.patch(`/contacts/${id}`, { organization: 'Comunidad de vecinos' });
    expect(upd.body.contact.organization).toBe('Comunidad de vecinos');
    // No se puede dejar sin email ni teléfono.
    expect((await c.patch(`/contacts/${id}`, { phone: null })).status).toBe(400);
  });
});
