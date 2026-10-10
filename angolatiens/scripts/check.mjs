// Comprobaciones estáticas del sitio generado: enlaces internos, SEO básico y JSON-LD.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(dirname(fileURLToPath(import.meta.url))), 'site');
const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') && files.push(p);
  }
})(SITE);

const errors = [];
const titles = new Map();
const descs = new Map();
const resolve = (href) => {
  const clean = href.split('#')[0].split('?')[0];
  if (!clean) return true;
  const p = join(SITE, clean);
  return clean.endsWith('/') ? existsSync(join(p, 'index.html')) : existsSync(p);
};

for (const file of files) {
  const rel = file.slice(SITE.length);
  const html = readFileSync(file, 'utf8');
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1];
  const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1];
  const h1s = (html.match(/<h1[\s>]/g) || []).length;
  if (!title) errors.push(`${rel}: sin <title>`);
  if (!desc) errors.push(`${rel}: sin meta description`);
  if (desc && (desc.length < 70 || desc.length > 175)) errors.push(`${rel}: description de ${desc.length} caracteres`);
  if (title && title.length > 70 && !rel.endsWith('404.html')) errors.push(`${rel}: title de ${title.length} caracteres`);
  if (h1s !== 1) errors.push(`${rel}: ${h1s} h1`);
  if (!/<link rel="canonical"/.test(html)) errors.push(`${rel}: sin canonical`);
  if (title) titles.set(title, [...(titles.get(title) || []), rel]);
  if (desc) descs.set(desc, [...(descs.get(desc) || []), rel]);
  for (const [, href] of html.matchAll(/href="(\/[^"]*)"/g)) if (!resolve(href)) errors.push(`${rel}: enlace roto ${href}`);
  for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(json); } catch { errors.push(`${rel}: JSON-LD inválido`); }
  }
  if (/href="#"/.test(html)) errors.push(`${rel}: enlace vacío href="#"`);
  const imgsNoAlt = (html.match(/<img(?![^>]*alt=)[^>]*>/g) || []).length;
  if (imgsNoAlt) errors.push(`${rel}: ${imgsNoAlt} imágenes sin alt`);
}
for (const [t, f] of titles) if (f.length > 1) errors.push(`Título duplicado "${t}": ${f.join(', ')}`);
for (const [d, f] of descs) if (f.length > 1) errors.push(`Description duplicada en: ${f.join(', ')}`);

const sitemap = readFileSync(join(SITE, 'sitemap.xml'), 'utf8');
const site = sitemap.match(/<loc>(https?:\/\/[^/]+)/)[1];
for (const [, loc] of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) if (!resolve(loc.slice(site.length))) errors.push(`sitemap: ${loc} no existe`);

if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`\n${errors.length} problemas en ${files.length} páginas.`);
  process.exit(1);
}
console.log(`OK: ${files.length} páginas HTML sin enlaces rotos ni problemas de SEO básico.`);
