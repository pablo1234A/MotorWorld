import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';
import type { Company } from '../company.js';
import { AppError } from '../core/errors.js';
import type { Owner } from '../auth/auth.js';
import { registerRoutes } from './routes.js';

const COOKIE = 'apc_session';

declare module 'fastify' {
  interface FastifyRequest {
    owner: Owner | null;
  }
}

export interface ServerOptions {
  /** Directory with the built frontend (served in production). */
  webDir?: string | null;
  logger?: boolean;
}

export async function buildServer(c: Company, opts: ServerOptions = {}) {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 2 * 1024 * 1024, trustProxy: true });
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 200 * 1024 * 1024, files: 10 } });
  app.decorateRequest('owner', null);

  // Security headers on every response.
  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    return payload;
  });

  // Authentication + CSRF guard for the API.
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;
    req.owner = c.auth.verify(req.cookies[COOKIE]);
    const open = ['/api/health', '/api/auth/status', '/api/auth/login', '/api/auth/setup'].some((p) => req.url.split('?')[0] === p);
    if (!open && !req.owner) return reply.code(401).send({ error: 'Not authenticated', code: 'UNAUTHORIZED' });
    // State-changing requests must carry a custom header (blocked cross-site without CORS).
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-requested-with'] !== 'apc') {
      return reply.code(403).send({ error: 'Missing CSRF header', code: 'CSRF' });
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(422).send({ error: err.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '), code: 'VALIDATION', issues: err.issues });
    }
    if (err instanceof AppError) return reply.code(err.status).send({ error: err.message, code: err.code });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ error: (err as Error).message, code: 'BAD_REQUEST' });
    req.log.error(err);
    console.error('[api]', err);
    return reply.code(500).send({ error: 'Internal error', code: 'INTERNAL' });
  });

  /* ───────────── auth ───────────── */
  const setCookie = (reply: FastifyReply, token: string, expiresAt: string) =>
    reply.setCookie(COOKIE, token, { path: '/', httpOnly: true, sameSite: 'strict', secure: c.cfg.cookieSecure, expires: new Date(expiresAt) });

  app.get('/api/health', async () => ({ ok: true, engine: c.llm.engineLabel }));
  app.get('/api/auth/status', async (req) => ({ hasOwner: c.auth.hasOwner(), owner: req.owner }));
  app.post('/api/auth/setup', async (req, reply) => {
    const body = req.body as { email?: string; password?: string };
    await c.auth.setup(req.body);
    const { owner, token, expiresAt } = await c.auth.login({ email: body.email, password: body.password }, req.ip);
    setCookie(reply, token, expiresAt);
    return { owner };
  });
  app.post('/api/auth/login', async (req, reply) => {
    const { owner, token, expiresAt } = await c.auth.login(req.body, req.ip);
    setCookie(reply, token, expiresAt);
    return { owner };
  });
  app.post('/api/auth/logout', async (req, reply) => {
    c.auth.logout(req.cookies[COOKIE]);
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });
  app.post('/api/auth/password', async (req) => {
    const b = req.body as { current: string; next: string };
    await c.auth.changePassword(req.owner!.id, String(b?.current ?? ''), String(b?.next ?? ''));
    return { ok: true };
  });

  /* ───────────── realtime (SSE) ───────────── */
  app.get('/api/stream', (req, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write(`event: hello\ndata: ${JSON.stringify({ engine: c.llm.engineLabel })}\n\n`);
    const send = (type: string, data: unknown) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    const offEvents = c.events.subscribe((e) => send('company', e));
    const offActivity = c.onActivity((a) => send('activity', a));
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.raw.on('close', () => {
      clearInterval(ping);
      offEvents();
      offActivity();
    });
  });

  /* ───────────── media streaming (Range support) ───────────── */
  app.get('/api/media/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const download = (req.query as { download?: string }).download === '1';
    const media = c.videos.getAsset(id);
    const productAsset = media ? null : c.products.getAsset(id);
    const file = media?.path ?? (productAsset ? c.products.assetPath(productAsset) : null);
    const mime = media?.mime ?? productAsset?.mime;
    if (!file || !mime || !fs.existsSync(file)) return reply.code(404).send({ error: 'Media not found', code: 'NOT_FOUND' });
    // Never serve anything outside the media directory.
    if (!path.resolve(file).startsWith(path.resolve(c.cfg.mediaDir))) return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    return sendFileWithRange(req, reply, file, mime, download ? `${id}${path.extname(file)}` : null);
  });

  registerRoutes(app, c);

  /* ───────────── frontend (production build) ───────────── */
  if (opts.webDir && fs.existsSync(opts.webDir)) {
    await app.register(fastifyStatic, { root: opts.webDir, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Not found', code: 'NOT_FOUND' });
      return reply.sendFile('index.html');
    });
  }
  return app;
}

function sendFileWithRange(req: FastifyRequest, reply: FastifyReply, file: string, mime: string, downloadName: string | null) {
  const { size } = fs.statSync(file);
  reply.header('Accept-Ranges', 'bytes');
  reply.header('Content-Type', mime);
  reply.header('Cache-Control', 'private, max-age=3600');
  if (downloadName) reply.header('Content-Disposition', `attachment; filename="${downloadName}"`);
  const range = req.headers.range;
  const m = range ? /bytes=(\d*)-(\d*)/.exec(range) : null;
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : size - Number(m[2]);
    let end = m[1] && m[2] ? Number(m[2]) : size - 1;
    if (!m[1]) end = size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) return reply.code(416).header('Content-Range', `bytes */${size}`).send();
    reply.code(206).header('Content-Range', `bytes ${start}-${end}/${size}`).header('Content-Length', end - start + 1);
    return reply.send(fs.createReadStream(file, { start, end }));
  }
  reply.header('Content-Length', size);
  return reply.send(fs.createReadStream(file));
}
