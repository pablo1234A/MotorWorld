#!/usr/bin/env node
/**
 * Richard Mille — servidor de la web (Node.js, sin dependencias)
 *
 *  - Sirve el frontend estático con compresión, caché y cabeceras de seguridad.
 *  - Expone una API REST para boutiques, disponibilidad y citas.
 *  - El endpoint de citas es un MOCK: valida la solicitud y devuelve una
 *    referencia, pero no guarda ni envía ningún dato a ninguna parte.
 *
 *  Uso:  node server/server.js      (PORT=3000 por defecto)
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const RM = require('../assets/js/core.js');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = new Set(['index.html', 'assets']); // solo esto se sirve
const MAX_BODY = 8 * 1024;

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
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const m = html.match(/<script>([\s\S]*?)<\/script>/);
    return m ? crypto.createHash('sha256').update(m[1]).digest('base64') : '';
  } catch (e) {
    return '';
  }
}

/* ------------------------------------------------------------------------ */
/* Limitador de peticiones (ventana fija, en memoria)                        */
/* ------------------------------------------------------------------------ */
function createRateLimiter(limit, windowMs) {
  const hits = new Map();
  return function allow(key, now = Date.now()) {
    const e = hits.get(key);
    if (!e || now - e.start > windowMs) { hits.set(key, { start: now, n: 1 }); return true; }
    e.n++;
    if (hits.size > 5000) hits.clear(); // evita crecer sin límite
    return e.n <= limit;
  };
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

function publicBoutique(b) {
  return {
    id: b.id, city: b.city, country: b.country, region: b.region, address: b.address,
    lat: b.lat, lng: b.lng, timezone: b.tz, flagship: !!b.flagship, hours: b.hours
  };
}

/* ------------------------------------------------------------------------ */
/* API                                                                       */
/* ------------------------------------------------------------------------ */
function createApp(options = {}) {
  const now = options.now || (() => new Date());
  const allowPost = createRateLimiter(options.postLimit || 20, 60 * 1000);
  const log = options.quiet ? () => {} : (...a) => console.log(new Date().toISOString(), ...a);

  async function api(req, res, url) {
    const route = url.pathname.replace(/\/+$/, '');

    if (route === '/api/health' && req.method === 'GET') {
      return json(req, res, 200, { ok: true, service: 'rm-web', time: now().toISOString() });
    }

    if (route === '/api/boutiques' && req.method === 'GET') {
      const region = url.searchParams.get('region');
      const list = RM.BOUTIQUES.filter((b) => !region || b.region === region).map(publicBoutique);
      return json(req, res, 200, { regions: RM.REGIONS, boutiques: list }, { 'Cache-Control': 'public, max-age=300' });
    }

    const one = route.match(/^\/api\/boutiques\/([a-z-]+)$/);
    if (one && req.method === 'GET') {
      const b = RM.getBoutique(one[1]);
      return b ? json(req, res, 200, publicBoutique(b)) : json(req, res, 404, { error: 'Boutique no encontrada.' });
    }

    if (route === '/api/availability' && req.method === 'GET') {
      const av = RM.getAvailability(url.searchParams.get('boutique'), url.searchParams.get('date'), now());
      return json(req, res, av.error ? 400 : 200, av);
    }

    if (route === '/api/appointments') {
      if (req.method !== 'POST') return json(req, res, 405, { error: 'Método no permitido.' }, { Allow: 'POST' });
      if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) {
        return json(req, res, 415, { error: 'Se esperaba application/json.' });
      }
      if (!allowPost(req.socket.remoteAddress || 'unknown')) {
        return json(req, res, 429, { error: 'Demasiadas solicitudes. Inténtelo en un minuto.' }, { 'Retry-After': '60' });
      }
      let input;
      try { input = JSON.parse(await readBody(req)); } catch (e) {
        if (e.status === 413) return json(req, res, 413, { error: 'Solicitud demasiado grande.' }, { Connection: 'close' });
        return json(req, res, 400, { error: 'JSON no válido.' });
      }
      const result = RM.validateAppointment(input, now());
      if (!result.ok) {
        const status = result.errors.time === 'Esa hora ya no está disponible.' ? 409 : 422;
        return json(req, res, status, { errors: result.errors });
      }
      const v = result.value;
      const reference = RM.makeReference(v.boutique, v.date, () => crypto.randomInt(0, 1e9) / 1e9);
      // MOCK: no se persiste ni se envía nada. Solo se registra la referencia, sin datos personales.
      log('cita simulada', reference);
      return json(req, res, 201, {
        reference,
        status: 'simulated',
        appointment: { boutique: v.boutique, date: v.date, time: v.time, reason: v.reason, interest: v.interest },
        note: 'Entorno de demostración: la solicitud se ha validado pero no se ha almacenado ni enviado.'
      });
    }

    return json(req, res, 404, { error: 'Ruta no encontrada.' });
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

  return http.createServer(async (req, res) => {
    const started = Date.now();
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch (e) { return send(req, res, 400, 'Bad Request'); }
    try {
      if (url.pathname.startsWith('/api/')) await api(req, res, url);
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
