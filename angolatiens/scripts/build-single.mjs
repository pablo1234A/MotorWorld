// Empaqueta el sitio generado (./site) en un único archivo autónomo: angolatiens.html.
// Todas las páginas van como <template>; un pequeño enrutador usa el hash (#/guias/...).
// CSS, tipografías, datos y descargas quedan incrustados: funciona abriéndolo sin servidor.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SITE = join(ROOT, 'site');
const read = (p) => readFileSync(join(SITE, p), 'utf8');
const pageFile = (path) => (path.endsWith('/') ? join(path, 'index.html') : path);

const sitemap = read('sitemap.xml');
const origin = sitemap.match(/<loc>(https?:\/\/[^/]+)/)[1];
const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].slice(origin.length));

// Descargas (.txt/.csv) como data URI.
const dataUri = (p) => {
  const type = p.endsWith('.csv') ? 'text/csv' : 'text/plain';
  return `data:${type};charset=utf-8,${encodeURIComponent(read(p))}`;
};
const rewrite = (html) => html
  .replace(/href="(\/plantillas\/descargas\/[^"]+)" download/g, (_, p) => `href="${dataUri(p)}" download="${p.split('/').pop()}"`)
  .replace(/href="\/(?!\/)/g, 'href="#/')
  .replace(/action="\/herramientas\/"/g, 'action="#/herramientas/"');

const extract = (html) => {
  const title = html.match(/<title>([^<]*)<\/title>/)[1];
  const start = html.indexOf('</ul></nav>') + '</ul></nav>'.length;
  const end = html.indexOf('</main>') + '</main>'.length;
  return { title, body: rewrite(html.slice(start, end)) };
};

const templates = [...paths, '/404.html'].map((path) => {
  const { title, body } = extract(read(pageFile(path)));
  const key = path === '/404.html' ? '404' : path;
  return `<template data-path="${key}" data-title="${title}">${body}</template>`;
}).join('\n');

// Carcasa: cabecera, navegación, barra de comparación y pie de la portada.
const home = read('index.html');
const shellTop = rewrite(home.slice(home.indexOf('<body>') + 6, home.indexOf('</ul></nav>') + '</ul></nav>'.length))
  .replace(/<h1 class="masthead__tag">([^<]*)<\/h1>/, '<p class="masthead__tag">$1</p>')
  .replace(/ aria-current="page"/g, '');
const shellBottom = rewrite(home.slice(home.indexOf('</main>') + 7, home.indexOf('<script src="/assets/app.js"')));

let css = read('assets/styles.css').replace(/url\(\/assets\/fonts\/([^)]+)\)/g, (_, f) =>
  `url(data:font/woff2;base64,${readFileSync(join(SITE, 'assets/fonts', f)).toString('base64')})`);
const favicon = 'data:image/svg+xml,' + encodeURIComponent(read('favicon.svg'));
const tools = read('assets/tools.json');
const app = read('assets/app.js');
const description = home.match(/<meta name="description" content="([^"]*)"/)[1];

const router = `(function () {
  var view = document.getElementById('view');
  var tpl = function (p) { return document.querySelector('template[data-path="' + p + '"]'); };
  function render() {
    var h = location.hash;
    if (h && h.indexOf('#/') !== 0) return; // anclas normales
    var raw = h ? h.slice(1) : '/';
    var path = raw.split(/[?#]/)[0] || '/';
    if (path.slice(-1) !== '/' && tpl(path + '/')) path += '/';
    var t = tpl(path) || tpl('404');
    view.replaceChildren(t.content.cloneNode(true));
    document.title = t.getAttribute('data-title');
    document.querySelectorAll('.mainnav a').forEach(function (a) {
      var href = a.getAttribute('href').slice(1);
      if (href !== '/' && path.indexOf(href) === 0) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    window.AngInit();
    var frag = raw.split('#')[1];
    var target = frag && document.getElementById(frag);
    if (target) target.scrollIntoView(); else window.scrollTo(0, 0);
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href');
    if (href === '#main') { e.preventDefault(); var m = document.getElementById('main'); if (m) { m.setAttribute('tabindex', '-1'); m.focus(); } return; }
    if (href.charAt(0) === '/' && !a.hasAttribute('download')) { e.preventDefault(); location.hash = href; }
  });
  window.addEventListener('hashchange', render);
  render();
})();`;

const out = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Angolatiens</title>
<meta name="description" content="${description}">
<meta name="theme-color" content="#ffffff">
<link rel="icon" href="${favicon}">
<style>${css}</style>
</head>
<body>
${shellTop}
<div id="view"></div>
${shellBottom}
${templates}
<script>window.ANG_SINGLE = true; window.ANG_TOOLS = ${tools.replace(/</g, '\\u003c')};</script>
<script>${app}</script>
<script>${router}</script>
</body>
</html>
`;
const file = join(ROOT, 'angolatiens.html');
writeFileSync(file, out);
console.log(`Archivo único generado: ${file} (${(out.length / 1024).toFixed(0)} KB, ${paths.length + 1} páginas)`);
