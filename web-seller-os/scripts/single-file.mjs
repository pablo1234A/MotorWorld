// Genera dist-single/web-seller-os.html: la app completa en un solo archivo
// (JS, CSS y favicon embebidos) para abrirla con doble clic, sin servidor.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
let html = readFileSync(join(dist, 'index.html'), 'utf8');

html = html.replace(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/, (_, f) => {
  // </script> dentro del bundle cerraría la etiqueta antes de tiempo
  const js = readFileSync(join(dist, f), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">${js}</script>`;
});
html = html.replace(/<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+\.css)">/, (_, f) => `<style>${readFileSync(join(dist, f), 'utf8')}</style>`);

const favicon = readFileSync('public/favicon.svg');
html = html.replace(/<link rel="icon" href="\.\/favicon\.svg"[^>]*>/, `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,${favicon.toString('base64')}">`);
// el manifest no se puede cargar desde file://
html = html.replace(/\s*<link rel="manifest"[^>]*>/, '');

if (/src="\.\/assets|href="\.\/assets/.test(html)) throw new Error('Quedaron recursos sin embeber');
mkdirSync('dist-single', { recursive: true });
writeFileSync('dist-single/web-seller-os.html', html);
console.log(`dist-single/web-seller-os.html · ${(html.length / 1024).toFixed(0)} KB`);
