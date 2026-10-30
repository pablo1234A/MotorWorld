// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { netlifyHeaders, nginxConfig } from '../server/hosting-config.mjs';
import { cacheHeaders, securityHeaders } from '../server/security-headers.mjs';
import { createWebServer } from '../server/serve.mjs';

/*
 * P1-05: el servidor de producción incluido (server/serve.mjs) aplica las cabeceras de
 * seguridad en TODAS las respuestas, sirve la aplicación y reenvía /api a la API. Las pruebas
 * arrancan el servidor real en un puerto local con una compilación mínima y una API simulada.
 * No dicen nada del alojamiento real: allí hay que comprobarlas tras desplegar (docs/frontend.md).
 */

const base = mkdtempSync(path.join(tmpdir(), 'presupio-web-'));
const root = path.join(base, 'dist');
mkdirSync(path.join(root, 'assets'), { recursive: true });
writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>Presupio</title><div id="root"></div>');
writeFileSync(path.join(root, 'assets', 'index-AbC123.js'), 'console.log(1)');
writeFileSync(path.join(root, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
writeFileSync(path.join(base, 'secreto.txt'), 'NO-DEBE-SERVIRSE');

let apiCalls: Array<{ method: string; url: string; headers: http.IncomingHttpHeaders; body: string }> = [];
const api = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    apiCalls.push({ method: req.method!, url: req.url!, headers: req.headers, body });
    res.writeHead(201, { 'content-type': 'application/json', 'set-cookie': '__Host-presupio_session=abc; Path=/; HttpOnly; Secure; SameSite=Lax' });
    res.end(JSON.stringify({ ok: true }));
  });
});
let web: http.Server;
let webPort = 0;

beforeAll(async () => {
  await new Promise<void>((r) => api.listen(0, '127.0.0.1', r));
  web = createWebServer({ root, apiUrl: `http://127.0.0.1:${(api.address() as AddressInfo).port}` });
  await new Promise<void>((r) => web.listen(0, '127.0.0.1', r));
  webPort = (web.address() as AddressInfo).port;
});
afterAll(async () => {
  await new Promise((r) => web.close(r));
  await new Promise((r) => api.close(r));
  rmSync(base, { recursive: true, force: true });
});

/** Petición HTTP sin normalizar la ruta (fetch resolvería «..» antes de enviarla). */
function request(rawPath: string, init: { method?: string; headers?: Record<string, string>; body?: string; port?: number } = {}) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: init.port ?? webPort, path: rawPath, method: init.method ?? 'GET', headers: init.headers }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end(init.body);
  });
}

function expectSecurityHeaders(headers: http.IncomingHttpHeaders) {
  for (const [name, value] of Object.entries(securityHeaders)) expect(headers[name.toLowerCase()], name).toBe(value);
}

describe('servidor de producción del frontend (P1-05)', () => {
  it('la aplicación y sus rutas llevan todas las cabeceras de seguridad y no se cachean', async () => {
    for (const p of ['/', '/presupuestos/123', '/restablecer-contrasena?token=abc']) {
      const res = await request(p);
      expect(res.status, p).toBe(200);
      expect(res.body).toContain('<div id="root">');
      expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
      expect(res.headers['cache-control']).toBe(cacheHeaders.html);
      expectSecurityHeaders(res.headers);
    }
    expect(securityHeaders['Content-Security-Policy']).toMatch(/script-src 'self';/);
    expect(securityHeaders['Content-Security-Policy']).toMatch(/frame-ancestors 'none'/);
    expect(securityHeaders['Referrer-Policy']).toBe('no-referrer');
  });

  it('los archivos con huella se cachean como inmutables; los que faltan dan 404 (no la aplicación)', async () => {
    const asset = await request('/assets/index-AbC123.js');
    expect(asset.status).toBe(200);
    expect(asset.headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect(asset.headers['cache-control']).toBe(cacheHeaders.assets);
    expectSecurityHeaders(asset.headers);
    const missing = await request('/assets/no-existe.js');
    expect(missing.status).toBe(404);
    expect(missing.body).not.toContain('<div id="root">');
    expectSecurityHeaders(missing.headers);
    const head = await request('/favicon.svg', { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers['content-type']).toBe('image/svg+xml');
  });

  it('no sirve nada fuera de la compilación y rechaza métodos de escritura', async () => {
    for (const p of ['/../secreto.txt', '/%2e%2e/secreto.txt', '/assets/..%2f..%2fsecreto.txt', '/assets/%2e%2e%2f%2e%2e%2fsecreto.txt', '/%00', '/..%5csecreto.txt']) {
      const res = await request(p);
      expect(res.body, p).not.toContain('NO-DEBE-SERVIRSE');
      expectSecurityHeaders(res.headers);
    }
    const post = await request('/', { method: 'POST', body: 'x' });
    expect(post.status).toBe(405);
    expectSecurityHeaders(post.headers);
  });

  it('reenvía /api a la API con método, ruta, cookie y cuerpo, y devuelve su respuesta tal cual', async () => {
    apiCalls = [];
    const res = await request('/api/v1/auth/login?x=1', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'a=b', origin: 'https://app.ejemplo.test', connection: 'keep-alive' },
      body: '{"email":"ana@ejemplo.test"}',
    });
    expect(res.status).toBe(201);
    expect(res.headers['set-cookie']?.[0]).toMatch(/^__Host-presupio_session=abc/);
    expect(apiCalls).toHaveLength(1);
    expect(apiCalls[0]).toMatchObject({ method: 'POST', url: '/api/v1/auth/login?x=1', body: '{"email":"ana@ejemplo.test"}' });
    expect(apiCalls[0]!.headers).toMatchObject({ cookie: 'a=b', origin: 'https://app.ejemplo.test', 'x-forwarded-for': '127.0.0.1' });
  });

  it('si la API no responde, 502 con las cabeceras de seguridad', async () => {
    const down = createWebServer({ root, apiUrl: 'http://127.0.0.1:1' });
    await new Promise<void>((r) => down.listen(0, '127.0.0.1', r));
    try {
      const res = await request('/api/v1/health', { port: (down.address() as AddressInfo).port });
      expect(res.status).toBe(502);
      expectSecurityHeaders(res.headers);
    } finally {
      await new Promise((r) => down.close(r));
    }
  });
});

describe('configuración de alojamiento generada desde la misma fuente', () => {
  it('dist/_headers (Netlify, Cloudflare Pages) incluye todas las cabeceras', () => {
    const file = netlifyHeaders();
    for (const [name, value] of Object.entries(securityHeaders)) expect(file).toContain(`  ${name}: ${value}\n`);
    expect(file).toContain(`/assets/*\n  Cache-Control: ${cacheHeaders.assets}`);
  });

  it('ops/nginx/presupio-web.conf está al día (regenerar con node server/hosting-config.mjs --nginx)', () => {
    const committed = readFileSync(path.join(__dirname, '..', '..', '..', 'ops', 'nginx', 'presupio-web.conf'), 'utf8');
    expect(committed).toBe(nginxConfig());
    // Cada location con add_header propio repite todas las de seguridad (nginx no las hereda).
    for (const [name] of Object.entries(securityHeaders)) expect(committed.match(new RegExp(`add_header ${name} `, 'g'))).toHaveLength(3);
    // El correo entrante (hasta 10 MB en la API) no choca con el límite de 1 MB de nginx.
    expect(committed).toMatch(/location \/api\/v1\/webhooks\/inbound\/ \{\n {4}client_max_body_size 11m;/);
  });
});
