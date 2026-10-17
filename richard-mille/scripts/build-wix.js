#!/usr/bin/env node
/**
 * Genera dist-wix/: la web preparada para alojamiento estático en Wix (sin el servidor Node).
 *  - Imágenes servidas desde la biblioteca de medios del sitio de Wix (scripts/wix-media.json).
 *  - Idiomas por parámetro: ?lang=es|en|fr|de|it (se puede enlazar e indexar), además de la detección automática.
 *  - SEO estático: hreflang hacia cada ?lang=, Open Graph absoluto, datos estructurados, robots.txt y sitemap.xml.
 * Uso: SITE_URL=https://xxx.wix-site-host.com node scripts/build-wix.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const I18N = require('../assets/js/i18n.js');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist-wix');
const SITE = (process.env.SITE_URL || '').replace(/\/+$/, '');
const media = JSON.parse(fs.readFileSync(path.join(__dirname, 'wix-media.json'), 'utf8'));
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const write = (p, s) => { fs.mkdirSync(path.dirname(path.join(OUT, p)), { recursive: true }); fs.writeFileSync(path.join(OUT, p), s); };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const langUrl = (l) => SITE + '/' + (l === 'es' ? '' : '?lang=' + l);

let html = read('index.html');

// 1) Imágenes del HTML → biblioteca de medios de Wix
html = html.replace(/assets\/img\/[\w./-]+\.(?:webp|jpg|png)/g, (m) => {
  if (!media[m]) throw new Error('Imagen sin URL de Wix: ' + m);
  return media[m];
});

// 2) Idioma por parámetro ?lang= (tiene prioridad y se recuerda)
const store = "      try { want = localStorage.getItem('rm-lang'); } catch (e) { /* almacenamiento no disponible */ }";
if (!html.includes(store)) throw new Error('No se encontró la lectura de preferencia en el script de cabecera');
html = html.replace(store, store + `
      var q = (location.search.match(/[?&]lang=([a-z]{2})/) || [])[1];
      if (L.indexOf(q) >= 0) { want = q; try { localStorage.setItem('rm-lang', q); } catch (e) { /* sin almacenamiento */ } }`);
html = html.replace(/href="\/(?:(en|fr|de|it)\/)?" hreflang="(\w+)"/g, (m, l, hl) => 'href="?lang=' + hl + '" hreflang="' + hl + '"');

// 3) Mapa de imágenes que el código construye al vuelo (piezas del despiece)
html = html.replace('<script src="assets/js/main.js"></script>', '<script src="assets/js/wix-assets.js"></script>\n  <script src="assets/js/main.js"></script>');
write('assets/js/wix-assets.js', '/* Imágenes servidas desde la biblioteca de medios de Wix */\nwindow.RM_ASSETS = ' + JSON.stringify(media, null, 1) + ';\n');

// 4) SEO estático (requiere SITE_URL)
if (SITE) {
  const image = media['assets/img/og.jpg'];
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1];
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1];
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': SITE + '/#website', url: SITE + '/', name: 'Richard Mille', inLanguage: I18N.IDS },
      { '@type': 'WebPage', '@id': SITE + '/#webpage', url: SITE + '/', name: title, description: desc, inLanguage: 'es', isPartOf: { '@id': SITE + '/#website' }, primaryImageOfPage: { '@type': 'ImageObject', url: image, width: 1200, height: 800 } }
    ]
  };
  const head = [
    ...I18N.LANGS.map((l) => '<link rel="alternate" hreflang="' + l.id + '" href="' + esc(langUrl(l.id)) + '">'),
    '<link rel="alternate" hreflang="x-default" href="' + esc(SITE + '/') + '">',
    '<meta property="og:url" content="' + esc(SITE + '/') + '">',
    '<meta property="og:locale" content="es_ES">',
    ...I18N.LANGS.filter((l) => l.id !== 'es').map((l) => '<meta property="og:locale:alternate" content="' + l.og + '">'),
    '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="800">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:image" content="' + esc(image) + '">',
    '<script type="application/ld+json">' + JSON.stringify(ld).replace(/</g, '\\u003c') + '</script>'
  ].join('\n  ');
  html = html.replace('</head>', '  ' + head + '\n</head>');
  write('robots.txt', 'User-agent: *\nAllow: /\n\nSitemap: ' + SITE + '/sitemap.xml\n');
  const alts = I18N.LANGS.map((l) => '    <xhtml:link rel="alternate" hreflang="' + l.id + '" href="' + esc(langUrl(l.id)) + '"/>').join('\n') +
    '\n    <xhtml:link rel="alternate" hreflang="x-default" href="' + esc(SITE + '/') + '"/>';
  const today = new Date().toISOString().slice(0, 10);
  write('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    I18N.LANGS.map((l) => '  <url>\n    <loc>' + esc(langUrl(l.id)) + '</loc>\n    <lastmod>' + today + '</lastmod>\n' + alts + '\n  </url>').join('\n') + '\n</urlset>\n');
}
if (/(src|href|data-img|content)="assets\/img/.test(html)) throw new Error('Quedan imágenes locales en el HTML');
write('index.html', html);

// 5) Hojas de estilo y código, sin cambios
['assets/css/styles.css', 'assets/js/i18n.js', 'assets/js/core.js', 'assets/js/scene-data.js', 'assets/js/main.js'].forEach((p) => write(p, read(p)));

console.log('✓ dist-wix/ ' + (SITE ? 'con SEO para ' + SITE : 'sin SEO (falta SITE_URL)'));
