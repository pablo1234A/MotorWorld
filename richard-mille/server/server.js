#!/usr/bin/env node
/**
 * Richard Mille — servidor de la web (Node.js, sin dependencias)
 *
 *  - Sirve el frontend estático con compresión, caché y cabeceras de seguridad.
 *  - Expone una API REST para boutiques, disponibilidad y citas.
 *  - El endpoint de citas es un MOCK: valida la solicitud y devuelve una
 *    referencia, pero no guarda ni envía ningún dato a ninguna parte.
 *  - SEO: páginas traducidas en /, /en/, /fr/, /de/, /it/, robots.txt y sitemap.xml (ver seo.js).
 *
 *  Uso:  node server/server.js      (PORT=3000 por defecto; SITE_URL=https://dominio para URLs canónicas)
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const SEO = require('./seo.js');
const R = require('./render.js');
const { createApi, createRateLimiter, MAX_BODY } = require('./api.js');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = new Set(['index.html', 'assets']); // solo esto se sirve

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.svg']);

/**
 * Cabeceras de seguridad. La CSP autoriza el pequeño script en línea de index.html
 * (sensor de dispositivo y clase no-js → js) mediante su hash, que se recalcula
 * automáticamente si index.html cambia, sin necesidad de reiniciar el servidor.
 */
let cspCache = { mtime: -1, headers: null };
function securityHeaders() {
  let mtime = 0;
  try { mtime = fs.statSync(path.join(ROOT, 'index.html')).mtimeMs; } catch (e) { /* sin index.html */ }
  if (mtime !== cspCache.mtime) {
    cspCache = {
      mtime,
      headers: {
        'Content-Security-Policy': [
          "default-src 'self'",
          "script-src 'self' 'sha256-" + inlineScriptHash() + "'",
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
      }
    };
  }
  return cspCache.headers;
}

/** Hash CSP del script en línea de index.html. */
function inlineScriptHash() {
  try {
    return crypto.createHash('sha256').update(R.inlineScript(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'))).digest('base64');
  } catch (e) {
    return '';
  }
}

/* ------------------------------------------------------------------------ */
/* Utilidades de respuesta                                                   */
/* ------------------------------------------------------------------------ */
function send(req, res, status, body, headers = {}) {
  const accept = String(req.headers['accept-encoding'] || '');
  let payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const h = Object.assign({}, securityHeaders(), headers);
  if (h['X-Compress'] && payload.length > 1024 && /\bbr\b/.test(accept)) {
    payload = zlib.brotliCompressSync(payload); h['Content-Encoding'] = 'br';
  } else if (h['X-Compress'] && payload.length > 1024 && /\bgzip\b/.test(accept)) {
    payload = zlib.gzipSync(payload); h['Content-Encoding'] = 'gzip';
  }
  delete h['X-Compress'];
  h['Content-Length'] = payload.length;
  if (h['Content-Encoding']) h['Vary'] = 'Accept-Encoding';
  res.writeHead(status, h);
  res.end(req.method === 'HEAD' ? undefined : payload);
}

function json(req, res, status, data, extra) {
  send(req, res, status, JSON.stringify(data), Object.assign({
    'Content-Type': MIME['.json'], 'Cache-Control': 'no-store', 'X-Compress': true
  }, extra));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const tooLarge = () => Object.assign(new Error('Payload too large'), { status: 413 });
    if (Number(req.headers['content-length']) > MAX_BODY) { req.resume(); reject(tooLarge()); return; }
    let size = 0, over = false; const chunks = [];
    req.on('data', (c) => {
      if (over) return; // se descarta el resto del cuerpo
      size += c.length;
      if (size > MAX_BODY) { over = true; chunks.length = 0; reject(tooLarge()); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/* ------------------------------------------------------------------------ */
/* API                                                                       */
/* ------------------------------------------------------------------------ */
function createApp(options = {}) {
  const log = options.quiet ? () => {} : (...a) => console.log(new Date().toISOString(), ...a);
  const handleApi = createApi({
    now: options.now, postLimit: options.postLimit, log,
    random: () => crypto.randomInt(0, 1e9) / 1e9
  });

  async function api(req, res, url) {
    const r = await handleApi({
      method: req.method,
      pathname: url.pathname,
      searchParams: url.searchParams,
      contentType: req.headers['content-type'],
      ip: req.socket.remoteAddress,
      readBody: () => readBody(req)
    });
    json(req, res, r.status, r.body, r.headers);
  }

  /* ---------------------------------------------------------------------- */
  /* Estáticos                                                               */
  /* ---------------------------------------------------------------------- */
  function serveStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return send(req, res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD', 'Content-Type': 'text/plain' });
    }
    let rel;
    try { rel = decodeURIComponent(url.pathname); } catch (e) { return send(req, res, 400, 'Bad Request', { 'Content-Type': 'text/plain' }); }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.normalize(path.join(ROOT, rel));
    const top = path.relative(ROOT, file).split(path.sep)[0];
    if (!file.startsWith(ROOT + path.sep) || !PUBLIC.has(top)) {
      return send(req, res, 404, 'Not Found', { 'Content-Type': 'text/plain' });
    }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return send(req, res, 404, 'Not Found', { 'Content-Type': 'text/plain' });
      const ext = path.extname(file).toLowerCase();
      const etag = 'W/"' + st.size.toString(16) + '-' + Math.floor(st.mtimeMs).toString(16) + '"';
      const headers = {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        ETag: etag,
        'Cache-Control': ext === '.html' ? 'no-cache' : /\/img\//.test(file) ? 'public, max-age=2592000, immutable' : 'public, max-age=3600',
        'X-Compress': COMPRESSIBLE.has(ext)
      };
      if (req.headers['if-none-match'] === etag) {
        const h = Object.assign({}, securityHeaders(), headers); delete h['X-Compress'];
        res.writeHead(304, h); return res.end();
      }
      fs.readFile(file, (e, buf) => e ? send(req, res, 500, 'Error', { 'Content-Type': 'text/plain' }) : send(req, res, 200, buf, headers));
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Páginas por idioma, robots.txt y sitemap.xml                            */
  /* ---------------------------------------------------------------------- */
  function page(req, res, lang) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return send(req, res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD', 'Content-Type': 'text/plain' });
    }
    send(req, res, 200, SEO.renderPage(lang, SEO.originFrom(req)), {
      'Content-Type': MIME['.html'], 'Content-Language': lang, 'Cache-Control': 'no-cache', 'X-Compress': true
    });
  }

  const LANG_PATH = /^\/(en|fr|de|it)(\/.*)?$/;

  return http.createServer(async (req, res) => {
    const started = Date.now();
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch (e) { return send(req, res, 400, 'Bad Request'); }
    try {
      // /en, /fr… → /en/; el resto de rutas bajo un idioma comparten recursos y API con la raíz
      let lang = 'es';
      const m = url.pathname.match(LANG_PATH);
      if (m) {
        if (m[2] === undefined) { res.writeHead(301, Object.assign({}, securityHeaders(), { Location: '/' + m[1] + '/' + url.search })); return res.end(); }
        lang = m[1];
        url = new URL(m[2] + url.search, 'http://localhost');
      }
      const p = url.pathname;
      if (p.startsWith('/api/')) await api(req, res, url);
      else if (p === '/' || p === '/index.html') page(req, res, lang);
      else if (!m && p === '/robots.txt') send(req, res, 200, SEO.robots(SEO.originFrom(req)), { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
      else if (!m && p === '/sitemap.xml') send(req, res, 200, SEO.sitemap(SEO.originFrom(req)), { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'X-Compress': true });
      else serveStatic(req, res, url);
    } catch (e) {
      log('error', e && e.message);
      if (!res.headersSent) json(req, res, 500, { error: 'Error interno.' });
    }
    res.on('finish', () => { if (url.pathname.startsWith('/api/')) log(req.method, url.pathname, res.statusCode, (Date.now() - started) + 'ms'); });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const server = createApp();
  server.listen(port, () => {
    console.log('\n  RICHARD MILLE · web concept');
    console.log('  → http://localhost:' + port + '\n');
  });
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

module.exports = { createApp, createRateLimiter };
