#!/usr/bin/env node
/**
 * Genera dist/richard-mille.html: la web completa en un único archivo
 * (CSS, JS e imágenes incrustados). Se abre con doble clic, sin carpetas.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const MIME = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png' };
const dataURI = (p) => 'data:' + MIME[path.extname(p)] + ';base64,' + fs.readFileSync(path.join(ROOT, p)).toString('base64');
// Evita que un "</script>" dentro del código cierre la etiqueta antes de tiempo
const safeScript = (js) => js.replace(/<\/script/gi, '<\\/script');

let html = read('index.html');

// Imágenes referenciadas en el HTML
html = html.replace(/assets\/img\/[\w./-]+\.(webp|jpg|png)/g, (m) => dataURI(m));

// Imágenes que el JS construye en tiempo de ejecución (piezas del despiece)
const assets = {};
fs.readdirSync(path.join(ROOT, 'assets/img/parts')).forEach((f) => {
  const rel = 'assets/img/parts/' + f;
  assets[rel] = dataURI(rel);
});
assets['assets/img/rm-assembled.webp'] = dataURI('assets/img/rm-assembled.webp');

// CSS y JS en línea
html = html.replace('<link rel="stylesheet" href="assets/css/styles.css">', () => '<style>\n' + read('assets/css/styles.css') + '\n</style>');
html = html.replace(/<link rel="preload" as="image"[^>]*>\n?/, '');
html = html.replace(
  /<script src="assets\/js\/core\.js"><\/script>\s*<script src="assets\/js\/scene-data\.js"><\/script>\s*<script src="assets\/js\/main\.js"><\/script>/,
  () => [
    '<script>window.RM_ASSETS = ' + JSON.stringify(assets) + ';</script>',
    '<script>\n' + safeScript(read('assets/js/core.js')) + '\n</script>',
    '<script>\n' + safeScript(read('assets/js/scene-data.js')) + '\n</script>',
    '<script>\n' + safeScript(read('assets/js/main.js')) + '\n</script>'
  ].join('\n  ')
);

if (/(src|href)="assets\//.test(html)) throw new Error('Quedan rutas a assets/ sin incrustar');

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const out = path.join(ROOT, 'dist', 'richard-mille.html');
fs.writeFileSync(out, html);
console.log('✓ ' + path.relative(ROOT, out) + ' · ' + (fs.statSync(out).size / 1024 / 1024).toFixed(2) + ' MB');
