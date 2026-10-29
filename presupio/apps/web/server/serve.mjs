#!/usr/bin/env node
/*
 * Servidor de producción del frontend, sin dependencias: sirve la compilación (dist/) con las
 * cabeceras de seguridad de security-headers.mjs, devuelve index.html en las rutas de la
 * aplicación y reenvía /api/ a la API (mismo origen: cookie HttpOnly sin CORS).
 *
 *   PORT=8080 API_URL=http://127.0.0.1:3000 node server/serve.mjs
 *
 * Es una opción: también se puede usar nginx (ops/nginx/presupio-web.conf) o un alojamiento
 * estático con dist/_headers. Pon delante un terminador TLS (HTTPS) en producción.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cacheHeaders, securityHeaders } from './security-headers.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

// Cabeceras de la petición que se reenvían a la API (sin hop-by-hop).
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'host']);

export function createWebServer({ root, apiUrl, log = () => {} }) {
  const rootDir = path.resolve(root);
  const api = apiUrl ? new URL(apiUrl) : null;

  const withSecurity = (headers = {}) => ({ ...securityHeaders, ...headers });

  async function sendFile(req, res, file, cache) {
    const info = await stat(file);
    res.writeHead(200, withSecurity({
      'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': cache,
    }));
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  }

  function sendError(res, status, message) {
    res.writeHead(status, withSecurity({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }));
    res.end(message);
  }

  function proxyToApi(req, res) {
    if (!api) return sendError(res, 502, 'API no configurada');
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) if (!HOP_BY_HOP.has(k)) headers[k] = v;
    headers['x-forwarded-for'] = [req.headers['x-forwarded-for'], req.socket.remoteAddress].filter(Boolean).join(', ');
    headers['x-forwarded-proto'] = req.headers['x-forwarded-proto'] ?? 'http';
    headers.host = req.headers.host ?? api.host;
    const upstream = http.request(
      { hostname: api.hostname, port: api.port || 80, path: req.url, method: req.method, headers },
      (apiRes) => {
        // Las respuestas de la API llevan sus propias cabeceras de seguridad (helmet).
        res.writeHead(apiRes.statusCode ?? 502, apiRes.headers);
        apiRes.pipe(res);
      },
    );
    upstream.on('error', (err) => {
      log(`API no disponible: ${err.message}`);
      if (!res.headersSent) sendError(res, 502, 'API no disponible');
      else res.destroy();
    });
    req.pipe(upstream);
  }

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return proxyToApi(req, res);
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        return sendError(res, 405, 'Método no permitido');
      }
      let pathname;
      try {
        pathname = decodeURIComponent(url.pathname);
      } catch {
        return sendError(res, 400, 'Ruta no válida');
      }
      if (pathname.includes('\0')) return sendError(res, 400, 'Ruta no válida');
      const file = path.resolve(rootDir, `.${path.posix.normalize(pathname)}`);
      // Nunca fuera de dist/ (../, rutas absolutas, codificaciones).
      if (file !== rootDir && !file.startsWith(rootDir + path.sep)) return sendError(res, 404, 'No encontrado');
      const info = await stat(file).catch(() => null);
      if (info?.isFile()) {
        const isAsset = pathname.startsWith('/assets/');
        return sendFile(req, res, file, isAsset ? cacheHeaders.assets : file.endsWith('.html') ? cacheHeaders.html : 'public, max-age=3600');
      }
      // Un archivo con extensión que no existe es un 404 de verdad (no la aplicación).
      if (path.extname(pathname)) return sendError(res, 404, 'No encontrado');
      // Rutas de la aplicación (/presupuestos/…): index.html; el enrutador decide.
      return sendFile(req, res, path.join(rootDir, 'index.html'), cacheHeaders.html);
    } catch (err) {
      log(`Error al servir ${req.url}: ${err.message}`);
      if (!res.headersSent) sendError(res, 500, 'Error interno');
    }
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = process.env.WEB_ROOT ?? path.join(here, '..', 'dist');
  const port = Number(process.env.PORT ?? 8080);
  const host = process.env.HOST ?? '0.0.0.0';
  const server = createWebServer({ root, apiUrl: process.env.API_URL ?? process.env.PRESUPIO_API_PROXY, log: (m) => console.error(m) });
  server.listen(port, host, () => console.log(`Presupio web en http://${host}:${port} (raíz ${root})`));
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
