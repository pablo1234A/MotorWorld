/**
 * Exporta la web pública a HTML estático para revisarla o compartirla sin
 * servidor (doble clic en index.html). No sustituye al despliegue real:
 * formularios, acceso, pagos y panel necesitan la aplicación Next.js.
 *
 * Uso:
 *   npm run test:e2e:build            # build sin servicios reales (planes por defecto)
 *   npx next start -p 3100 &
 *   node scripts/export-html.mjs [http://localhost:3100] [entregables]
 *
 * Genera:
 *   <out>/legalito-html/      web completa multipágina con enlaces relativos
 *   <out>/legalito-portada.html  portada en un único archivo (CSS y fuentes incrustados)
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = (process.argv[2] ?? "http://localhost:3100").replace(/\/$/, "");
const OUT = path.resolve(process.argv[3] ?? "entregables");
const SITE = path.join(OUT, "legalito-html");
const STATIC = path.resolve(".next/static");

const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
const sitemapPaths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname.replace(/\/$/, "") || "/");
const PAGES = [...new Set([...sitemapPaths, "/acceder", "/registro", "/recuperar"])];

/** "/" → index.html, "/guias/x" → guias/x.html */
const fileFor = (p) => (p === "/" ? "index.html" : `${p.slice(1)}.html`);

/** Menú móvil sin React: despliega los enlaces de la navegación principal. */
const MOBILE_MENU = `<script>
(function(){
  var btn=document.querySelector('button[aria-controls="menu-movil"]'); if(!btn) return;
  var nav=document.querySelector('nav[aria-label="Principal"]'); var cta=nav&&nav.nextElementSibling;
  var panel=document.createElement('div'); panel.id='menu-movil'; panel.hidden=true;
  panel.setAttribute('style','position:fixed;left:0;right:0;top:4rem;bottom:0;z-index:40;overflow-y:auto;background:var(--color-canvas,#fbfaf7);padding:1rem 1rem 2rem');
  var html='<nav aria-label="Principal móvil" style="display:flex;flex-direction:column;gap:.25rem">';
  (nav?nav.querySelectorAll('a'):[]).forEach(function(a){html+='<a href="'+a.getAttribute('href')+'" style="padding:.85rem .5rem;border-bottom:1px solid #e7e3da;font-size:17px;color:#1F3A5F">'+a.textContent+'</a>';});
  (cta?cta.querySelectorAll('a'):[]).forEach(function(a,i){html+='<a href="'+a.getAttribute('href')+'" style="margin-top:'+(i?'.5rem':'1.25rem')+';padding:.8rem;border-radius:.6rem;text-align:center;font-weight:500;'+(i?'background:#1F3A5F;color:#fff':'border:1px solid #d6d0c4;color:#1F3A5F')+'">'+a.textContent+'</a>';});
  panel.innerHTML=html+'</nav>'; btn.closest('header').appendChild(panel);
  btn.addEventListener('click',function(){var o=panel.hidden;panel.hidden=!o;btn.setAttribute('aria-expanded',String(o));btn.setAttribute('aria-label',o?'Cerrar menú':'Abrir menú');document.body.style.overflow=o?'hidden':'';});
})();
</script>`;

function relPrefix(file) {
  const depth = file.split("/").length - 1;
  return depth === 0 ? "./" : "../".repeat(depth);
}

function rewrite(html, file) {
  const pre = relPrefix(file);
  // Scripts de Next fuera (no hay servidor que hidrate); se conservan los datos estructurados.
  html = html.replace(/<script\b(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<link\b[^>]*rel="(?:preload|modulepreload|prefetch)"[^>]*>/gi, "");
  html = html.replace(/<next-route-announcer[\s\S]*?<\/next-route-announcer>/gi, "");
  html = html.replace(/(href|src)="\/_next\//g, `$1="${pre}_next/`);
  html = html.replace(/(href|src)="\/(icon\.svg|logo\.svg|logo-512\.png)(\?[^"]*)?"/g, `$1="${pre}$2"`);
  html = html.replace(/href="\/(?!\/)([^"#?]*)(#[^"]*)?"/g, (m, p, hash = "") => {
    const route = `/${p}`.replace(/\/$/, "") || "/";
    if (!PAGES.includes(route)) return m.replace('href="/', `href="${BASE}/`); // rutas de la app real
    return `href="${pre}${fileFor(route)}${hash}"`;
  });
  return html.replace("</body>", `${MOBILE_MENU}</body>`);
}

fs.rmSync(SITE, { recursive: true, force: true });
fs.mkdirSync(SITE, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const cssFiles = new Set();
let homeHtml = "";
for (const route of PAGES) {
  const page = await ctx.newPage();
  const res = await page.goto(BASE + route, { waitUntil: "networkidle" });
  if (!res || res.status() !== 200) throw new Error(`${route} → ${res?.status()}`);
  await page.evaluate(() => document.querySelectorAll("[data-nextjs-scroll-focus-boundary]").forEach((n) => n.removeAttribute("data-nextjs-scroll-focus-boundary")));
  const raw = "<!DOCTYPE html>\n" + (await page.evaluate(() => document.documentElement.outerHTML));
  for (const m of raw.matchAll(/href="\/_next\/static\/chunks\/([^"]+\.css)"/g)) cssFiles.add(m[1]);
  const file = fileFor(route);
  fs.mkdirSync(path.dirname(path.join(SITE, file)), { recursive: true });
  const html = rewrite(raw, file);
  fs.writeFileSync(path.join(SITE, file), html);
  if (route === "/") homeHtml = raw;
  await page.close();
  console.log("✓", route, "→", file);
}
await browser.close();

// Recursos estáticos: CSS, fuentes e iconos.
fs.mkdirSync(path.join(SITE, "_next/static/chunks"), { recursive: true });
for (const c of cssFiles) fs.copyFileSync(path.join(STATIC, "chunks", c), path.join(SITE, "_next/static/chunks", c));
fs.cpSync(path.join(STATIC, "media"), path.join(SITE, "_next/static/media"), { recursive: true });
for (const f of ["logo.svg", "logo-512.png"]) fs.copyFileSync(path.join("public", f), path.join(SITE, f));
fs.copyFileSync("src/app/icon.svg", path.join(SITE, "icon.svg"));

// Portada en un único archivo: CSS en línea y fuentes latinas en base64.
let css = [...cssFiles].map((c) => fs.readFileSync(path.join(STATIC, "chunks", c), "utf8")).join("\n");
css = css.replace(/@font-face\{[^}]*\}/g, (block) => {
  const m = block.match(/url\(\.\.\/media\/([^)]+)\)/);
  if (!m || !/^inter-latin(-ext)?-wght/.test(m[1])) return "";
  const b64 = fs.readFileSync(path.join(STATIC, "media", m[1])).toString("base64");
  return block.replace(m[0], `url(data:font/woff2;base64,${b64})`);
});
let single = homeHtml.replace(/<link\b[^>]*rel="stylesheet"[^>]*>/gi, "");
single = single.replace("</head>", `<style>${css}</style></head>`);
single = rewrite(single, "index.html")
  .replace(/href="\.\/(?!index\.html)([^"]+\.html)(#[^"]*)?"/g, (_m, f, h = "") => `href="legalito-html/${f}${h}"`)
  .replace(/(href|src)="\.\/(icon\.svg|logo\.svg|logo-512\.png)"/g, `$1="legalito-html/$2"`)
  .replace(/href="\.\/index\.html(#[^"]*)?"/g, (_m, h = "") => `href="${h || "#"}"`);
fs.writeFileSync(path.join(OUT, "legalito-portada.html"), single);

console.log(`\n${PAGES.length} páginas en ${SITE}\nPortada autocontenida: ${path.join(OUT, "legalito-portada.html")}`);
