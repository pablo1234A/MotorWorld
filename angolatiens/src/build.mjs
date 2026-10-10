// Generador estático de Angolatiens. Sin dependencias: `node src/build.mjs`.
// Escribe el sitio completo en ./site, listo para cualquier alojamiento estático.
import { mkdirSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { site, nav, categories } from './data/site.mjs';
import { tools, toolBySlug } from './data/tools.mjs';
import { guides, guideBySlug } from './data/guides.mjs';
import { businesses } from './data/businesses.mjs';
import { templates, csvResources } from './data/templates.mjs';
import { news } from './data/news.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, 'site');
const pages = []; // para el sitemap

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const abs = (path) => site.url + path;

function write(path, html, { sitemap = true, lastmod = site.reviewed } = {}) {
  const file = path.endsWith('/') ? join(OUT, path, 'index.html') : join(OUT, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  if (sitemap) pages.push({ path, lastmod });
}

/* ---------------- Plantilla base ---------------- */
function layout({ path, title, description, body, jsonld = [], crumbs = null, noindex = false, ogType = 'website' }) {
  const fullTitle = path === '/' ? `${site.name}: IA práctica para autónomos y pymes` : title.length <= 52 ? `${title} | ${site.name}` : title;
  const crumbLd = crumbs && {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [{ name: 'Inicio', path: '/' }, ...crumbs].map((c, i) => ({
      '@type': 'ListItem', position: i + 1, name: c.name, ...(c.path ? { item: abs(c.path) } : {}),
    })),
  };
  const ld = [...jsonld, crumbLd].filter(Boolean);
  const current = (href) => (href !== '/' && path.startsWith(href) ? ' aria-current="page"' : '');
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${abs(path)}">
${noindex ? '<meta name="robots" content="noindex">\n' : ''}<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="${site.name}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${abs(path)}">
<meta property="og:locale" content="es_ES">
<meta name="theme-color" content="#ffffff">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/assets/fonts/source-serif-4-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/inter-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/styles.css">
${ld.map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n')}
</head>
<body>
<a class="skip" href="#main">Saltar al contenido</a>
<div class="topbar"><div class="wrap"><span class="topbar__date">Datos revisados en ${site.reviewedLabel}</span><a href="/transparencia/">Cómo nos financiamos</a></div></div>
<header class="masthead">
  <a class="logo" href="/" aria-label="${site.name}, ir a la portada"><span class="logo__word">${site.name}</span><span class="logo__dot" aria-hidden="true"></span></a>
  ${path === '/' ? `<h1 class="masthead__tag">${site.tagline}</h1>` : `<p class="masthead__tag">${site.tagline}</p>`}
</header>
<nav class="mainnav" aria-label="Secciones"><ul>
${nav.map((n) => `<li><a href="${n.href}"${current(n.href)}>${n.label}</a></li>`).join('\n')}
</ul></nav>
${crumbs ? breadcrumbs(crumbs) : ''}
<main id="main">
${body}
</main>
<div class="compare-bar" id="compare-bar" hidden><div class="wrap"><span id="compare-count">0 de 3 seleccionadas</span><span><button type="button" class="btn btn--sm btn--ghost" id="compare-clear">Vaciar</button> <a class="btn btn--sm" id="compare-go" href="/comparar/">Comparar ahora</a></span></div></div>
${footer()}
<script src="/assets/app.js" defer></script>
</body>
</html>`;
}

function breadcrumbs(crumbs) {
  const all = [{ name: 'Inicio', path: '/' }, ...crumbs];
  return `<nav class="crumbs wrap" aria-label="Migas de pan"><ol>${all
    .map((c, i) => (i === all.length - 1 || !c.path ? `<li aria-current="page">${esc(c.name)}</li>` : `<li><a href="${c.path}">${esc(c.name)}</a></li>`))
    .join('')}</ol></nav>`;
}

function footer() {
  return `<footer class="footer"><div class="wrap">
<div class="footer-grid">
  <div><a class="logo" href="/"><span class="logo__word" style="font-size:28px">${site.name}</span><span class="logo__dot" style="font-size:28px" aria-hidden="true"></span></a>
  <p style="margin-top:10px;color:var(--ink-2)">Guías, herramientas y calculadoras para que los autónomos y pequeños negocios de España usen la inteligencia artificial con criterio. Sin humo y con precios revisados.</p></div>
  <div><h2>Secciones</h2><ul>${nav.map((n) => `<li><a href="${n.href}">${n.label}</a></li>`).join('')}</ul></div>
  <div><h2>Por negocio</h2><ul>${businesses.map((b) => `<li><a href="/negocios/${b.slug}/">${esc(b.name)}</a></li>`).join('')}</ul></div>
  <div><h2>Confianza</h2><ul>
    <li><a href="/sobre-angolatiens/">Sobre Angolatiens</a></li>
    <li><a href="/transparencia/">Transparencia y afiliación</a></li>
    <li><a href="/contacto/">Contacto</a></li>
    <li><a href="/aviso-legal/">Aviso legal</a></li>
    <li><a href="/privacidad/">Privacidad</a></li>
    <li><a href="/cookies/">Cookies</a></li>
    <li><a href="/condiciones/">Condiciones de uso</a></li>
  </ul></div>
</div>
<p class="small">Angolatiens no está vinculado a las marcas citadas. Los nombres comerciales pertenecen a sus titulares. Las estimaciones de las calculadoras son orientativas.</p>
</div></footer>`;
}

/* ---------------- Componentes ---------------- */
const cover = (c, { sm = false, href = null, label = '' } = {}) => {
  const inner = `<span class="cover__text">${esc(c.text)}</span>`;
  const cls = `cover cover--${c.tone}${sm ? ' cover--sm' : ''}`;
  return href ? `<a class="${cls}" href="${href}" tabindex="-1" aria-hidden="true">${inner}</a>` : `<div class="${cls}" role="img" aria-label="${esc(label || c.text)}">${inner}</div>`;
};

const guideCard = (g) => `<article class="card">
${cover(g.cover, { sm: true, href: `/guias/${g.slug}/` })}
<a class="kicker" href="/guias/">${esc(g.kicker)}</a>
<h3><a href="/guias/${g.slug}/">${esc(g.title)}</a></h3>
<p>${esc(g.description)}</p>
<span class="meta">${g.readingMin} min de lectura</span>
</article>`;

const ES = { si: 'En español', parcial: 'Español parcial', no: 'En inglés' };
const freeTag = (t) => (t.free.has === true ? '<span class="tag tag--ok">Plan gratuito</span>' : t.free.has === 'trial' ? '<span class="tag">Prueba gratuita</span>' : '<span class="tag">Sin plan gratuito</span>');
const priceText = (t) => (t.price.level === 'sin-verificar' ? 'Precio: consulta la web oficial' : `${t.price.text} (${t.price.level === 'oficial' ? 'web oficial' : 'fuentes secundarias'})`);

const toolItem = (t) => `<article class="tool-item">
<div><a class="kicker" href="/herramientas/?cat=${t.cat}">${esc(categories[t.cat].label)}</a>
<h3><a href="/herramientas/${t.slug}/">${esc(t.name)}</a></h3></div>
<button type="button" class="chip compare-toggle" data-compare="${t.slug}" aria-pressed="false">+ Comparar</button>
<p>${esc(t.summary)}</p>
<div class="tags">${freeTag(t)}<span class="tag">${ES[t.spanish]}</span>${t.technical ? '<span class="tag tag--brand">Requiere perfil técnico</span>' : ''}<span class="tag">${esc(priceText(t))}</span></div>
</article>`;

const toolChips = (slugs) => `<ul class="toolchips">${slugs.map((s) => toolBySlug[s]).filter(Boolean).map((t) => `<li><a href="/herramientas/${t.slug}/">${esc(t.name)}</a></li>`).join('')}</ul>`;

const outLink = (t) => {
  const href = t.affiliateUrl || t.url;
  return `<a class="btn" href="${esc(href)}" rel="${t.affiliateUrl ? 'sponsored noopener' : 'noopener'}" target="_blank">Ir a la web oficial de ${esc(t.name)}</a>${t.affiliateUrl ? ' <span class="tag tag--brand">Enlace de afiliado</span>' : ''}`;
};

const SUGGESTIONS = ['Responder WhatsApp de clientes', 'Hacer presupuestos más rápido', 'Automatizar tareas repetitivas gratis', 'Publicar en Instagram sin diseñador', 'Resumir reuniones', 'Tener una página web'];

function finderForm({ home = false } = {}) {
  const catOptions = Object.entries(categories).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('');
  return `<form id="finder" role="search" ${home ? 'action="/herramientas/" method="get" data-target="1"' : 'data-keep-default'}>
<label for="finder-q">Describe qué quieres conseguir</label>
<div class="search-row" style="margin-top:6px"><input id="finder-q" name="q" type="search" placeholder="Ej.: contestar más rápido a los mensajes de WhatsApp" autocomplete="off"><button class="btn" type="submit">Buscar</button></div>
${home ? '' : `<div class="filters">
<label class="check"><input type="checkbox" id="f-free"> Con plan gratuito</label>
<label class="check"><input type="checkbox" id="f-es"> En español</label>
<label class="check"><input type="checkbox" id="f-nontech"> Sin conocimientos técnicos</label>
<div><label for="f-cat" class="sr-only">Categoría</label><select id="f-cat"><option value="">Todas las categorías</option>${catOptions}</select></div>
</div>`}
<div class="chips" aria-label="Búsquedas de ejemplo">${SUGGESTIONS.map((s) => `<button type="button" class="chip" data-suggest="${esc(s)}">${esc(s)}</button>`).join('')}</div>
<p class="hint">Recomendaciones basadas en nuestro catálogo revisado a mano. No usa IA externa ni guarda lo que escribes.</p>
</form>`;
}

/* ---------------- Páginas ---------------- */
function home() {
  const [lead, ...rest] = guides;
  const latest = rest.slice(0, 4);
  const body = `<div class="wrap">
<section class="lead-grid" aria-label="Destacados">
  <article class="lead-story">
    ${cover(lead.cover, { href: `/guias/${lead.slug}/` })}
    <a class="kicker" href="/guias/" style="margin-top:14px">${esc(lead.kicker)}</a>
    <h2><a href="/guias/${lead.slug}/">${esc(lead.title)}</a></h2>
    <p>${esc(lead.description)}</p>
    <span class="meta">${lead.readingMin} min de lectura · Actualizado el ${fmtDate(lead.updated)}</span>
  </article>
  <aside>
    <div class="section-title" style="margin-bottom:12px"><h2>Lo más útil esta semana</h2></div>
    <ol class="side-list">${latest.map((g, i) => `<li><span class="num">${i + 1}</span><a class="kicker" href="/guias/">${esc(g.kicker)}</a><h3><a href="/guias/${g.slug}/">${esc(g.title)}</a></h3></li>`).join('')}</ol>
  </aside>
</section>
</div>
<section class="finder-band"><div class="wrap">
<h2>¿Qué inteligencia artificial te sirve para tu negocio?</h2>
<p style="color:var(--ink-2)">Cuéntanos la tarea y te proponemos herramientas con su precio, si tienen plan gratuito y si funcionan en español.</p>
${finderForm({ home: true })}
</div></section>
<div class="wrap">
<section class="section">
  <div class="section-title"><h2>Guías prácticas</h2><a href="/guias/">Ver todas</a></div>
  <div class="cards">${guides.slice(1, 7).map(guideCard).join('')}</div>
</section>
<section class="section">
  <div class="section-title"><h2>Por tipo de negocio</h2><a href="/negocios/">Ver todos</a></div>
  <div class="cards cards--4">${businesses.map((b) => `<article class="card">${cover(b.cover, { sm: true, href: `/negocios/${b.slug}/` })}<h3><a href="/negocios/${b.slug}/">${esc(b.name)}</a></h3><p>${esc(b.intro.split('. ')[0].replace(/\.$/, ''))}.</p></article>`).join('')}</div>
</section>
<section class="section">
  <div class="section-title"><h2>Calculadoras gratuitas</h2><a href="/calculadoras/">Ver todas</a></div>
  <div class="cards">${calcs.map((c) => `<article class="card"><span class="kicker">Calculadora</span><h3><a href="/calculadoras/${c.slug}/">${esc(c.title)}</a></h3><p>${esc(c.description)}</p></article>`).join('')}</div>
</section>
<section class="section">
  <div class="section-title"><h2>Novedades que te afectan</h2><a href="/novedades/">Ver todas</a></div>
  <div class="cards">${news.map((n) => `<article class="card"><span class="meta">${fmtDate(n.date)}</span><h3><a href="/novedades/#${n.slug}">${esc(n.title)}</a></h3><p>${esc(n.action)}</p></article>`).join('')}</div>
</section>
<section class="section">
  <div class="section-title"><h2>Plantillas para copiar</h2><a href="/plantillas/">Ver todas</a></div>
  <div class="cards">${templates.slice(0, 3).map((t) => `<article class="card"><span class="kicker">${esc(t.cat)}</span><h3><a href="/plantillas/#${t.id}">${esc(t.title)}</a></h3><p>${esc(t.use)}</p></article>`).join('')}</div>
</section>
</div>`;
  const jsonld = [
    { '@context': 'https://schema.org', '@type': 'WebSite', name: site.name, url: abs('/'), inLanguage: site.lang, description: site.tagline },
    { '@context': 'https://schema.org', '@type': 'Organization', name: site.name, url: abs('/'), logo: abs('/favicon.svg') },
  ];
  write('/', layout({ path: '/', title: site.name, description: 'Guías prácticas, buscador y comparador de herramientas de IA para autónomos y pequeños negocios de España, con precios revisados, planes gratuitos y pasos de implantación.', body, jsonld }));
}

function toolsIndex() {
  const grouped = Object.entries(categories).map(([k, v]) => {
    const list = tools.filter((t) => t.cat === k);
    return list.length ? `<section class="section" id="cat-${k}"><div class="section-title"><h2>${esc(v.label)}</h2><span class="meta">${list.length} herramientas</span></div><div class="tool-list">${list.map(toolItem).join('')}</div></section>` : '';
  }).join('');
  const body = `<div class="wrap">
<header class="page-head"><h1>Buscador de herramientas de IA para tu negocio</h1>
<p>Describe la tarea que quieres resolver y filtra por plan gratuito, idioma o nivel técnico. Cada ficha indica de dónde sale el precio y cuándo lo revisamos.</p></header>
${finderForm()}
<div id="finder-results" aria-live="polite"></div>
<div id="default-list">${grouped}</div>
</div>`;
  write('/herramientas/', layout({ path: '/herramientas/', title: 'Buscador de herramientas de IA para autónomos y pymes', description: `Encuentra la herramienta de IA que necesita tu negocio: ${tools.length} herramientas revisadas con precio, plan gratuito, idioma y nivel técnico.`, body, crumbs: [{ name: 'Herramientas' }] }));
}

function toolPage(t) {
  const usedIn = guides.filter((g) => g.tools.includes(t.slug));
  const priceRow = t.price.level === 'sin-verificar'
    ? `Consulta el precio actual en la <a href="${esc(t.url)}" rel="noopener" target="_blank">web oficial</a>.${t.price.note ? ' ' + esc(t.price.note) : ' No publicamos cifras que no hayamos podido verificar.'}`
    : `${esc(t.price.text)}<br><small>Fuente: <a href="${esc(t.price.sourceUrl)}" rel="noopener" target="_blank">${esc(t.price.source)}</a> · ${t.price.level === 'oficial' ? 'web oficial' : 'fuentes secundarias, confírmalo en la web oficial'}</small>`;
  const body = `<div class="wrap"><article class="article" style="max-width:860px">
<header class="article-head">
<a class="kicker" href="/herramientas/?cat=${t.cat}">${esc(categories[t.cat].label)}</a>
<h1>${esc(t.name)}: para qué le sirve a un pequeño negocio</h1>
<p class="desc">${esc(t.summary)}</p>
<div class="tags">${freeTag(t)}<span class="tag">${ES[t.spanish]}</span>${t.technical ? '<span class="tag tag--brand">Requiere perfil técnico</span>' : '<span class="tag">Sin conocimientos técnicos</span>'}</div>
</header>
<div class="factsheet"><dl>
<dt>Fabricante</dt><dd>${esc(t.maker)}</dd>
<dt>Ideal para</dt><dd>${esc(t.bestFor)}</dd>
<dt>Plan gratuito</dt><dd>${t.free.has === true ? 'Sí' : t.free.has === 'trial' ? 'Prueba gratuita' : 'No'}. ${esc(t.free.note)}</dd>
<dt>Precio</dt><dd>${priceRow}</dd>
<dt>Idioma</dt><dd>${ES[t.spanish]}</dd>
<dt>Facilidad de uso</dt><dd>${t.ease} de 5 <small>(valoración editorial preliminar)</small></dd>
<dt>Revisado</dt><dd>${fmtDate(site.reviewed)}</dd>
</dl></div>
<div class="prose">
<div class="proscons">
<div><h2>Ventajas</h2><ul>${t.pros.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>
<div><h2>Limitaciones</h2><ul>${t.cons.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>
</div>
${usedIn.length ? `<h2>Cómo usar ${esc(t.name)} paso a paso</h2><ul>${usedIn.map((g) => `<li><a href="/guias/${g.slug}/">${esc(g.title)}</a></li>`).join('')}</ul>` : ''}
${t.alternatives.length ? `<h2>Alternativas</h2>${toolChips(t.alternatives)}<p style="margin-top:12px"><a href="/comparar/?h=${[t.slug, ...t.alternatives].slice(0, 3).join(',')}">Comparar ${esc(t.name)} con sus alternativas →</a></p>` : ''}
</div>
<p style="margin:28px 0 12px">${outLink(t)} <button type="button" class="btn btn--ghost" data-compare="${t.slug}" aria-pressed="false">+ Comparar</button></p>
<p class="disclosure">${t.affiliateUrl ? 'Este enlace es de afiliado: si contratas, Angolatiens puede recibir una comisión sin coste adicional para ti. No influye en nuestra valoración.' : 'Enlace directo a la web oficial, sin seguimiento ni comisión.'} <a href="/transparencia/">Cómo nos financiamos</a>. ¿Has visto un dato desactualizado? <a href="/contacto/">Avísanos</a>.</p>
</article></div>`;
  write(`/herramientas/${t.slug}/`, layout({
    path: `/herramientas/${t.slug}/`,
    title: `${t.name}: precio, plan gratis y alternativas`,
    description: `${t.summary} Precio, plan gratuito, ventajas y alternativas.`,
    body,
    crumbs: [{ name: 'Herramientas', path: '/herramientas/' }, { name: t.name }],
  }));
}

function comparePage() {
  const body = `<div class="wrap">
<header class="page-head"><h1>Comparador de herramientas de IA</h1>
<p>Elige hasta tres herramientas y compáralas por precio, plan gratuito, idioma, facilidad de uso y tipo de negocio al que se dirigen.</p></header>
<div id="comparator" data-reviewed="${site.reviewedLabel}">
<div class="compare-picker">
${[1, 2, 3].map((i) => `<div class="field"><label for="cmp-${i}">Herramienta ${i}</label><select id="cmp-${i}"><option value="">Cargando…</option></select></div>`).join('')}
</div>
<div id="compare-table" aria-live="polite"><div class="state" role="status"><strong>Cargando el comparador…</strong>Si no carga, revisa que JavaScript esté activado o consulta las <a href="/herramientas/">fichas de herramientas</a>.</div></div>
</div>
<section class="section"><div class="section-title"><h2>Comparativas habituales</h2></div>
<ul class="toolchips">
<li><a href="/comparar/?h=chatgpt,claude,gemini">ChatGPT vs Claude vs Gemini</a></li>
<li><a href="/comparar/?h=make,zapier,n8n">Make vs Zapier vs n8n</a></li>
<li><a href="/comparar/?h=tidio,manychat,whatsapp-business">Tidio vs ManyChat vs WhatsApp Business</a></li>
<li><a href="/comparar/?h=canva,gamma">Canva vs Gamma</a></li>
<li><a href="/comparar/?h=fireflies,notion">Fireflies vs Notion</a></li>
</ul></section>
</div>`;
  write('/comparar/', layout({ path: '/comparar/', title: 'Comparador de herramientas de IA para pequeños negocios', description: 'Compara herramientas de IA por precio, plan gratuito, idioma, facilidad de uso y tipo de negocio. Datos revisados y con fuente.', body, crumbs: [{ name: 'Comparador' }] }));
}

function guidesIndex() {
  const body = `<div class="wrap">
<header class="page-head"><h1>Guías prácticas de IA para autónomos</h1>
<p>Soluciones paso a paso para tareas concretas: responder clientes, preparar presupuestos, automatizar procesos, crear contenido y cumplir la normativa.</p></header>
<div class="cards">${guides.map(guideCard).join('')}</div></div>`;
  write('/guias/', layout({ path: '/guias/', title: 'Guías prácticas de IA para autónomos y pymes', description: 'Guías originales y paso a paso para usar la IA en un pequeño negocio: atención al cliente, presupuestos, automatización, contenido y protección de datos.', body, crumbs: [{ name: 'Guías' }] }));
}

function guidePage(g) {
  const related = g.related.map((s) => guideBySlug[s]).filter(Boolean);
  const body = `<div class="wrap"><article class="article">
<header class="article-head">
<a class="kicker" href="/guias/">${esc(g.kicker)}</a>
<h1>${esc(g.title)}</h1>
<p class="desc">${esc(g.description)}</p>
<p class="meta">Por la redacción de ${site.name} · Actualizado el <time datetime="${g.updated}">${fmtDate(g.updated)}</time> · ${g.readingMin} min de lectura</p>
</header>
${cover(g.cover, { label: g.kicker })}
<div class="prose">${g.body}</div>
<aside class="related">
<span class="kicker">Herramientas mencionadas</span>${toolChips(g.tools)}
${related.length ? `<div style="margin-top:28px"><span class="kicker">Sigue leyendo</span><div class="cards" style="grid-template-columns:repeat(2,1fr)">${related.map(guideCard).join('')}</div></div>` : ''}
</aside>
</article></div>`;
  const jsonld = [{
    '@context': 'https://schema.org', '@type': 'Article', headline: g.title, description: g.description,
    datePublished: g.updated, dateModified: g.updated, inLanguage: site.lang, mainEntityOfPage: abs(`/guias/${g.slug}/`),
    author: { '@type': 'Organization', name: site.name, url: abs('/') }, publisher: { '@type': 'Organization', name: site.name, url: abs('/') },
  }];
  write(`/guias/${g.slug}/`, layout({ path: `/guias/${g.slug}/`, title: g.seoTitle, description: g.description, body, jsonld, ogType: 'article', crumbs: [{ name: 'Guías', path: '/guias/' }, { name: g.kicker }] }), { lastmod: g.updated });
}

function businessesPages() {
  const idx = `<div class="wrap"><header class="page-head"><h1>IA por tipo de negocio</h1><p>Qué tareas conviene resolver primero según tu sector, con herramientas y guías concretas.</p></header>
<div class="cards cards--4">${businesses.map((b) => `<article class="card">${cover(b.cover, { sm: true, href: `/negocios/${b.slug}/` })}<h3><a href="/negocios/${b.slug}/">${esc(b.name)}</a></h3><p>${esc(b.description)}</p></article>`).join('')}</div></div>`;
  write('/negocios/', layout({ path: '/negocios/', title: 'Inteligencia artificial por tipo de negocio', description: 'Usos prácticos de la IA según tu sector: peluquerías, reformas, clínicas, restauración y más.', body: idx, crumbs: [{ name: 'Por negocio' }] }));
  for (const b of businesses) {
    const body = `<div class="wrap"><article class="article" style="max-width:860px">
<header class="article-head"><a class="kicker" href="/negocios/">Por negocio</a><h1>${esc(b.title)}</h1><p class="desc">${esc(b.intro)}</p></header>
${cover(b.cover, { label: b.name })}
<div class="prose">
<h2>Tres usos que dan resultado</h2>
${b.uses.map((u, i) => `<h3>${i + 1}. ${esc(u.title)}</h3><p>${esc(u.text)}</p>${toolChips(u.tools)}<p style="margin-top:10px"><a href="/guias/${u.guide}/">Guía: ${esc(guideBySlug[u.guide].title)} →</a></p>`).join('')}
<h2>Por dónde empezar esta semana</h2>
<ol class="steps">${b.start.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
<div class="box box--warn"><strong>A tener en cuenta:</strong> ${esc(b.warning)}</div>
<p>¿Cuánto tiempo puedes ganar? Calcúlalo con la <a href="/calculadoras/ahorro-automatizacion/">calculadora de ahorro</a>.</p>
</div></article></div>`;
    write(`/negocios/${b.slug}/`, layout({ path: `/negocios/${b.slug}/`, title: b.title, description: b.description, body, crumbs: [{ name: 'Por negocio', path: '/negocios/' }, { name: b.name }] }));
  }
}

function templatesPage() {
  for (const t of templates) write(`/plantillas/descargas/${t.id}.txt`, `${t.title} — ${site.name}\n${'='.repeat(40)}\n\nPara qué sirve: ${t.use}\nGuía: ${abs(`/guias/${t.guide}/`)}\n\nSustituye lo que está entre [corchetes] y revisa siempre el resultado.\n\n---\n\n${t.text}\n`, { sitemap: false });
  for (const c of csvResources) write(`/plantillas/descargas/${c.file}`, '﻿' + c.content, { sitemap: false });
  write('/plantillas/descargas/pack-prompts-angolatiens.txt', `Pack de prompts para pequeños negocios — ${site.name}\nRevisado: ${site.reviewedLabel}\n\n` + templates.map((t) => `## ${t.title}\n${t.use}\n\n${t.text}\n`).join('\n---\n\n'), { sitemap: false });

  const body = `<div class="wrap">
<header class="page-head"><h1>Plantillas y prompts para tu negocio</h1>
<p>Prompts estructurados y recursos descargables para tareas reales. Gratis, sin registro. Sustituye lo que está entre corchetes y revisa siempre el resultado.</p>
<p><a class="btn" href="/plantillas/descargas/pack-prompts-angolatiens.txt" download>Descargar todos los prompts (.txt)</a></p></header>
${templates.map((t) => `<section class="section" id="${t.id}"><div class="section-title"><h2>${esc(t.cat)}</h2><a href="/plantillas/descargas/${t.id}.txt" download>Descargar .txt</a></div>
<h3>${esc(t.title)}</h3><p>${esc(t.use)} <a href="/guias/${t.guide}/">Ver la guía</a>.</p>
<pre class="prompt" data-copy>${esc(t.text)}</pre></section>`).join('')}
<section class="section"><div class="section-title"><h2>Hojas de cálculo</h2></div>
${csvResources.map((c) => `<h3>${esc(c.title)}</h3><p>${esc(c.use)}</p><p><a class="btn btn--ghost" href="/plantillas/descargas/${c.file}" download>Descargar plantilla (.csv)</a></p><p class="hint">Se abre en Excel, Google Sheets o LibreOffice. Separador: punto y coma.</p>`).join('')}
</section>
<section class="premium" id="premium"><span class="tag tag--brand">En preparación</span>
<h2>Recursos prémium</h2>
<p>Estamos preparando packs más completos: plantillas de automatización listas para importar en Make, guiones de atención al cliente por sector y un kit de documentación para adaptar tu negocio a Verifactu. Todavía no están a la venta.</p>
<form data-mailto="${esc(site.contactEmail)}" novalidate>
<input type="hidden" name="asunto" value="Lista de espera recursos prémium">
<div class="field"><label for="wl-email">Tu email, si quieres que te avisemos</label><input id="wl-email" name="email" type="email" required autocomplete="email"></div>
<label class="check"><input type="checkbox" name="consentimiento" value="sí" required> He leído la <a href="/privacidad/">política de privacidad</a> y acepto que me escribáis solo para esto.</label>
<p><button class="btn" type="submit">Avisadme</button></p><p class="form-status meta" role="status"></p>
</form></section>
</div>`;
  write('/plantillas/', layout({ path: '/plantillas/', title: 'Plantillas y prompts de IA gratis para autónomos', description: 'Prompts listos para copiar y plantillas descargables para responder clientes, hacer presupuestos, crear contenido y detectar qué automatizar.', body, crumbs: [{ name: 'Plantillas' }] }));
}

/* ---------------- Calculadoras ---------------- */
const field = (name, label, value, { min = 0, max = '', step = 'any', help = '' } = {}) =>
  `<div class="field"><label for="c-${name}">${label}</label><input id="c-${name}" name="${name}" type="number" inputmode="decimal" value="${value}" min="${min}"${max !== '' ? ` max="${max}"` : ''} step="${step}" required>${help ? `<small>${help}</small>` : ''}</div>`;

const calcs = [
  {
    slug: 'ahorro-automatizacion',
    title: 'Calculadora de ahorro por automatizar una tarea',
    description: 'Estima cuántas horas y euros te ahorra automatizar una tarea repetitiva y cuándo recuperas lo invertido.',
    form: `<form data-calc="ahorro"><fieldset><legend class="sr-only">Supuestos</legend>
${field('veces', 'Veces que haces la tarea por semana', 20, { help: 'Por ejemplo, mensajes que contestas o solicitudes que copias.' })}
${field('minutos', 'Minutos que te lleva cada vez', 4)}
${field('reduccion', 'Porcentaje de tiempo que se ahorra (%)', 70, { max: 100, help: 'Casi nunca es el 100 %: siempre queda revisar. 50–80 % es un supuesto prudente.' })}
${field('hora', 'Valor de tu hora (€)', 25, { help: '¿No lo sabes? Usa la <a href="/calculadoras/precio-hora-autonomo/">calculadora de precio por hora</a>.' })}
${field('coste', 'Coste mensual de la herramienta (€)', 0, { help: '0 si usas un plan gratuito.' })}
${field('setup', 'Horas para dejarla montada × valor de tu hora (€)', 75, { help: 'Ejemplo: 3 horas × 25 € = 75 €.' })}
</fieldset></form>`,
    out: `<p class="meta">Ahorro neto estimado</p><p class="big" data-out="big">—</p><dl>
<dt>Tiempo actual dedicado</dt><dd data-out="horas-mes">—</dd>
<dt>Tiempo ahorrado al mes</dt><dd data-out="ahorro-mes">—</dd>
<dt>Valor del tiempo ahorrado</dt><dd data-out="valor-mes">—</dd>
<dt>Ahorro neto al mes</dt><dd data-out="neto-mes">—</dd>
<dt>Recuperas la inversión en</dt><dd data-out="payback">—</dd></dl>`,
    method: 'Horas al mes = veces por semana × minutos × 4,33 semanas ÷ 60. Ahorro = horas × porcentaje de reducción. Ahorro neto = ahorro × valor de la hora − coste mensual. La recuperación divide el coste de puesta en marcha entre el ahorro neto mensual.',
  },
  {
    slug: 'precio-hora-autonomo',
    title: 'Calculadora del precio real de tu hora como autónomo',
    description: 'Calcula cuánto ganas de verdad por hora trabajada y por hora facturable, después de gastos y cuota.',
    form: `<form data-calc="hora"><fieldset><legend class="sr-only">Supuestos</legend>
${field('ingresos', 'Facturación anual sin IVA (€)', 36000)}
${field('gastos', 'Gastos anuales del negocio (€)', 6000, { help: 'Material, software, gestoría, vehículo, local…' })}
${field('cuota', 'Cuota mensual de autónomo (€)', 300, { help: 'Depende de tus rendimientos. Pon la tuya.' })}
${field('horas', 'Horas que trabajas por semana', 45, { max: 100 })}
${field('facturables', 'Porcentaje de horas que puedes facturar (%)', 65, { max: 100, help: 'El resto se va en desplazamientos, presupuestos, gestiones…' })}
${field('semanas', 'Semanas trabajadas al año', 46, { min: 1, max: 52 })}
</fieldset></form>`,
    out: `<p class="meta">Tu hora real (antes de IRPF)</p><p class="big" data-out="big">—</p><dl>
<dt>Rendimiento neto anual</dt><dd data-out="neto">—</dd>
<dt>Horas trabajadas al año</dt><dd data-out="h-total">—</dd>
<dt>Horas facturables al año</dt><dd data-out="h-fact">—</dd>
<dt>Por hora facturable</dt><dd data-out="por-fact">—</dd></dl>`,
    method: 'Rendimiento neto = facturación − gastos − cuota × 12. Se divide entre las horas trabajadas (horas por semana × semanas) y entre las facturables. No incluye IRPF ni otros impuestos, que dependen de tu situación personal.',
  },
  {
    slug: 'compensa-pagar',
    title: '¿Me compensa pagar esta herramienta?',
    description: 'Descubre cuántos minutos al mes tiene que ahorrarte una suscripción para salir a cuenta.',
    form: `<form data-calc="compensa"><fieldset><legend class="sr-only">Supuestos</legend>
${field('precio', 'Precio mensual de la herramienta (€)', 23, { help: 'Incluye el IVA si no lo deduces.' })}
${field('hora', 'Valor de tu hora (€)', 25, { min: 1 })}
${field('ahorro', 'Minutos que crees que te ahorra al mes', 120)}
</fieldset></form>`,
    out: `<p class="meta">Resultado</p><p class="big" data-out="big">—</p><dl>
<dt>Minutos mínimos para cubrir el precio</dt><dd data-out="minimo">—</dd>
<dt>Valor del tiempo ahorrado</dt><dd data-out="valor">—</dd>
<dt>Balance mensual</dt><dd data-out="balance">—</dd></dl>`,
    method: 'Minutos mínimos = precio ÷ valor de la hora × 60. Valor ahorrado = minutos ahorrados ÷ 60 × valor de la hora.',
  },
];

function calcPages() {
  const idx = `<div class="wrap"><header class="page-head"><h1>Calculadoras para decidir con números</h1><p>Herramientas gratuitas para estimar el ahorro de una automatización, el valor real de tu hora y si una suscripción compensa. Todas las cifras son orientativas y puedes cambiar los supuestos.</p></header>
<div class="cards">${calcs.map((c) => `<article class="card"><span class="kicker">Calculadora</span><h3><a href="/calculadoras/${c.slug}/">${esc(c.title)}</a></h3><p>${esc(c.description)}</p></article>`).join('')}</div></div>`;
  write('/calculadoras/', layout({ path: '/calculadoras/', title: 'Calculadoras gratis para autónomos: ahorro y precio hora', description: 'Calcula el ahorro de automatizar, el precio real de tu hora como autónomo y si te compensa pagar una herramienta de IA.', body: idx, crumbs: [{ name: 'Calculadoras' }] }));
  for (const c of calcs) {
    const body = `<div class="wrap"><header class="page-head"><span class="kicker">Calculadora</span><h1>${esc(c.title)}</h1><p>${esc(c.description)}</p></header>
<div class="calc">
<div>${c.form}</div>
<div class="calc-out" aria-live="polite">${c.out}<p class="calc-error" role="alert" hidden>Revisa los campos marcados: hay algún valor vacío o fuera de rango.</p></div>
</div>
<div class="article" style="margin:0;max-width:760px"><div class="prose">
<div class="box box--warn"><strong>Estimación orientativa.</strong> El resultado depende por completo de los supuestos que introduces. No es asesoramiento financiero ni fiscal.</div>
<h2>Cómo se calcula</h2><p>${esc(c.method)}</p>
<h2>Siguiente paso</h2><p>Si el número sale a tu favor, empieza por la <a href="/guias/automatizar-formulario-hoja-aviso-make/">guía de tu primera automatización</a> o busca la herramienta adecuada en el <a href="/herramientas/">buscador</a>.</p>
</div></div></div>`;
    write(`/calculadoras/${c.slug}/`, layout({ path: `/calculadoras/${c.slug}/`, title: c.title, description: c.description, body, crumbs: [{ name: 'Calculadoras', path: '/calculadoras/' }, { name: c.title }] }));
  }
}

function newsPage() {
  const body = `<div class="wrap"><header class="page-head"><h1>Novedades de IA que afectan a tu negocio</h1>
<p>Solo publicamos cambios con fuente comprobable y utilidad directa para autónomos y pequeños negocios: qué cambia, a quién afecta y qué puedes hacer.</p></header>
${news.map((n) => `<article class="news-item" id="${n.slug}"><div><time class="meta" datetime="${n.date}">${fmtDate(n.date)}</time></div>
<div><h2>${esc(n.title)}</h2><dl><dt>Qué cambia</dt><dd>${esc(n.what)}</dd><dt>A quién afecta</dt><dd>${esc(n.who)}</dd><dt>Qué hacer</dt><dd>${esc(n.action)}</dd>
<dt>Fuentes</dt><dd>${n.sources.map((s) => `<a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.label)}</a>`).join(' · ')}</dd></dl>
${n.guide ? `<p style="margin-top:10px"><a href="/guias/${n.guide}/">Guía relacionada →</a></p>` : ''}</div></article>`).join('')}
</div>`;
  write('/novedades/', layout({ path: '/novedades/', title: 'Novedades de inteligencia artificial para autónomos y pymes', description: 'Cambios en herramientas, precios y normativa que afectan a autónomos y pequeños negocios, explicados con fuentes y qué hacer.', body, crumbs: [{ name: 'Novedades' }] }));
}

/* ---------------- Páginas de confianza y legales ---------------- */
function simplePage(path, title, description, html, crumbName) {
  const body = `<div class="wrap legal"><article class="article"><header class="article-head"><h1>${esc(title)}</h1><p class="meta">Última actualización: ${fmtDate(site.reviewed)}</p></header><div class="prose">${html}</div></article></div>`;
  write(path, layout({ path, title, description, body, crumbs: [{ name: crumbName || title }] }));
}
const P = (s) => `<span class="pending">${esc(s)}</span>`;

function trustPages() {
  const aff = tools.filter((t) => t.affiliate.status === 'si');
  simplePage('/sobre-angolatiens/', 'Sobre Angolatiens', 'Qué es Angolatiens, para quién escribimos y cómo revisamos herramientas y precios.', `
<p class="lead">Angolatiens ayuda a autónomos y pequeños negocios de España a decidir qué inteligencia artificial les sirve, cuánto cuesta y cómo ponerla en marcha sin conocimientos técnicos.</p>
<h2>Cómo trabajamos</h2>
<ul>
<li><strong>Precios con fuente.</strong> Cada precio indica si procede de la web oficial o de fuentes secundarias, y la fecha de revisión. Si no podemos verificarlo, no publicamos la cifra.</li>
<li><strong>Valoraciones editoriales.</strong> La facilidad de uso es una valoración editorial preliminar. Iremos sustituyéndola por pruebas documentadas.</li>
<li><strong>Nada de noticias de relleno.</strong> Solo publicamos novedades que cambian algo para nuestros lectores.</li>
<li><strong>Corrección de errores.</strong> Si detectas un dato desactualizado, <a href="/contacto/">escríbenos</a> y lo revisamos.</li>
</ul>
<h2>Quién está detrás</h2>
<p>${P(site.owner.name)}. Consulta los datos completos en el <a href="/aviso-legal/">aviso legal</a>.</p>`);

  simplePage('/transparencia/', 'Transparencia: cómo nos financiamos', 'Cómo se financia Angolatiens, qué son los enlaces de afiliado y cómo separamos recomendaciones editoriales de contenido comercial.', `
<p class="lead">Queremos que puedas fiarte de lo que lees. Por eso explicamos con claridad cómo pretendemos financiarnos.</p>
<h2>Enlaces de afiliado</h2>
<p>Algunas herramientas tienen programas de afiliación: si contratas a través de nuestro enlace, podemos recibir una comisión sin coste adicional para ti. <strong>Actualmente ningún enlace del sitio es de afiliado</strong>: todos llevan a la web oficial sin seguimiento. Cuando lo sean, lo indicaremos junto al enlace y llevarán el atributo <code>rel="sponsored"</code>.</p>
<p>Herramientas del catálogo con programa de afiliación público según nuestra revisión de ${site.reviewedLabel}: ${aff.map((t) => esc(t.name)).join(', ')}. Que una herramienta tenga programa de afiliación no mejora su posición en el buscador ni su valoración.</p>
<h2>Otras fuentes de ingresos previstas</h2>
<ul>
<li>Venta de plantillas y recursos propios (sección prémium, en preparación).</li>
<li>Servicios de automatización y web para negocios, ofrecidos de forma identificada.</li>
<li>Colaboraciones comerciales, siempre marcadas como «Contenido patrocinado».</li>
<li>Publicidad contextual, si llega a incorporarse, separada del contenido editorial.</li>
</ul>
<h2>Independencia editorial</h2>
<p>Ningún fabricante revisa ni aprueba nuestras guías antes de publicarse.</p>`, 'Transparencia');

  simplePage('/contacto/', 'Contacto', 'Contacta con Angolatiens para corregir un dato, proponer una guía o consultar colaboraciones.', `
<p>¿Has visto un precio desactualizado, quieres proponer una guía o consultar una colaboración? Escríbenos.</p>
<form data-mailto="${esc(site.contactEmail)}" novalidate style="display:grid;gap:14px;max-width:560px">
<div class="field"><label for="ct-asunto">Motivo</label><select id="ct-asunto" name="asunto"><option>Corregir un dato</option><option>Proponer una guía</option><option>Servicios de automatización</option><option>Colaboración comercial</option><option>Otro</option></select></div>
<div class="field"><label for="ct-msg">Mensaje</label><textarea id="ct-msg" name="mensaje" rows="6" required></textarea></div>
<label class="check"><input type="checkbox" required> He leído la <a href="/privacidad/">política de privacidad</a>.</label>
<p><button class="btn" type="submit">Preparar email</button></p><p class="form-status meta" role="status"></p>
</form>
<p class="hint">Este formulario no envía datos a ningún servidor: abre tu programa de correo con el mensaje preparado.</p>
<p>Correo: ${site.contactEmail ? `<a href="mailto:${esc(site.contactEmail)}">${esc(site.contactEmail)}</a>` : P(site.owner.email)}</p>`);

  simplePage('/aviso-legal/', 'Aviso legal', 'Aviso legal de Angolatiens conforme a la Ley 34/2002 de servicios de la sociedad de la información.', `
<h2>Titular del sitio web</h2>
<p>En cumplimiento del artículo 10 de la Ley 34/2002, de 11 de julio, de Servicios de la Sociedad de la Información y de Comercio Electrónico (LSSI-CE), se informa:</p>
<ul><li>Titular: ${P(site.owner.name)}</li><li>NIF: ${P(site.owner.nif)}</li><li>Domicilio: ${P(site.owner.address)}</li><li>Correo electrónico: ${P(site.owner.email)}</li></ul>
<h2>Objeto</h2><p>Angolatiens es un sitio informativo sobre herramientas de inteligencia artificial para autónomos y pequeños negocios.</p>
<h2>Responsabilidad</h2><p>La información se ofrece con carácter general y orientativo. Precios, planes y condiciones de terceros pueden cambiar sin aviso: confírmalos siempre en la web oficial de cada proveedor. Las calculadoras ofrecen estimaciones basadas en los supuestos que introduce el usuario. Nada de lo publicado constituye asesoramiento jurídico, fiscal ni financiero.</p>
<h2>Enlaces externos</h2><p>El sitio enlaza a webs de terceros sobre las que no tenemos control ni responsabilidad.</p>
<h2>Propiedad intelectual</h2><p>Los textos y el diseño de Angolatiens son de su titular. Las plantillas de la sección <a href="/plantillas/">Plantillas</a> pueden usarse libremente en tu negocio. Las marcas citadas pertenecen a sus titulares. Las tipografías Inter y Source Serif 4 se usan bajo licencia SIL Open Font License.</p>`);

  simplePage('/privacidad/', 'Política de privacidad', 'Cómo trata Angolatiens los datos personales conforme al RGPD y la LOPDGDD.', `
<h2>Responsable</h2><p>${P(site.owner.name)}, ${P(site.owner.email)}.</p>
<h2>Qué datos tratamos</h2>
<ul>
<li><strong>Navegación:</strong> el sitio no usa cookies, ni analítica, ni publicidad, ni recursos de terceros (las tipografías se sirven desde nuestro propio dominio). El proveedor de alojamiento puede registrar datos técnicos (como la dirección IP) por motivos de seguridad. ${P('[PENDIENTE: nombre del proveedor de alojamiento y su política]')}</li>
<li><strong>Buscador y calculadoras:</strong> funcionan en tu navegador. Lo que escribes no se envía a ningún servidor.</li>
<li><strong>Comparador:</strong> guarda en el almacenamiento local de tu navegador las herramientas que eliges comparar, solo para recordar tu selección. No sale de tu dispositivo y puedes borrarlo con el botón «Vaciar» o desde la configuración del navegador.</li>
<li><strong>Contacto y lista de espera:</strong> si nos escribes, tratamos tu email y tu mensaje para responderte (base jurídica: tu consentimiento y la aplicación de medidas precontractuales a petición tuya). Si te apuntas a la lista de espera, solo te escribiremos para avisarte del lanzamiento.</li>
</ul>
<h2>Conservación</h2><p>Los correos se conservan mientras sea necesario para atender tu consulta y, después, durante los plazos legales aplicables.</p>
<h2>Tus derechos</h2><p>Puedes ejercer los derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a ${P(site.owner.email)}. Si consideras que no hemos atendido tu solicitud, puedes reclamar ante la <a href="https://www.aepd.es/" rel="noopener">Agencia Española de Protección de Datos</a>.</p>
<h2>Cambios</h2><p>Si incorporamos analítica, boletín o publicidad, actualizaremos esta política y, cuando sea necesario, pediremos tu consentimiento antes.</p>`, 'Privacidad');

  simplePage('/cookies/', 'Política de cookies', 'Angolatiens no utiliza cookies. Información sobre el almacenamiento local del comparador.', `
<p class="lead">Angolatiens <strong>no instala cookies</strong> propias ni de terceros. Por eso no verás ningún banner de cookies.</p>
<p>El comparador usa el almacenamiento local del navegador (<code>localStorage</code>) para recordar las herramientas que has seleccionado. Es un almacenamiento técnico, necesario para prestar la función que solicitas, que no se usa para analítica ni publicidad y no se comparte con nadie.</p>
<p>Si en el futuro incorporamos herramientas que usen cookies no necesarias (por ejemplo, analítica o publicidad), pediremos tu consentimiento previo y actualizaremos esta página.</p>`, 'Cookies');

  simplePage('/condiciones/', 'Condiciones de uso', 'Condiciones de uso del sitio web Angolatiens y de sus herramientas gratuitas.', `
<h2>Uso del sitio</h2><p>El acceso es gratuito y no requiere registro. Te comprometes a usar el sitio de forma lícita.</p>
<h2>Información de terceros</h2><p>Revisamos precios y condiciones en la fecha indicada en cada página, pero pueden cambiar. La contratación de cualquier herramienta se realiza directamente con su proveedor, bajo sus propias condiciones.</p>
<h2>Calculadoras y plantillas</h2><p>Las calculadoras ofrecen estimaciones orientativas basadas en tus supuestos. Las plantillas y prompts se ofrecen tal cual; revisa siempre el resultado que generen las herramientas de IA antes de usarlo con clientes.</p>
<h2>Legislación aplicable</h2><p>Estas condiciones se rigen por la legislación española.</p>`, 'Condiciones');
}

function notFound() {
  const body = `<div class="wrap"><header class="page-head"><h1>No encontramos esta página</h1><p>Puede que el enlace esté mal escrito o que hayamos movido el contenido.</p></header>
<ul class="toolchips"><li><a href="/">Portada</a></li><li><a href="/herramientas/">Buscador de herramientas</a></li><li><a href="/guias/">Guías</a></li><li><a href="/calculadoras/">Calculadoras</a></li></ul></div>`;
  write('/404.html', layout({ path: '/404.html', title: 'Página no encontrada', description: 'La página que buscas no existe o se ha movido. Vuelve a la portada o usa el buscador de herramientas de IA.', body, noindex: true }), { sitemap: false });
}

/* ---------------- Archivos técnicos ---------------- */
function technical() {
  const toolsJson = tools.map((t) => ({
    slug: t.slug, name: t.name, cat: t.cat, catLabel: categories[t.cat].label, catShort: categories[t.cat].short,
    url: t.url, affiliateUrl: t.affiliateUrl, summary: t.summary, bestFor: t.bestFor, tasks: t.tasks,
    free: t.free, price: t.price, spanish: t.spanish, ease: t.ease, technical: t.technical, pros: t.pros, cons: t.cons,
  }));
  write('/assets/tools.json', JSON.stringify(toolsJson), { sitemap: false });
  write('/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#141414"/><text x="7" y="24" font-family="Georgia,serif" font-weight="700" font-size="22" fill="#fff">A</text><rect x="22" y="19" width="5" height="5" fill="#b3122e"/></svg>`, { sitemap: false });
  write('/robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${abs('/sitemap.xml')}\n`, { sitemap: false });
  const urls = pages.map((p) => `  <url><loc>${abs(p.path)}</loc><lastmod>${p.lastmod}</lastmod></url>`).join('\n');
  write('/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, { sitemap: false });
}

/* ---------------- Ejecución ---------------- */
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(join(ROOT, 'src/assets'), join(OUT, 'assets'), { recursive: true });
home();
toolsIndex();
tools.forEach(toolPage);
comparePage();
guidesIndex();
guides.forEach(guidePage);
businessesPages();
templatesPage();
calcPages();
newsPage();
trustPages();
notFound();
technical();
console.log(`Sitio generado en ${OUT}: ${pages.length} páginas indexables.`);
