'use strict';
/**
 * SEO del servidor:
 *  - Una URL por idioma (/, /en/, /fr/, /de/, /it/) servida ya traducida, para que los buscadores
 *    indexen cada versión con su propio texto.
 *  - Cabecera con URL canónica, alternativas hreflang (+ x-default), Open Graph y Twitter con
 *    URLs absolutas y datos estructurados (schema.org WebSite + WebPage).
 *  - Listado de boutiques escrito en el HTML (el navegador lo sustituye por el interactivo).
 *  - robots.txt y sitemap.xml con las alternativas de idioma.
 *
 * La URL pública se toma de SITE_URL (recomendado en producción, p. ej. https://www.ejemplo.com);
 * si no existe, se deduce de la petición.
 */
const fs = require('fs');
const path = require('path');
const I18N = require('../assets/js/i18n.js');
const RM = require('../assets/js/core.js');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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

function boutiqueList(lang) {
  const t = (s) => I18N.t(s, lang);
  return RM.BOUTIQUES.map((b) =>
    '<div class="bcard" role="listitem"><div class="bcard__top"><h3>' + esc(t(b.city)) + '</h3>' +
    '<span class="bcard__country mono">' + esc(t(b.country)) + '</span></div>' +
    '<p class="bcard__addr">' + esc(b.address) + '</p></div>'
  ).join('');
}

function translatedPage(lang) {
  const c = source();
  if (!c.pages[lang]) {
    let html = lang === 'es' ? c.src : I18N.translateHTML(c.src, lang);
    html = html
      .replace(/<html lang="es"/, '<html lang="' + lang + '" data-server="1"')
      // rutas absolutas: la misma página se sirve en /, /en/, /fr/…
      .replace(/(\s(?:src|href|data-img)=")assets\//g, '$1/assets/')
      .replace('<div class="boutiques__list" id="boutiqueList" role="list"></div>',
        '<div class="boutiques__list" id="boutiqueList" role="list">' + boutiqueList(lang) + '</div>');
    c.pages[lang] = html;
  }
  return c.pages[lang];
}

/** HTML final de una página en un idioma, con la cabecera SEO para el origen indicado. */
function renderPage(lang, origin) {
  let html = translatedPage(lang);
  const url = origin + I18N.path(lang);
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  const image = origin + '/assets/img/og.jpg';
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': origin + '/#website', url: origin + '/', name: 'Richard Mille', inLanguage: I18N.IDS },
      {
        '@type': 'WebPage', '@id': url + '#webpage', url, name: title.replace(/&amp;/g, '&'), description: desc.replace(/&amp;/g, '&'),
        inLanguage: lang, isPartOf: { '@id': origin + '/#website' },
        primaryImageOfPage: { '@type': 'ImageObject', url: image, width: 1200, height: 800 }
      }
    ]
  };
  const head = [
    '<link rel="canonical" href="' + esc(url) + '">',
    ...I18N.LANGS.map((l) => '<link rel="alternate" hreflang="' + l.id + '" href="' + esc(origin + I18N.path(l.id)) + '">'),
    '<link rel="alternate" hreflang="x-default" href="' + esc(origin + '/') + '">',
    '<meta property="og:url" content="' + esc(url) + '">',
    '<meta property="og:locale" content="' + I18N.info(lang).og + '">',
    ...I18N.LANGS.filter((l) => l.id !== lang).map((l) => '<meta property="og:locale:alternate" content="' + l.og + '">'),
    '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="800">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:image" content="' + esc(image) + '">',
    '<script type="application/ld+json">' + JSON.stringify(ld).replace(/</g, '\\u003c') + '</script>'
  ].join('\n  ');
  return html
    .replace('<meta property="og:image" content="assets/img/og.jpg">', '<meta property="og:image" content="' + esc(image) + '">')
    .replace('</head>', '  ' + head + '\n</head>');
}

function robots(origin) {
  return 'User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ' + origin + '/sitemap.xml\n';
}

function sitemap(origin) {
  const lastmod = new Date(source().mtime).toISOString().slice(0, 10);
  const alts = I18N.LANGS.map((l) => '    <xhtml:link rel="alternate" hreflang="' + l.id + '" href="' + esc(origin + I18N.path(l.id)) + '"/>').join('\n') +
    '\n    <xhtml:link rel="alternate" hreflang="x-default" href="' + esc(origin + '/') + '"/>';
  const urls = I18N.LANGS.map((l) =>
    '  <url>\n    <loc>' + esc(origin + I18N.path(l.id)) + '</loc>\n    <lastmod>' + lastmod + '</lastmod>\n' + alts + '\n  </url>'
  ).join('\n');
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + urls + '\n</urlset>\n';
}

module.exports = { originFrom, renderPage, robots, sitemap };
