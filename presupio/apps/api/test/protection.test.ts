import { describe, expect, it } from 'vitest';
import { API, Client, createTestApp, registerAccount, WEB_ORIGIN } from './helpers.js';

const { app } = await createTestApp();

const PUBLIC_ROUTES = new Set([
  'GET /api/v1/health',
  'GET /api/v1/health/ready',
  'POST /api/v1/auth/register',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/logout',
  'POST /api/v1/auth/password/forgot',
  'POST /api/v1/auth/password/reset',
  'POST /api/v1/auth/email/verify',
  'POST /api/v1/auth/invitations/preview',
  'POST /api/v1/auth/invitations/accept',
]);

const FAKE_ID = '00000000-0000-4000-8000-000000000000';

describe('protección de rutas privadas', () => {
  it('solo las rutas públicas conocidas no exigen sesión', () => {
    const open = app.routeTable.filter((r) => r.auth !== 'required').map((r) => `${r.method} ${r.url}`);
    expect(new Set(open)).toEqual(PUBLIC_ROUTES);
    // Hay un número razonable de rutas privadas registradas.
    expect(app.routeTable.filter((r) => r.auth === 'required').length).toBeGreaterThan(30);
  });

  it('todas las rutas privadas responden 401 sin sesión', async () => {
    const privateRoutes = app.routeTable.filter((r) => r.auth === 'required');
    for (const route of privateRoutes) {
      const url = route.url.replace(/:[a-zA-Z]+/g, FAKE_ID);
      const res = await app.inject({
        method: route.method as 'GET',
        url,
        ...(route.method === 'GET' || route.method === 'DELETE' ? {} : { payload: {} }),
      });
      expect(res.statusCode, `${route.method} ${route.url}`).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('rechaza peticiones que modifican datos desde un origen no permitido (CSRF)', async () => {
    const acc = await registerAccount(app);
    const res = await acc.client.post('/contacts', { fullName: 'X', email: 'x@ejemplo.test' }, { origin: 'https://atacante.example' });
    expect(res.status).toBe(403);
    const ok = await acc.client.post('/contacts', { fullName: 'Y', email: 'y@ejemplo.test' }, { origin: WEB_ORIGIN });
    expect(ok.status).toBe(201);
  });

  it('rechaza cuerpos que no son JSON (formularios de otros sitios)', async () => {
    const acc = await registerAccount(app);
    const res = await app.inject({
      method: 'POST',
      url: `${API}/contacts`,
      headers: { cookie: acc.client.cookie!, 'content-type': 'text/plain' },
      payload: '{"fullName":"X","email":"x@ejemplo.test"}',
    });
    expect(res.statusCode).toBe(415);
    const form = await app.inject({
      method: 'POST',
      url: `${API}/contacts`,
      headers: { cookie: acc.client.cookie!, 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'fullName=X',
    });
    expect(form.statusCode).toBe(415);
  });

  it('CORS solo autoriza el origen de la aplicación web, con credenciales', async () => {
    const allowed = await app.inject({
      method: 'OPTIONS',
      url: `${API}/me`,
      headers: { origin: WEB_ORIGIN, 'access-control-request-method': 'GET' },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    const denied = await app.inject({
      method: 'OPTIONS',
      url: `${API}/me`,
      headers: { origin: 'https://atacante.example', 'access-control-request-method': 'GET' },
    });
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('añade cabeceras de seguridad y no expone la tecnología', async () => {
    const res = await new Client(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
