import { Buffer } from 'buffer';
import { ZodError } from 'zod';
import type { Company } from '../server/company';
import { AppError } from '../server/core/errors';
import { registerRoutes } from '../server/api/routes';
import type { LocalTransport } from '../web/lib/transport';
import { __objectUrl } from './shims/fs';

type Handler = (req: LocalRequest, reply: unknown) => Promise<unknown> | unknown;

interface LocalRequest {
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  owner: { id: string; email: string; name: string };
  ip: string;
  cookies: Record<string, string>;
  files: () => AsyncGenerator<{ filename: string; mimetype: string; toBuffer: () => Promise<Buffer> }>;
}

interface Route {
  method: string;
  parts: string[];
  handler: Handler;
}

export const OWNER = { id: 'own_local', email: 'local@browser', name: 'Propietario' };

/**
 * The same route table the server registers on Fastify, mounted on a tiny
 * in-page router. The UI calls it through the transport seam instead of HTTP.
 */
export function createLocalApi(c: Company, extra: { reset: () => Promise<void> }): LocalTransport {
  const routes: Route[] = [];
  const add = (method: string) => (p: string, handler: Handler) => routes.push({ method, parts: p.split('/').filter(Boolean), handler });
  const app = { get: add('GET'), post: add('POST'), put: add('PUT'), delete: add('DELETE') };

  app.get('/api/auth/status', () => ({ hasOwner: true, owner: OWNER }));
  app.post('/api/auth/logout', () => ({ ok: true }));
  app.get('/api/health', () => ({ ok: true, engine: c.llm.engineLabel, edition: 'browser' }));
  app.post('/api/system/reset', async () => {
    await extra.reset();
    return { ok: true };
  });
  registerRoutes(app as never, c);

  const match = (method: string, path: string) => {
    const segs = path.split('/').filter(Boolean);
    for (const r of routes) {
      if (r.method !== method || r.parts.length !== segs.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < segs.length; i++) {
        if (r.parts[i].startsWith(':')) params[r.parts[i].slice(1)] = decodeURIComponent(segs[i]);
        else if (r.parts[i] !== segs[i]) {
          ok = false;
          break;
        }
      }
      if (ok) return { route: r, params };
    }
    return null;
  };

  const listeners = new Set<(type: 'company' | 'activity', data: unknown) => void>();
  c.events.subscribe((e) => listeners.forEach((l) => l('company', e)));
  c.onActivity((a) => listeners.forEach((l) => l('activity', a)));

  return {
    edition: 'browser',
    async request(method, url, body) {
      const [path, qs] = url.split('?');
      const m = match(method.toUpperCase(), path);
      if (!m) return { status: 404, data: { error: 'Not found', code: 'NOT_FOUND' } };
      const form = body instanceof FormData ? body : null;
      const req: LocalRequest = {
        params: m.params,
        query: Object.fromEntries(new URLSearchParams(qs ?? '')),
        // Same contract as HTTP: the body crosses a serialization boundary.
        body: form ? undefined : body === undefined ? undefined : JSON.parse(JSON.stringify(body)),
        owner: OWNER,
        ip: 'local',
        cookies: {},
        async *files() {
          if (!form) return;
          for (const [, v] of form.entries()) {
            if (v instanceof File) yield { filename: v.name, mimetype: v.type, toBuffer: async () => Buffer.from(await v.arrayBuffer()) };
          }
        },
      };
      try {
        const data = await m.route.handler(req, {});
        if (method.toUpperCase() !== 'GET') void c.scheduler.tick();
        return { status: 200, data: data === undefined ? null : JSON.parse(JSON.stringify(data)) };
      } catch (err) {
        if (err instanceof ZodError) return { status: 422, data: { error: err.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '), code: 'VALIDATION' } };
        if (err instanceof AppError) return { status: err.status, data: { error: err.message, code: err.code } };
        console.error('[local api]', err);
        return { status: 500, data: { error: (err as Error).message ?? 'Internal error', code: 'INTERNAL' } };
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    mediaUrl(id) {
      const media = c.videos.getAsset(id);
      const productAsset = media ? null : c.products.getAsset(id);
      const file = media?.path ?? (productAsset ? c.products.assetPath(productAsset) : null);
      return file ? __objectUrl(file) : '';
    },
  };
}
