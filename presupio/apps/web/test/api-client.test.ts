import { describe, expect, it, vi } from 'vitest';
import { api, ApiError, qs } from '../src/api/client';

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('cliente de la API', () => {
  it('envía la cookie de sesión (credentials: include) y JSON, sin cabeceras de token', async () => {
    const fn = stubFetch(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await api('/quotes', { method: 'POST', body: { title: 'X' } });
    const [url, init] = fn.mock.calls[0]!;
    expect(url).toBe('/api/v1/quotes');
    expect(init?.credentials).toBe('include');
    expect(init?.headers).toMatchObject({ 'content-type': 'application/json' });
    expect(JSON.stringify(init?.headers)).not.toMatch(/authorization/i);
    expect(init?.body).toBe('{"title":"X"}');
  });

  it('convierte los errores de la API en ApiError con detalles por campo', async () => {
    stubFetch(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Los datos enviados no son válidos.',
              details: [{ path: 'email', message: 'Email no válido' }],
              requestId: 'r1',
            },
          }),
          { status: 400 },
        ),
    );
    const error = await api('/auth/register', { method: 'POST', body: {} }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    const e = error as ApiError;
    expect(e.status).toBe(400);
    expect(e.code).toBe('VALIDATION_ERROR');
    expect(e.fieldErrors()).toEqual({ email: 'Email no válido' });
    expect(e.requestId).toBe('r1');
  });

  it('respuestas no JSON (p. ej. proxy caído) → mensaje genérico, sin detalles internos', async () => {
    stubFetch(async () => new Response('<html>502 Bad Gateway nginx/1.25</html>', { status: 502, headers: { 'x-request-id': 'gw' } }));
    const e = (await api('/me').catch((x: unknown) => x)) as ApiError;
    expect(e.status).toBe(502);
    expect(e.code).toBe('INTERNAL_ERROR');
    expect(e.message).not.toMatch(/nginx|html/i);
    expect(e.requestId).toBe('gw');
  });

  it('sin conexión → NETWORK_ERROR comprensible', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    const e = (await api('/me').catch((x: unknown) => x)) as ApiError;
    expect(e.code).toBe('NETWORK_ERROR');
    expect(e.message).toMatch(/conectar con el servidor/);
  });

  it('204 → sin cuerpo; 200 sin JSON válido → error de respuesta inesperada', async () => {
    stubFetch(async () => new Response(null, { status: 204 }));
    await expect(api('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
    stubFetch(async () => new Response('ok', { status: 200 }));
    await expect(api('/me')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('query string sin valores vacíos', () => {
    expect(qs({ status: 'sent', q: '', cursor: undefined, limit: 25, archived: null })).toBe('?status=sent&limit=25');
    expect(qs({})).toBe('');
  });
});
