import { describe, expect, it } from 'vitest';
import { addMember, Client, createQuote, createTestApp, registerAccount, TEST_PASSWORD, tokenFromMail, uniqueEmail } from './helpers.js';

const { app, db, mailer } = await createTestApp();
const owner = await registerAccount(app);
const admin = await addMember(app, owner, 'admin');
const member = await addMember(app, owner, 'member');
const viewer = await addMember(app, owner, 'viewer');
const quote = await createQuote(owner.client);

describe('roles', () => {
  it('el lector (viewer) solo puede leer', async () => {
    expect((await viewer.client.get('/quotes')).status).toBe(200);
    expect((await viewer.client.get(`/quotes/${quote.id}`)).status).toBe(200);
    const denied = [
      await viewer.client.post('/quotes', { title: 'X', contactId: quote.contact.id }),
      await viewer.client.patch(`/quotes/${quote.id}`, { title: 'X' }),
      await viewer.client.post(`/quotes/${quote.id}/status`, { status: 'responded' }),
      await viewer.client.post(`/quotes/${quote.id}/follow-ups`, { channel: 'task' }),
      await viewer.client.post('/contacts', { fullName: 'X', email: uniqueEmail() }),
      await viewer.client.post('/exclusions', { email: uniqueEmail(), reason: 'manual' }),
      await viewer.client.patch('/company', { name: 'X' }),
      await viewer.client.patch('/company/settings', { maxFollowUps: 1 }),
      await viewer.client.post('/members/invitations', { email: uniqueEmail(), role: 'member' }),
    ];
    for (const res of denied) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('el comercial (member) trabaja con presupuestos pero no administra la empresa', async () => {
    expect((await member.client.post(`/quotes/${quote.id}/follow-ups`, { channel: 'task' })).status).toBe(201);
    expect((await member.client.post('/exclusions', { email: uniqueEmail(), reason: 'opt_out_request' })).status).toBe(201);
    expect((await member.client.patch('/company', { name: 'X' })).status).toBe(403);
    expect((await member.client.patch('/company/settings', { maxFollowUps: 1 })).status).toBe(403);
    expect((await member.client.get('/members/invitations')).status).toBe(403);
    expect((await member.client.patch(`/members/${viewer.userId}`, { role: 'admin' })).status).toBe(403);

    // Solo administración puede levantar una exclusión o corregir estados finales.
    const ex = await member.client.post('/exclusions', { email: uniqueEmail(), reason: 'manual' });
    expect((await member.client.post(`/exclusions/${ex.body.exclusion.id}/lift`, { reason: 'Prueba' })).status).toBe(403);
    const q = await createQuote(member.client);
    await member.client.post(`/quotes/${q.id}/status`, { status: 'rejected' });
    const correction = await member.client.post(`/quotes/${q.id}/status`, { status: 'responded' });
    expect(correction.status).toBe(409);
  });

  it('el administrador gestiona la empresa y los miembros, pero no a los propietarios', async () => {
    expect((await admin.client.patch('/company', { name: 'Reformas Renombradas SL', taxId: 'b-12345678' })).body.company).toMatchObject({
      name: 'Reformas Renombradas SL',
      taxId: 'B12345678',
    });
    expect((await admin.client.patch(`/members/${viewer.userId}`, { role: 'member' })).status).toBe(200);
    expect((await admin.client.patch(`/members/${viewer.userId}`, { role: 'viewer' })).status).toBe(200);
    expect((await admin.client.patch(`/members/${owner.userId}`, { role: 'member' })).status).toBe(403);
    expect((await admin.client.patch(`/members/${viewer.userId}`, { role: 'owner' })).status).toBe(403);
    expect((await admin.client.delete(`/members/${owner.userId}`)).status).toBe(403);
  });

  it('nadie puede cambiar su propio rol ni dejar la empresa sin propietario', async () => {
    expect((await owner.client.patch(`/members/${owner.userId}`, { role: 'viewer' })).status).toBe(403);
    expect((await admin.client.patch(`/members/${admin.userId}`, { role: 'owner' })).status).toBe(403);

    // Con dos propietarios, uno puede degradar al otro; nunca se queda en cero.
    const second = await addMember(app, owner, 'admin');
    expect((await owner.client.patch(`/members/${second.userId}`, { role: 'owner' })).status).toBe(200);
    expect((await second.client.patch(`/members/${owner.userId}`, { role: 'admin' })).status).toBe(200);
    expect((await owner.client.patch(`/members/${second.userId}`, { role: 'admin' })).status).toBe(403); // owner ya es admin
    expect((await second.client.patch(`/members/${owner.userId}`, { role: 'owner' })).status).toBe(200);
  });

  it('un cambio de rol surte efecto inmediato en la sesión activa', async () => {
    const m = await addMember(app, owner, 'member');
    expect((await m.client.post('/contacts', { fullName: 'A', email: uniqueEmail() })).status).toBe(201);
    await owner.client.patch(`/members/${m.userId}`, { role: 'viewer' });
    expect((await m.client.post('/contacts', { fullName: 'B', email: uniqueEmail() })).status).toBe(403);
  });

  it('al eliminar a un miembro se cierran sus sesiones en esa empresa', async () => {
    const m = await addMember(app, owner, 'member');
    expect((await m.client.get('/me')).status).toBe(200);
    expect((await owner.client.delete(`/members/${m.userId}`)).status).toBe(204);
    expect((await m.client.get('/me')).status).toBe(401);
  });
});

describe('plan y suscripción', () => {
  it('no existe ninguna forma de que el usuario se asigne un plan', async () => {
    for (const body of [{ plan: 'business' }, { subscription: { status: 'active' } }, { status: 'active' }]) {
      expect((await owner.client.patch('/company', body)).status).toBe(400);
      expect((await owner.client.patch('/company/settings', body)).status).toBe(400);
    }
    expect((await owner.client.patch('/company/subscription', { plan: 'business' })).status).toBe(404);
    expect((await owner.client.post('/company/subscription', { plan: 'business' })).status).toBe(404);
    const sub = await owner.client.get('/company/subscription');
    expect(sub.body.subscription).toMatchObject({ plan: 'starter', status: 'trialing', paymentsEnabled: false });
    expect(sub.body.plans.map((p: { id: string; priceCents: number }) => [p.id, p.priceCents])).toEqual([
      ['starter', 2799],
      ['pro', 5799],
      ['business', 12799],
    ]);
  });
});

describe('invitaciones', () => {
  it('una invitación solo puede usarse una vez y no puede elevar a propietario', async () => {
    expect((await owner.client.post('/members/invitations', { email: uniqueEmail(), role: 'owner' })).status).toBe(400);

    const email = uniqueEmail('invitado');
    const inv = await owner.client.post('/members/invitations', { email, role: 'member' });
    expect(inv.status).toBe(201);
    expect(inv.body.delivery).toBe('sent');
    expect(mailer.lastTo(email)?.template).toBe('invitation');
    const token = tokenFromMail(mailer.lastTo(email)!.text);

    const preview = await new Client(app).post('/auth/invitations/preview', { token });
    expect(preview.body).toMatchObject({ email, role: 'member', accountExists: false });

    const accept = await new Client(app).post('/auth/invitations/accept', { token, fullName: 'Invitado', password: TEST_PASSWORD, acceptTerms: true });
    expect(accept.status).toBe(200);
    expect(accept.body.role).toBe('member');
    const again = await new Client(app).post('/auth/invitations/accept', { token, fullName: 'Otra vez', password: TEST_PASSWORD, acceptTerms: true });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('INVALID_TOKEN');
  });

  it('una invitación revocada o reenviada deja de funcionar', async () => {
    const email = uniqueEmail('revocado');
    const first = await owner.client.post('/members/invitations', { email, role: 'viewer' });
    const firstToken = new URL(first.body.acceptUrl).searchParams.get('token');
    const second = await owner.client.post('/members/invitations', { email, role: 'viewer' });
    expect((await new Client(app).post('/auth/invitations/preview', { token: firstToken })).status).toBe(400);
    await owner.client.delete(`/members/invitations/${second.body.invitation.id}`);
    const secondToken = new URL(second.body.acceptUrl).searchParams.get('token');
    expect((await new Client(app).post('/auth/invitations/preview', { token: secondToken })).status).toBe(400);
  });

  it('un usuario existente acepta desde su sesión y puede cambiar de empresa', async () => {
    const other = await registerAccount(app, 'Otra empresa SL');
    const inv = await owner.client.post('/members/invitations', { email: other.email, role: 'member' });
    const token = new URL(inv.body.acceptUrl).searchParams.get('token');

    // Sin sesión: debe iniciar sesión.
    expect((await new Client(app).post('/auth/invitations/accept', { token, fullName: 'X', password: TEST_PASSWORD, acceptTerms: true })).status).toBe(409);
    // Otra persona con sesión no puede usar la invitación ajena.
    expect((await member.client.post('/auth/invitations/accept', { token })).status).toBe(403);

    const accept = await other.client.post('/auth/invitations/accept', { token });
    expect(accept.status).toBe(200);
    const me = await other.client.get('/me');
    expect(me.body.company.id).toBe(owner.companyId);
    expect(me.body.memberships).toHaveLength(2);
    const back = await other.client.post('/auth/switch-company', { companyId: other.companyId });
    expect(back.status).toBe(200);
    expect((await other.client.get('/me')).body.company.id).toBe(other.companyId);
  });

  it('la cuenta creada por invitación queda con el email sin verificar', async () => {
    const m = await addMember(app, owner, 'viewer');
    const row = await db.selectFrom('users').select('emailVerifiedAt').where('id', '=', m.userId).executeTakeFirstOrThrow();
    expect(row.emailVerifiedAt).toBeNull();
  });
});
