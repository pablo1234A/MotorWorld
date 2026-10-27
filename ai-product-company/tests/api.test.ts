import { afterEach, describe, expect, it } from 'vitest';
import { makeCompany } from './helpers.js';
import { buildServer } from '../src/server/api/server.js';

describe('HTTP API security', () => {
  let env: ReturnType<typeof makeCompany>;
  afterEach(() => env?.cleanup());

  it('protects endpoints, sets an HttpOnly session and requires the CSRF header', async () => {
    env = makeCompany();
    const app = await buildServer(env.c);
    const H = { 'x-requested-with': 'apc', 'content-type': 'application/json' };

    expect((await app.inject({ method: 'GET', url: '/api/snapshot' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/auth/status' })).json()).toMatchObject({ hasOwner: false });

    // Setup without the CSRF header is refused.
    expect((await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { email: 'o@x.com', name: 'O', password: 'supersecret1' } })).statusCode).toBe(403);
    // Weak password refused.
    expect((await app.inject({ method: 'POST', url: '/api/auth/setup', headers: H, payload: { email: 'o@x.com', name: 'O', password: 'short' } })).statusCode).toBe(422);

    const setup = await app.inject({ method: 'POST', url: '/api/auth/setup', headers: H, payload: { email: 'o@x.com', name: 'Owner', password: 'supersecret1' } });
    expect(setup.statusCode).toBe(200);
    const cookie = setup.cookies.find((c) => c.name === 'apc_session')!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Strict');
    // A second owner cannot be created.
    expect((await app.inject({ method: 'POST', url: '/api/auth/setup', headers: H, payload: { email: 'b@x.com', name: 'B', password: 'supersecret1' } })).statusCode).toBe(403);

    const auth = { ...H, cookie: `apc_session=${cookie.value}` };
    const snap = await app.inject({ method: 'GET', url: '/api/snapshot', headers: auth });
    expect(snap.statusCode).toBe(200);
    expect(snap.json().agents).toHaveLength(10);
    expect(snap.headers['content-security-policy']).toContain("default-src 'self'");
    expect(snap.headers['x-frame-options']).toBe('DENY');

    const created = await app.inject({ method: 'POST', url: '/api/products', headers: auth, payload: { name: 'Producto API', price: 20 } });
    expect(created.statusCode).toBe(200);
    const bad = await app.inject({ method: 'POST', url: '/api/products', headers: auth, payload: { name: '' } });
    expect(bad.statusCode).toBe(422);

    // No secret ever reaches the client.
    expect(JSON.stringify(snap.json())).not.toMatch(/sk-ant|ANTHROPIC_API_KEY=|password_hash/);

    // Wrong password → 401, and logout invalidates the session.
    expect((await app.inject({ method: 'POST', url: '/api/auth/login', headers: H, payload: { email: 'o@x.com', password: 'wrong-password' } })).statusCode).toBe(401);
    await app.inject({ method: 'POST', url: '/api/auth/logout', headers: auth, payload: {} });
    expect((await app.inject({ method: 'GET', url: '/api/snapshot', headers: auth })).statusCode).toBe(401);
    await app.close();
  });
});
