/**
 * Richard Mille — backend para Wix (Cloudflare Workers runtime).
 *
 * Es el mismo servidor que server/server.js, adaptado a fetch():
 *  - Páginas traducidas en /, /en/, /fr/, /de/, /it/ (render.js), robots.txt y sitemap.xml.
 *  - API REST de boutiques, disponibilidad y citas (api.js; las citas siguen siendo un mock).
 *  - Mismas cabeceras de seguridad, con la CSP calculada para el script en línea de index.html.
 * Los recursos de /assets/ los sirve Wix desde la carpeta client (binding ASSETS cuando existe).
 * Se empaqueta con scripts/build-wix-worker.js.
 */
import SRC from '../index.html';
import R from '../server/render.js';
import API from '../server/api.js';

/* global __CSP_HASH__, __LASTMOD__ */
const SECURITY = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'sha256-" + __CSP_HASH__ + "'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'X-Frame-Options': 'DENY'
};
const LANG_PATH = /^\/(en|fr|de|it)(\/.*)?$/;
const pages = {}; // páginas traducidas, en memoria mientras viva el isolate

const handleApi = API.createApi({
  log: (...a) => console.log(...a),
  random: () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296
});

function respond(req, status, body, headers) {
  const h = new Headers(SECURITY);
  for (const k in headers) h.set(k, headers[k]);
  return new Response(req.method === 'HEAD' ? null : body, { status, headers: h });
}

function json(req, status, data, extra) {
  return respond(req, status, JSON.stringify(data), Object.assign({
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'
  }, extra));
}

const text = (req, status, body, extra) => respond(req, status, body, Object.assign({ 'Content-Type': 'text/plain' }, extra));

function originOf(url, env) {
  return env && env.SITE_URL ? String(env.SITE_URL).replace(/\/+$/, '') : url.origin;
}

async function readBody(request) {
  const tooLarge = () => Object.assign(new Error('Payload too large'), { status: 413 });
  if (Number(request.headers.get('content-length')) > API.MAX_BODY) throw tooLarge();
  const buf = await request.arrayBuffer();
  if (buf.byteLength > API.MAX_BODY) throw tooLarge();
  return new TextDecoder().decode(buf);
}

async function api(request, url) {
  const r = await handleApi({
    method: request.method,
    pathname: url.pathname,
    searchParams: url.searchParams,
    contentType: request.headers.get('content-type'),
    ip: request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown',
    readBody: () => readBody(request)
  });
  return json(request, r.status, r.body, r.headers);
}

function page(request, lang, origin) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return text(request, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
  }
  if (!pages[lang]) pages[lang] = R.translatedPage(SRC, lang);
  return respond(request, 200, R.renderPage(pages[lang], lang, origin), {
    'Content-Type': 'text/html; charset=utf-8', 'Content-Language': lang, 'Cache-Control': 'no-cache'
  });
}

async function asset(request, url, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return text(request, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
  }
  // Solo es público /assets/ (igual que el servidor Node)
  if (!/^\/assets\/[\w./-]+$/.test(url.pathname) || url.pathname.includes('..') || !env || !env.ASSETS) {
    return text(request, 404, 'Not Found');
  }
  const res = await env.ASSETS.fetch(new Request(new URL(url.pathname, url.origin), request));
  if (res.status !== 200 && res.status !== 304) return text(request, 404, 'Not Found');
  const h = new Headers(res.headers);
  for (const k in SECURITY) h.set(k, SECURITY[k]);
  h.set('Cache-Control', /\/img\//.test(url.pathname) ? 'public, max-age=2592000, immutable' : 'public, max-age=3600');
  return new Response(res.body, { status: res.status, headers: h });
}

export default {
  async fetch(request, env) {
    let url = new URL(request.url);
    const origin = originOf(url, env);
    try {
      // /en, /fr… → /en/; el resto de rutas bajo un idioma comparten recursos y API con la raíz
      let lang = 'es';
      const m = url.pathname.match(LANG_PATH);
      if (m) {
        if (m[2] === undefined) return respond(request, 301, null, { Location: '/' + m[1] + '/' + url.search });
        lang = m[1];
        url = new URL(m[2] + url.search, url.origin);
      }
      const p = url.pathname;
      if (p.startsWith('/api/')) return await api(request, url);
      if (p === '/' || p === '/index.html') return page(request, lang, origin);
      if (!m && p === '/robots.txt') return text(request, 200, R.robots(origin), { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
      if (!m && p === '/sitemap.xml') return respond(request, 200, R.sitemap(origin, __LASTMOD__), { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
      return await asset(request, url, env);
    } catch (e) {
      console.log('error', e && e.message);
      return json(request, 500, { error: 'Error interno.' });
    }
  }
};
