'use strict';
/**
 * SEO del servidor:
 *  - Una URL por idioma (/, /en/, /fr/, /de/, /it/) servida ya traducida, para que los buscadores
 *    indexen cada versión con su propio texto.
 *  - Cabecera con URL canónica, alternativas hreflang (+ x-default), Open Graph y Twitter con
 *    URLs absolutas y datos estructurados (schema.org WebSite + WebPage).
 *  - Listado de boutiques escrito en el HTML (el navegador lo sustituye por el interactivo).
 *  - robots.txt y sitemap.xml con las alternativas de idioma.
 * La lógica es pura y está en render.js (la comparte el worker de Wix); aquí solo se lee index.html y se cachea.
 *
 * La URL pública se toma de SITE_URL (recomendado en producción, p. ej. https://www.ejemplo.com);
 * si no existe, se deduce de la petición.
 */
const fs = require('fs');
const path = require('path');
const R = require('./render.js');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');

/** Origen público del sitio, sin barra final. */
function originFrom(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, '');
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || (req.socket && req.socket.encrypted ? 'https' : 'http');
  let host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) host = 'localhost'; // evita inyectar cabeceras Host arbitrarias
  return (proto === 'https' ? 'https' : 'http') + '://' + host;
}

/* Páginas traducidas, en caché hasta que index.html cambie */
let cache = { mtime: -1, src: '', pages: {} };
function source() {
  const mtime = fs.statSync(INDEX).mtimeMs;
  if (mtime !== cache.mtime) cache = { mtime, src: fs.readFileSync(INDEX, 'utf8'), pages: {} };
  return cache;
}

function translatedPage(lang) {
  const c = source();
  if (!c.pages[lang]) c.pages[lang] = R.translatedPage(c.src, lang);
  return c.pages[lang];
}

/** HTML final de una página en un idioma, con la cabecera SEO para el origen indicado. */
function renderPage(lang, origin) {
  return R.renderPage(translatedPage(lang), lang, origin);
}

const robots = R.robots;

function sitemap(origin) {
  return R.sitemap(origin, new Date(source().mtime).toISOString().slice(0, 10));
}

module.exports = { originFrom, renderPage, robots, sitemap };
