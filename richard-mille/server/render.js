'use strict';
/**
 * Render SEO puro (sin fs ni red): páginas por idioma, robots.txt y sitemap.xml.
 * Lo comparten el servidor Node (seo.js) y el worker que se despliega en Wix (wix/worker.js),
 * así ambas versiones sirven exactamente el mismo HTML.
 */
const I18N = require('../assets/js/i18n.js');
const RM = require('../assets/js/core.js');

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function boutiqueList(lang) {
  const t = (s) => I18N.t(s, lang);
  return RM.BOUTIQUES.map((b) =>
    '<div class="bcard" role="listitem"><div class="bcard__top"><h3>' + esc(t(b.city)) + '</h3>' +
    '<span class="bcard__country mono">' + esc(t(b.country)) + '</span></div>' +
    '<p class="bcard__addr">' + esc(b.address) + '</p></div>'
  ).join('');
}

/** index.html traducido y preparado para servirse en /, /en/, /fr/… (sin la cabecera SEO, que depende del origen). */
function translatedPage(src, lang) {
  const html = lang === 'es' ? src : I18N.translateHTML(src, lang);
  return html
    .replace(/<html lang="es"/, '<html lang="' + lang + '" data-server="1"')
    // rutas absolutas: la misma página se sirve en /, /en/, /fr/…
    .replace(/(\s(?:src|href|data-img)=")assets\//g, '$1/assets/')
    .replace('<div class="boutiques__list" id="boutiqueList" role="list"></div>',
      '<div class="boutiques__list" id="boutiqueList" role="list">' + boutiqueList(lang) + '</div>');
}

/** Página final: la traducida más canónica, hreflang, Open Graph, Twitter y JSON-LD para el origen indicado. */
function renderPage(translated, lang, origin) {
  const html = translated;
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

/** lastmod: fecha AAAA-MM-DD de la última modificación de la página. */
function sitemap(origin, lastmod) {
  const alts = I18N.LANGS.map((l) => '    <xhtml:link rel="alternate" hreflang="' + l.id + '" href="' + esc(origin + I18N.path(l.id)) + '"/>').join('\n') +
    '\n    <xhtml:link rel="alternate" hreflang="x-default" href="' + esc(origin + '/') + '"/>';
  const urls = I18N.LANGS.map((l) =>
    '  <url>\n    <loc>' + esc(origin + I18N.path(l.id)) + '</loc>\n    <lastmod>' + lastmod + '</lastmod>\n' + alts + '\n  </url>'
  ).join('\n');
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + urls + '\n</urlset>\n';
}

/** Script en línea de la página (sensor de dispositivo e idioma), cuyo hash autoriza la CSP. */
function inlineScript(src) {
  const m = src.match(/<script>([\s\S]*?)<\/script>/);
  return m ? m[1] : '';
}

module.exports = { translatedPage, renderPage, robots, sitemap, inlineScript };
