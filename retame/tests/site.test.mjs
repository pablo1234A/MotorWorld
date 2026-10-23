/* Tests del sitio generado: SEO, enlaces, legal y placeholders.
 * Genera dos versiones en carpetas temporales (con y sin dominio).
 *   node tests/site.test.mjs */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT } from "../scripts/load.mjs";

const DOMAIN = "https://retame.example";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "retame-"));
const PROD = path.join(tmp, "prod"), DRAFT = path.join(tmp, "draft");
execFileSync("node", ["build.mjs"], { cwd: ROOT, env: { ...process.env, SITE_URL: DOMAIN, OUT_DIR: PROD }, stdio: "pipe" });
execFileSync("node", ["build.mjs"], { cwd: ROOT, env: { ...process.env, SITE_URL: "", OUT_DIR: DRAFT }, stdio: "pipe" });

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { console.error("  ✗ " + name + "\n    " + e.message); process.exitCode = 1; }
}
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]); }
const htmlFiles = walk(PROD).filter((f) => f.endsWith(".html"));
const pages = htmlFiles.map((f) => {
  const html = fs.readFileSync(f, "utf8"), rel = "/" + path.relative(PROD, f).replace(/index\.html$/, "");
  const m = (re) => (re.exec(html) || [])[1];
  return {
    file: f, rel, html,
    title: m(/<title>([^<]*)<\/title>/), desc: m(/<meta name="description" content="([^"]*)"/),
    canonical: m(/<link rel="canonical" href="([^"]*)"/), robots: m(/<meta name="robots" content="([^"]*)"/),
    h1: (html.match(/<h1[\s>]/g) || []).length
  };
});
const indexable = pages.filter((p) => !/noindex/.test(p.robots));
console.log("Sitio (" + pages.length + " páginas)");

test("URLs reales: categorías y retos con su propia página", () => {
  for (const u of ["/", "/retos/", "/reto-del-dia/", "/juegos/", "/duelos/", "/progreso/", "/sobre-retame/", "/como-funciona/", "/contacto/", "/privacidad/", "/cookies/", "/404.html"]) assert.ok(pages.some((p) => p.rel === u), u);
  for (const c of ["logica", "matematicas", "palabras", "memoria", "trivia", "estimacion", "observacion", "ordenar"]) assert.ok(pages.some((p) => p.rel === `/retos/${c}/`), c);
  assert.ok(pages.some((p) => p.rel === "/retos/logica/balanza-nueve-monedas/"));
  assert.ok(pages.some((p) => p.rel === "/retos/memoria/secuencia-colores/"));
  assert.ok(!pages.some((p) => /preguntas-absurdas/.test(p.rel)), "los juegos de opinión no tienen página indexable");
});
test("cada página indexable: title, description, canonical y un único H1", () => {
  for (const p of indexable) {
    assert.ok(p.title && p.title.length >= 15 && p.title.length <= 75, `${p.rel} título de ${p.title && p.title.length} caracteres`);
    assert.ok(p.desc && p.desc.length >= 50 && p.desc.length <= 170, `${p.rel} descripción de ${p.desc && p.desc.length} caracteres`);
    assert.equal(p.canonical, DOMAIN + p.rel, p.rel + " canonical");
    assert.equal(p.h1, 1, p.rel + " debe tener un H1");
  }
});
test("titles y descriptions únicos", () => {
  assert.equal(new Set(indexable.map((p) => p.title)).size, indexable.length);
  assert.equal(new Set(indexable.map((p) => p.desc)).size, indexable.length);
});
test("Open Graph y Twitter completos, con imagen existente de 1200×630", () => {
  for (const p of pages) {
    for (const k of ["og:title", "og:description", "og:image", "og:type", "og:site_name"]) assert.match(p.html, new RegExp(`property="${k}" content="[^"]+"`), p.rel + " " + k);
    for (const k of ["twitter:card", "twitter:title", "twitter:description", "twitter:image"]) assert.match(p.html, new RegExp(`name="${k}" content="[^"]+"`), p.rel + " " + k);
    const img = /property="og:image" content="([^"]+)"/.exec(p.html)[1];
    assert.ok(img.startsWith(DOMAIN + "/og/"), p.rel + " og:image absoluta");
    const file = path.join(PROD, img.slice(DOMAIN.length));
    assert.ok(fs.existsSync(file), "falta " + img);
    const buf = fs.readFileSync(file);
    assert.equal(buf.readUInt32BE(16), 1200); assert.equal(buf.readUInt32BE(20), 630);
  }
  const ch = pages.find((p) => p.rel === "/retos/logica/balanza-nueve-monedas/");
  assert.match(ch.html, /og\/reto-balanza-nueve-monedas\.png/, "imagen propia por reto");
});
test("HTML indexable sin JavaScript: enunciado, solución y enlaces internos", () => {
  const ch = pages.find((p) => p.rel === "/retos/logica/balanza-nueve-monedas/").html;
  assert.match(ch, /Tienes 9 monedas iguales/);
  assert.match(ch, /id="solucion"/);
  assert.match(ch, /href="\/retos\/logica\/"/);
  const cat = pages.find((p) => p.rel === "/retos/trivia/").html;
  assert.ok((cat.match(/href="\/retos\/trivia\/[a-z0-9-]+\/"/g) || []).length >= 10);
  const home = pages.find((p) => p.rel === "/").html;
  assert.match(home, /Jugar el reto de hoy/);
  assert.equal((home.match(/class="btn btn-primary btn-lg"/g) || []).length, 1, "una sola acción principal en el hero");
});
test("los retos de memoria no publican la secuencia y ordenar no publica el orden", () => {
  const mem = pages.find((p) => p.rel === "/retos/memoria/secuencia-colores/").html;
  assert.match(mem, /La secuencia cambia en cada partida/);
  const ord = pages.find((p) => p.rel === "/retos/ordenar/observacion-orden-alfabetico/").html;
  const shown = /<span class="opts">([^<]*)<\/span>/.exec(ord)[1];
  assert.notEqual(shown, "cuadro · espejo · lámpara · puerta · reloj · ventana");
});
test("todos los enlaces internos llevan a una página que existe", () => {
  const exists = (u) => {
    const clean = u.split("#")[0].split("?")[0];
    const f = path.join(PROD, clean);
    return fs.existsSync(clean.endsWith("/") ? path.join(f, "index.html") : f);
  };
  for (const p of pages) for (const [, u] of p.html.matchAll(/(?:href|src)="(\/[^"]*)"/g)) assert.ok(exists(u), `${p.rel} → ${u}`);
});
test("sitemap: solo URLs públicas, canónicas y sin duplicados", () => {
  const xml = fs.readFileSync(path.join(PROD, "sitemap.xml"), "utf8");
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.equal(new Set(locs).size, locs.length);
  assert.deepEqual(locs.slice().sort(), indexable.map((p) => DOMAIN + p.rel).sort());
  for (const l of locs) { assert.ok(!/[?#]/.test(l), l); assert.ok(!/progreso|404/.test(l), l); }
  assert.match(xml, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
});
test("robots.txt permite el rastreo y apunta al sitemap", () => {
  const r = fs.readFileSync(path.join(PROD, "robots.txt"), "utf8");
  assert.match(r, /User-agent: \*\nAllow: \//);
  assert.doesNotMatch(r, /Disallow: \/(assets|fonts|og|icons)?\s*$/m);
  assert.match(r, new RegExp(`Sitemap: ${DOMAIN}/sitemap.xml`));
});
test("páginas funcionales y 404 con noindex", () => {
  for (const u of ["/progreso/", "/404.html"]) assert.match(pages.find((p) => p.rel === u).robots, /noindex/);
  const nf = pages.find((p) => p.rel === "/404.html").html;
  for (const t of ["Volver a RÉTAME", "Jugar el reto de hoy", "Explorar retos"]) assert.ok(nf.includes(t), t);
});
test("sin dominio configurado: todo noindex, sin sitemap ni canonical inventado", () => {
  const files = walk(DRAFT).filter((f) => f.endsWith(".html"));
  for (const f of files) {
    const h = fs.readFileSync(f, "utf8");
    assert.match(h, /<meta name="robots" content="noindex, follow">/, f);
    assert.doesNotMatch(h, /rel="canonical"/, f);
  }
  assert.ok(!fs.existsSync(path.join(DRAFT, "sitemap.xml")));
});
test("ningún placeholder visible ni IDs de anuncio inventados", () => {
  for (const p of pages) {
    assert.doesNotMatch(p.html, /\[(CORREO|NOMBRE|TITULAR)[^\]]*\]/i, p.rel);
    assert.doesNotMatch(p.html, /data-ad-slot="auto"/, p.rel);
    assert.doesNotMatch(p.html, /ca-pub-0{6,}/, p.rel);
    assert.doesNotMatch(p.html, /undefined|NaN|\[object Object\]/, p.rel);
  }
  const js = walk(PROD).find((f) => /app\.[0-9a-f]+\.js$/.test(f));
  assert.doesNotMatch(fs.readFileSync(js, "utf8"), /data-ad-slot="auto"/);
  assert.ok(!fs.existsSync(path.join(PROD, "ads.txt")), "sin cuenta de AdSense no se publica ads.txt");
});
test("legal coherente con lo que hace la web", () => {
  const priv = pages.find((p) => p.rel === "/privacidad/").html;
  assert.match(priv, /retame:v2/); assert.match(priv, /enlaces de duelo/i); assert.match(priv, /no muestra anuncios/i);
  assert.doesNotMatch(priv, /fonts\.googleapis/);
  const cook = pages.find((p) => p.rel === "/cookies/").html;
  assert.match(cook, /no instala cookies propias/);
  for (const p of pages) assert.doesNotMatch(p.html, /fonts\.googleapis\.com|googletagmanager|google-analytics/, p.rel + " carga terceros");
});
test("datos estructurados válidos", () => {
  for (const p of pages) for (const [, j] of p.html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(j);
  assert.match(pages.find((p) => p.rel === "/retos/logica/").html, /"BreadcrumbList"/);
});
test("manifest de la PWA con iconos existentes", () => {
  const m = JSON.parse(fs.readFileSync(path.join(PROD, "manifest.webmanifest"), "utf8"));
  assert.equal(m.display, "standalone");
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(PROD, i.src)), i.src);
  assert.ok(m.icons.some((i) => i.purpose === "maskable"));
});
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} tests del sitio OK`);
