import { describe, expect, it } from 'vitest';
import { API, Client, createQuote, createTestApp, registerAccount, TEST_PASSWORD, uniqueEmail } from './helpers.js';

const { app } = await createTestApp();
const acc = await registerAccount(app);

function expectValidationError(res: { status: number; body: any }, path?: string) {
  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe('VALIDATION_ERROR');
  expect(typeof res.body.error.message).toBe('string');
  expect(res.body.error.requestId).toBeTruthy();
  if (path) expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain(path);
}

describe('validación de entradas', () => {
  it('registro: email inválido, contraseña débil y campos vacíos', async () => {
    const client = new Client(app);
    const base = { fullName: 'Ana', email: uniqueEmail(), password: TEST_PASSWORD, companyName: 'Empresa', acceptTerms: true };
    expectValidationError(await client.post('/auth/register', { ...base, email: 'no-es-email' }), 'email');
    expectValidationError(await client.post('/auth/register', { ...base, password: 'corta' }), 'password');
    expectValidationError(await client.post('/auth/register', { ...base, password: ' '.repeat(12) }), 'password');
    expectValidationError(await client.post('/auth/register', { ...base, fullName: '   ' }), 'fullName');
    expectValidationError(await client.post('/auth/register', { ...base, companyName: 'x'.repeat(121) }), 'companyName');
    const res = await client.post('/auth/register', {});
    expectValidationError(res);
    expect(res.body.error.details.length).toBeGreaterThanOrEqual(4);
  });

  it('los mensajes de error están en español', async () => {
    const res = await new Client(app).post('/auth/register', { email: 'x' });
    expect(res.body.error.message).toBe('Los datos enviados no son válidos.');
    expect(res.body.error.details.find((d: { path: string }) => d.path === 'email').message).toBe('Email no válido');
  });

  it('rechaza campos desconocidos (asignación masiva)', async () => {
    const res = await acc.client.patch('/me', { fullName: 'Ana', email: 'otro@ejemplo.test', role: 'owner' });
    expectValidationError(res);
  });

  it('rechaza identificadores con formato inválido', async () => {
    expectValidationError(await acc.client.get('/quotes/no-es-un-uuid'), 'id');
    expectValidationError(await acc.client.get("/quotes/1' OR '1'='1"), 'id');
  });

  it('validación semántica de presupuestos', async () => {
    const contact = { fullName: 'C', email: uniqueEmail() };
    expectValidationError(await acc.client.post('/quotes', { title: 'X', contact, amountCents: -5 }), 'amountCents');
    expectValidationError(await acc.client.post('/quotes', { title: 'X', contact, amountCents: 10.5 }), 'amountCents');
    expectValidationError(await acc.client.post('/quotes', { title: 'X', contact, sentAt: '2999-01-01T00:00:00Z' }), 'sentAt');
    expectValidationError(await acc.client.post('/quotes', { title: 'X', contact, status: 'draft', sentAt: '2020-01-01T00:00:00Z' }), 'sentAt');
    expectValidationError(
      await acc.client.post('/quotes', { title: 'X', contact, sentAt: '2026-05-10T10:00:00Z', validUntil: '2026-05-01' }),
      'validUntil',
    );
    expectValidationError(await acc.client.post('/quotes', { title: 'X' }), 'contactId');
    expectValidationError(await acc.client.post('/quotes', { title: 'X', contact: { fullName: 'Sin datos' } }));
    expectValidationError(await acc.client.post('/quotes', { title: 'X', contact, status: 'accepted' }), 'status');
    expectValidationError(await acc.client.get('/quotes?status=inventado'));
    expectValidationError(await acc.client.get('/quotes?limit=1000'), 'limit');
    expectValidationError(await acc.client.get('/quotes?cursor=basura'), 'cursor');
  });

  it('validación semántica de configuración', async () => {
    expectValidationError(await acc.client.patch('/company/settings', { contactWindowStart: '20:00', contactWindowEnd: '09:00' }), 'contactWindowEnd');
    expectValidationError(await acc.client.patch('/company/settings', { allowedWeekdays: [1, 1, 2] }), 'allowedWeekdays');
    expectValidationError(await acc.client.patch('/company/settings', { allowedWeekdays: [0, 8] }));
    expectValidationError(await acc.client.patch('/company/settings', { maxFollowUps: 50 }), 'maxFollowUps');
    expectValidationError(await acc.client.patch('/company', { timezone: 'Marte/Olympus' }), 'timezone');
    expectValidationError(await acc.client.patch('/company', {}));
    const ok = await acc.client.patch('/company/settings', { contactWindowStart: '08:30', allowedWeekdays: [5, 1, 3] });
    expect(ok.status).toBe(200);
    expect(ok.body.settings).toMatchObject({ contactWindowStart: '08:30', allowedWeekdays: [1, 3, 5] });
  });

  it('seguimientos: un resultado solo se indica al registrar uno realizado', async () => {
    const q = await createQuote(acc.client);
    expectValidationError(await acc.client.post(`/quotes/${q.id}/follow-ups`, { channel: 'phone', outcome: 'no_answer' }), 'outcome');
    expectValidationError(await acc.client.post(`/quotes/${q.id}/follow-ups`, { channel: 'fax' }), 'channel');
  });
});

describe('errores coherentes', () => {
  it('JSON mal formado', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `${API}/auth/login`,
      headers: { 'content-type': 'application/json' },
      payload: '{"email": ',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_JSON');
  });

  it('protección frente a prototype poisoning', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `${API}/auth/login`,
      headers: { 'content-type': 'application/json' },
      payload: '{"__proto__": {"admin": true}, "email": "a@ejemplo.test", "password": "x"}',
    });
    expect(res.statusCode).toBe(400);
  });

  it('cuerpo demasiado grande', async () => {
    const res = await acc.client.post('/contacts', { fullName: 'X', email: uniqueEmail(), notes: 'a'.repeat(200_000) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('ruta inexistente con sesión → 404 con el mismo formato', async () => {
    const res = await acc.client.get('/no-existe');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND', requestId: expect.any(String) });
  });

  it('los errores no exponen detalles internos', async () => {
    const res = await acc.client.post('/quotes', { title: 'X', contactId: '00000000-0000-4000-8000-000000000000' });
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(/stack|sql|postgres|kysely|select /i);
  });
});
