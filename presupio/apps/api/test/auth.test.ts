import { describe, expect, it } from 'vitest';
import { API, Client, createTestApp, registerAccount, TEST_PASSWORD, tokenFromMail, uniqueEmail } from './helpers.js';

const { app, db, mailer } = await createTestApp();

describe('registro', () => {
  it('crea usuario, empresa propietaria, configuración, prueba gratuita y sesión', async () => {
    const client = new Client(app);
    const email = uniqueEmail();
    const res = await client.post('/auth/register', {
      fullName: '  Ana Pruebas  ',
      email: email.toUpperCase(),
      password: TEST_PASSWORD,
      companyName: 'Reformas Ana SL',
      acceptTerms: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.user).toEqual({ id: expect.any(String), email, fullName: 'Ana Pruebas', emailVerified: false });
    expect(res.body.company.name).toBe('Reformas Ana SL');
    expect(res.body.role).toBe('owner');
    expect(res.body.emailVerification.delivery).toBe('sent');
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);

    // Cookie de sesión segura
    const setCookie = String(res.headers['set-cookie']);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Lax/);

    const me = await client.get('/me');
    expect(me.status).toBe(200);
    expect(me.body.role).toBe('owner');
    expect(me.body.permissions).toContain('members:manage');
    expect(me.body.subscription).toMatchObject({ plan: 'starter', status: 'trialing', hasActiveAccess: true });

    const settings = await client.get('/company/settings');
    expect(settings.body.settings).toMatchObject({
      requireManualApproval: true,
      followUpScheduleDays: [3, 7, 14],
      allowedWeekdays: [1, 2, 3, 4, 5],
      automationEnabled: false,
    });
  });

  it('la contraseña se guarda con Argon2id, nunca en claro', async () => {
    const acc = await registerAccount(app);
    const row = await db.selectFrom('users').select('passwordHash').where('id', '=', acc.userId).executeTakeFirstOrThrow();
    expect(row.passwordHash).toMatch(/^\$argon2id\$/);
    expect(row.passwordHash).not.toContain(TEST_PASSWORD);
  });

  it('rechaza un email ya registrado sin crear nada', async () => {
    const acc = await registerAccount(app);
    const res = await new Client(app).post('/auth/register', {
      fullName: 'Otra',
      email: acc.email,
      password: TEST_PASSWORD,
      companyName: 'Duplicada SL',
      acceptTerms: true,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('exige aceptar los términos', async () => {
    const res = await new Client(app).post('/auth/register', {
      fullName: 'Sin términos',
      email: uniqueEmail(),
      password: TEST_PASSWORD,
      companyName: 'X SL',
      acceptTerms: false,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('acceptTerms');
  });
});

describe('inicio y cierre de sesión', () => {
  it('inicia sesión con credenciales correctas y cierra sesión invalidando el token', async () => {
    const acc = await registerAccount(app);
    const client = new Client(app);
    const login = await client.post('/auth/login', { email: acc.email, password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.company.id).toBe(acc.companyId);
    expect(login.body.memberships).toHaveLength(1);

    const stolenCookie = client.cookie;
    expect((await client.get('/me')).status).toBe(200);

    const logout = await client.post('/auth/logout');
    expect(logout.status).toBe(204);
    expect(client.cookie).toBeNull();

    // Reutilizar la cookie antigua tras el cierre de sesión no funciona.
    const replay = new Client(app);
    replay.cookie = stolenCookie;
    expect((await replay.get('/me')).status).toBe(401);
  });

  it('responde igual para email inexistente y contraseña incorrecta', async () => {
    const acc = await registerAccount(app);
    const wrongPass = await new Client(app).post('/auth/login', { email: acc.email, password: 'incorrecta-123' });
    const noUser = await new Client(app).post('/auth/login', { email: uniqueEmail(), password: 'incorrecta-123' });
    expect(wrongPass.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPass.body.error.message).toBe(noUser.body.error.message);
    expect(wrongPass.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('el token de sesión se guarda solo como hash', async () => {
    const acc = await registerAccount(app);
    const token = acc.client.cookie!.split('=')[1]!;
    const sessions = await db.selectFrom('sessions').select('tokenHash').where('userId', '=', acc.userId).execute();
    expect(sessions.length).toBeGreaterThan(0);
    for (const s of sessions) expect(s.tokenHash).not.toBe(token);
  });

  it('rechaza sesiones caducadas', async () => {
    const acc = await registerAccount(app);
    await db.updateTable('sessions').set({ expiresAt: new Date(Date.now() - 1000) }).where('userId', '=', acc.userId).execute();
    expect((await acc.client.get('/me')).status).toBe(401);
  });

  it('rechaza cookies con formato inválido', async () => {
    const res = await app.inject({ method: 'GET', url: `${API}/me`, headers: { cookie: 'presupio_session=../../etc/passwd' } });
    expect(res.statusCode).toBe(401);
  });
});

describe('recuperación de contraseña', () => {
  it('flujo completo: email con token de un solo uso, nueva contraseña y cierre de todas las sesiones', async () => {
    const acc = await registerAccount(app);
    const forgot = await new Client(app).post('/auth/password/forgot', { email: acc.email });
    expect(forgot.status).toBe(202);
    await app.flushBackground();

    const mail = mailer.lastTo(acc.email);
    expect(mail?.template).toBe('password_reset');
    const token = tokenFromMail(mail!.text);

    // El token no se guarda en claro.
    const stored = await db.selectFrom('userTokens').select('tokenHash').where('userId', '=', acc.userId).execute();
    expect(stored.every((t) => t.tokenHash !== token)).toBe(true);

    const newPassword = 'Otra-contraseña-segura-2';
    const reset = await new Client(app).post('/auth/password/reset', { token, password: newPassword });
    expect(reset.status).toBe(200);

    // La sesión anterior queda cerrada.
    expect((await acc.client.get('/me')).status).toBe(401);
    // El token no puede reutilizarse.
    const reuse = await new Client(app).post('/auth/password/reset', { token, password: 'Tercera-contraseña-3' });
    expect(reuse.status).toBe(400);
    expect(reuse.body.error.code).toBe('INVALID_TOKEN');
    // Solo funciona la contraseña nueva.
    expect((await new Client(app).post('/auth/login', { email: acc.email, password: TEST_PASSWORD })).status).toBe(401);
    expect((await new Client(app).post('/auth/login', { email: acc.email, password: newPassword })).status).toBe(200);
  });

  it('no revela si el email existe', async () => {
    const unknown = await new Client(app).post('/auth/password/forgot', { email: uniqueEmail() });
    const acc = await registerAccount(app);
    const known = await new Client(app).post('/auth/password/forgot', { email: acc.email });
    expect(unknown.status).toBe(202);
    expect(known.status).toBe(202);
    expect(unknown.body).toEqual(known.body);
  });

  it('rechaza tokens caducados', async () => {
    const acc = await registerAccount(app);
    await new Client(app).post('/auth/password/forgot', { email: acc.email });
    await app.flushBackground();
    const token = tokenFromMail(mailer.lastTo(acc.email)!.text);
    await db.updateTable('userTokens').set({ expiresAt: new Date(Date.now() - 1000) }).where('userId', '=', acc.userId).execute();
    const res = await new Client(app).post('/auth/password/reset', { token, password: 'Contraseña-nueva-123' });
    expect(res.status).toBe(400);
  });

  it('cambio de contraseña con sesión: exige la actual y cierra las demás sesiones', async () => {
    const acc = await registerAccount(app);
    const other = new Client(app);
    await other.post('/auth/login', { email: acc.email, password: TEST_PASSWORD });

    const wrong = await acc.client.post('/auth/password/change', { currentPassword: 'mala-clave-1', newPassword: 'Nueva-clave-segura-1' });
    expect(wrong.status).toBe(400);

    const ok = await acc.client.post('/auth/password/change', { currentPassword: TEST_PASSWORD, newPassword: 'Nueva-clave-segura-1' });
    expect(ok.status).toBe(200);
    expect((await acc.client.get('/me')).status).toBe(200);
    expect((await other.get('/me')).status).toBe(401);
  });
});

describe('verificación de email', () => {
  it('confirma el email con el token enviado al registrarse', async () => {
    const acc = await registerAccount(app);
    const mail = mailer.lastTo(acc.email);
    expect(mail?.template).toBe('email_verification');
    const res = await new Client(app).post('/auth/email/verify', { token: tokenFromMail(mail!.text) });
    expect(res.status).toBe(200);
    expect((await acc.client.get('/me')).body.user.emailVerified).toBe(true);
  });
});

describe('límites de intentos', async () => {
  const limited = await createTestApp((c) => {
    c.rateLimits.loginPerEmail = { max: 3, windowMs: 60_000 };
  });

  it('bloquea el inicio de sesión tras varios fallos para el mismo email', async () => {
    const acc = await registerAccount(limited.app);
    const client = new Client(limited.app);
    for (let i = 0; i < 3; i++) {
      expect((await client.post('/auth/login', { email: acc.email, password: 'incorrecta-xx' })).status).toBe(401);
    }
    const blocked = await client.post('/auth/login', { email: acc.email, password: TEST_PASSWORD });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });

  const perIp = await createTestApp((c) => {
    c.rateLimits.register = { max: 2, windowMs: 60_000 };
  });

  it('limita los registros por IP', async () => {
    const attempt = () =>
      new Client(perIp.app).post('/auth/register', {
        fullName: 'Spam',
        email: uniqueEmail(),
        password: TEST_PASSWORD,
        companyName: 'Spam SL',
        acceptTerms: true,
      });
    expect((await attempt()).status).toBe(201);
    expect((await attempt()).status).toBe(201);
    const third = await attempt();
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('RATE_LIMITED');
  });
});
