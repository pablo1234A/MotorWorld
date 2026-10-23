/* =====================================================================
 * RÉTAME — generador del sitio estático
 *
 *   node build.mjs                 → genera public/
 *   SITE_URL=https://… node build.mjs
 *   STRICT=1 node build.mjs        → falla si falta algún dato obligatorio
 *   STANDALONE=1 node build.mjs    → standalone/retame.html: todo en un solo
 *                                    archivo que funciona con doble clic
 *
 * Cada URL pública es un index.html con todo su contenido en HTML: el
 * JavaScript añade el juego encima. Sin dependencias externas.
 * =================================================================== */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { loadEngine, ROOT } from "./scripts/load.mjs";

const OUT = process.env.OUT_DIR ? path.resolve(process.env.OUT_DIR) : path.join(ROOT, "public");
const SRC = path.join(ROOT, "src");
const STATE_FILE = path.join(ROOT, "sitemap-state.json");

const overrides = {};
if (process.env.SITE_URL !== undefined) overrides.siteUrl = process.env.SITE_URL.replace(/\/+$/, "");
if (process.env.BASE_PATH !== undefined) overrides.basePath = process.env.BASE_PATH.replace(/\/+$/, "");
const STANDALONE = !!process.env.STANDALONE;
const E = loadEngine(overrides, STANDALONE ? { STANDALONE: true } : {});
const C = E.CONFIG;
const { esc, href, icon, brandMark } = E;
const SITE = C.siteUrl || "";
const INDEXABLE = !!SITE;
const TODAY = new Date().toISOString().slice(0, 10);

/* --- 1. Validación del contenido: si algo falla, no se publica ------- */
const errors = [];
const seenSlugs = new Set(), seenSigs = new Map();
for (const ch of E.CHALLENGES) {
  if (seenSlugs.has(ch.slug)) errors.push(`slug duplicado: ${ch.slug}`);
  seenSlugs.add(ch.slug);
  for (const p of E.problems(ch)) errors.push(`${ch.slug}: ${p}`);
  for (const s of E.sigsOf(ch)) {
    if (seenSigs.has(s)) errors.push(`${ch.slug}: pregunta repetida en ${seenSigs.get(s)}`);
    seenSigs.set(s, ch.slug);
  }
}
if (errors.length) { console.error("✗ Contenido no válido:\n  " + errors.join("\n  ")); process.exit(1); }

/* --- 2. Datos obligatorios -------------------------------------------- */
const missing = [];
if (!SITE) missing.push("siteUrl (dominio): las páginas salen con noindex hasta que lo rellenes");
if (!C.contactEmail) missing.push("contactEmail: la página de contacto no muestra ningún correo");
if (!C.owner) missing.push("owner (titular): obligatorio antes de activar anuncios (LSSI-CE)");
if (!/^ca-pub-\d{10,20}$/.test(C.adsense.client || "")) missing.push("adsense.client: sin anuncios (correcto hasta tener la cuenta aprobada)");
if (process.env.STRICT && missing.length) { console.error("✗ Faltan datos:\n  " + missing.join("\n  ")); process.exit(1); }

/* --- 3. Recursos con hash para caché larga ---------------------------- */
function hashOf(s) { return crypto.createHash("sha256").update(s).digest("hex").slice(0, 10); }
const BUNDLE = ["config.js", "icons.js", "content.js", "engine.js", "ui.js", "app.js"]
  .map((f) => `/* ${f} */\n` + fs.readFileSync(path.join(SRC, f), "utf8")).join("\n");
/* Compactado seguro: el código fuente no tiene cadenas multilínea, así
 * que basta con quitar sangrías, líneas vacías y bloques de comentario
 * que empiezan una línea. */
function compact(src) {
  const out = []; let inComment = false;
  for (const raw of src.split("\n")) {
    const line = raw.trim();
    if (inComment) { if (line.includes("*/")) inComment = false; continue; }
    if (line.startsWith("/*") && !line.startsWith("/*!")) { if (!line.includes("*/")) inComment = true; else if (!line.endsWith("*/")) out.push(line); continue; }
    if (!line || line.startsWith("//")) continue;
    out.push(line);
  }
  return out.join("\n");
}
const jsOut = `/*! RÉTAME · ${TODAY} */\n(function () {\n"use strict";\nvar STANDALONE = ${STANDALONE};\n${compact(BUNDLE.replace(/^var CONFIG = \{[\s\S]*?\n\};/m, () => "var CONFIG = " + JSON.stringify(C) + ";"))}\n})();\n`;
const cssOut = fs.readFileSync(path.join(SRC, "styles.css"), "utf8");
const JS_FILE = `assets/app.${hashOf(jsOut)}.js`, CSS_FILE = `assets/styles.${hashOf(cssOut)}.css`;

if (!STANDALONE) {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, "assets"), { recursive: true });
  fs.writeFileSync(path.join(OUT, JS_FILE), jsOut);
  fs.writeFileSync(path.join(OUT, CSS_FILE), cssOut);
  fs.cpSync(path.join(SRC, "static"), OUT, { recursive: true });
}

/* --- 4. Plantilla común -------------------------------------------------- */
const abs = (p) => SITE + href(p);
const ogFile = (name) => fs.existsSync(path.join(SRC, "static", "og", name + ".png")) ? "/og/" + name + ".png" : "/og/retame.png";
const NAV = [["/reto-del-dia/", "Reto del día"], ["/juegos/", "Jugar"], ["/retos/", "Retos"], ["/duelos/", "Duelos"], ["/progreso/", "Mi progreso"]];
const pages = [];

function header(current) {
  return `<header class="site-header"><div class="wrap header-inner">
<a class="brand" href="${href("/")}" aria-label="RÉTAME, inicio">${brandMark(30)}<span class="brand-name">RÉTAME</span></a>
<nav class="main-nav" id="main-nav" aria-label="Principal"><ul>${NAV.map(([u, t]) => `<li><a href="${href(u)}"${current && current.startsWith(u) ? ' aria-current="page"' : ""}>${t}</a></li>`).join("")}</ul></nav>
<a class="streak-chip" href="${href("/progreso/")}" aria-label="Racha: 0 días. Ver mi progreso">${icon("flame")}<b data-streak>0</b></a>
<button class="nav-toggle" type="button" aria-expanded="false" aria-controls="main-nav" aria-label="Menú">${icon("menu")}</button>
</div></header>`;
}
function footer() {
  const social = Object.entries(C.social || {}).filter(([, v]) => /^https:\/\//.test(v || ""));
  const names = { instagram: "Instagram", tiktok: "TikTok", x: "X", youtube: "YouTube" };
  return `<footer class="site-footer"><div class="wrap footer-inner">
<div class="footer-brand"><a class="brand" href="${href("/")}">${brandMark(28)}<span class="brand-name">RÉTAME</span></a><p>Un reto nuevo cada día. Juegas en dos minutos y retas a quien quieras.</p>${social.length ? `<p>${social.map(([k, v]) => `<a href="${esc(v)}" rel="me noopener" target="_blank">${names[k] || k}</a>`).join(" · ")}</p>` : ""}</div>
<nav aria-label="Jugar"><h2>Jugar</h2><ul><li><a href="${href("/reto-del-dia/")}">Reto del día</a></li><li><a href="${href("/juegos/?tema=sorpresa")}">Sorpréndeme</a></li><li><a href="${href("/juegos/")}">Elegir categoría</a></li><li><a href="${href("/duelos/")}">Retar a un amigo</a></li><li><a href="${href("/progreso/")}">Mi progreso</a></li></ul></nav>
<nav aria-label="Retos"><h2>Retos</h2><ul>${E.PUBLIC_CATS.map((c) => `<li><a href="${E.catUrl(c.slug)}">${esc(c.name)}</a></li>`).join("")}</ul></nav>
<nav aria-label="RÉTAME"><h2>RÉTAME</h2><ul><li><a href="${href("/como-funciona/")}">Cómo funciona</a></li><li><a href="${href("/sobre-retame/")}">Sobre RÉTAME</a></li><li><a href="${href("/contacto/")}">Contacto</a></li><li><a href="${href("/privacidad/")}">Privacidad</a></li><li><a href="${href("/cookies/")}">Cookies</a></li></ul></nav>
</div><div class="wrap footer-bottom"><p>© <span data-year>${new Date().getFullYear()}</span> RÉTAME${C.owner ? " · " + esc(C.owner) : ""}</p><p>Sin registro. Tu progreso se guarda en tu dispositivo.</p></div></footer>`;
}
function adSlot(key) {
  return /^ca-pub-\d{10,20}$/.test(C.adsense.client || "") && /^\d{6,}$/.test((C.adsense.slots || {})[key] || "") ? `<div class="ad-slot" data-ad="${key}"></div>` : "";
}
function crumbs(items) {
  return `<nav aria-label="Migas de pan"><ol class="crumbs">${items.map(([u, t], i) => i === items.length - 1 ? `<li aria-current="page">${esc(t)}</li>` : `<li><a href="${href(u)}">${esc(t)}</a></li>`).join("")}</ol></nav>`;
}
function breadcrumbLd(items) {
  return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map(([u, t], i) => ({ "@type": "ListItem", position: i + 1, name: t, item: abs(u) })) };
}
function clip(s, n = 158) {
  s = s.replace(/\s+/g, " ").trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,.;:]$/, "") + "…";
}

/* page: { path, title, desc, body, page, noindex, og, ogAlt, ld, type } */
function render(p) {
  const robots = p.noindex || !INDEXABLE ? `<meta name="robots" content="noindex, follow">` : `<meta name="robots" content="index, follow, max-image-preview:large">`;
  const url = p.path === "/404.html" ? "" : abs(p.path);
  const og = (SITE || "") + href(p.og || ogFile("retame"));
  const lds = (SITE ? (p.ld || []) : []).map((x) => `<script type="application/ld+json">${JSON.stringify(x).replace(/</g, "\\u003c")}</script>`).join("\n");
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.desc)}">
${robots}
${SITE && url ? `<link rel="canonical" href="${esc(url)}">` : ""}
<meta property="og:type" content="${p.type || "website"}">
<meta property="og:site_name" content="RÉTAME">
<meta property="og:locale" content="es_ES">
<meta property="og:title" content="${esc(p.ogTitle || p.title)}">
<meta property="og:description" content="${esc(p.desc)}">
${SITE && url ? `<meta property="og:url" content="${esc(url)}">` : ""}
<meta property="og:image" content="${esc(og)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(p.ogAlt || p.title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(p.ogTitle || p.title)}">
<meta name="twitter:description" content="${esc(p.desc)}">
<meta name="twitter:image" content="${esc(og)}">
<meta name="twitter:image:alt" content="${esc(p.ogAlt || p.title)}">
<meta name="theme-color" content="#5B21E8">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="${href("/favicon.svg")}" type="image/svg+xml">
<link rel="icon" href="${href("/icons/icon-32.png")}" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="${href("/icons/apple-touch-icon.png")}">
<link rel="manifest" href="${href("/manifest.webmanifest")}">
<link rel="preload" href="${href("/fonts/bricolage-grotesque-latin.woff2")}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${href("/" + CSS_FILE)}">
<script src="${href("/" + JS_FILE)}" defer></script>
${lds}
</head>
<body data-page="${p.page || "info"}">
<a class="skip-link" href="#main">Saltar al contenido</a>
${header(p.path)}
<main id="main" tabindex="-1">
${p.body}
</main>
${footer()}
<div class="toast" data-toast role="status" aria-live="polite" hidden></div>
</body>
</html>
`;
}
function add(p) { pages.push(p); }

/* --- 5. Textos reutilizados --------------------------------------------- */
const HOWTO = {
  opcion_multiple: "Elige una de las opciones. En ordenador también puedes usar las teclas A, B, C, D o 1, 2, 3, 4.",
  secuencia: "Descubre la regla que sigue la serie y elige lo que viene después.",
  respuesta_texto: "Escribe la respuesta y pulsa «Comprobar» o Intro. Los acentos y las mayúsculas no cuentan.",
  verdadero_falso: "Decide si cada afirmación es verdadera o falsa. En ordenador, teclas V y F.",
  ordenar: "Toca un elemento y después otro para intercambiarlos. Cuando estén en orden, pulsa «Comprobar».",
  emparejar: "Toca un elemento de la izquierda y después su pareja de la derecha. Cada intento fallido resta precisión.",
  estimar: "Escribe un número. Cuenta como acierto si caes dentro del margen que indica cada pregunta.",
  memoria: "Mira la secuencia hasta que desaparezca y repítela tocando en el mismo orden. Puedes deshacer el último toque."
};
const SCORING = `<p>Cada reto indica cuántos puntos da como máximo: depende de su dificultad (de 400 a 1000) y de cuántas preguntas tiene. Lo que más pesa es <b>acertar</b>: con un 100 % de precisión te llevas al menos el 80 % de esos puntos. El 20 % restante premia la rapidez: lo consigues entero si terminas en la mitad del tiempo orientativo, y nunca pierdes más que eso por pensar con calma.</p>`;
function rng(seedText) { return E.mulberry(E.hashStr(seedText)); }
function scrambled(list, seedText) {
  let out = E.shuffleWith(list, rng(seedText));
  if (out.join("|") === list.join("|")) out = list.slice().reverse();
  return out;
}
function statementHtml(ch) {
  const d = ch.data;
  if (ch.kind === "emparejar") {
    const left = d.parejas.map((p) => p.a).slice().sort((a, b) => a.localeCompare(b, "es"));
    const right = scrambled(d.parejas.map((p) => p.b), ch.slug);
    return `<p>${esc(d.titulo || "Une cada elemento con su pareja")}:</p><p><b>${left.map(esc).join(" · ")}</b></p><p>con: ${right.map(esc).join(" · ")}</p>`;
  }
  return `<ol>${d.preguntas.map((q, i) => {
    let extra = "";
    if (ch.kind === "memoria") {
      extra = q.pool ? `<span class="opts">Verás ${q.n} elementos de este conjunto durante ${String(q.mostrar_ms / 1000).replace(".", ",")} s: ${q.pool.map(esc).join(" ")}. La secuencia cambia en cada partida.</span>` : "";
    } else if (q.opciones) extra = `<span class="opts">${q.opciones.map(esc).join(" · ")}</span>`;
    else if (ch.kind === "verdadero_falso") extra = `<span class="opts">¿Verdadero o falso?</span>`;
    else if (ch.kind === "ordenar") extra = `<span class="opts">${scrambled(q.elementos, ch.slug + i).map(esc).join(" · ")}</span>`;
    else if (ch.kind === "estimar") extra = `<span class="opts">Margen: ±${esc(E.fmtNum(q.tolerancia || 0))}</span>`;
    return `<li>${esc(q.pregunta)}${q.visual ? `<br><span class="vis">${esc(q.visual)}</span>` : ""}${extra}</li>`;
  }).join("")}</ol>`;
}
const featured = E.FEATURED.map((s) => E.chBySlug[s]).filter(Boolean);

/* --- 6. Páginas ------------------------------------------------------------ */
// Portada
add({
  path: "/", page: "home",
  title: "RÉTAME — Reto diario de lógica, memoria y trivia",
  desc: "Cada día, un reto nuevo de 4 o 5 pruebas: lógica, memoria, números y trivia. Juegas en dos minutos, mantienes tu racha y retas a tus amigos. Gratis y sin registro.",
  ogTitle: "RÉTAME — ¿Cuánto sacas hoy?",
  ld: SITE ? [{ "@context": "https://schema.org", "@type": "WebSite", name: "RÉTAME", url: abs("/"), inLanguage: "es", description: "Reto diario de lógica, memoria, números y trivia." }] : [],
  body: `<div class="wrap">
<section class="hero" aria-labelledby="hero-title"><div class="hero-grid">
<div>
<p class="eyebrow">${icon("calendar")}Reto del día · gratis y sin registro</p>
<h1 id="hero-title">Un reto nuevo cada día. <span class="accent">¿Cuánto sacas hoy?</span></h1>
<p class="lead">Hasta cinco pruebas cortas de lógica, memoria, números y trivia. Dos minutos, una puntuación sobre 1000 y un enlace para retar a quien quieras.</p>
<div class="hero-cta"><a class="btn btn-primary btn-lg" href="${href("/reto-del-dia/")}" data-hero-cta>Jugar el reto de hoy${icon("arrow")}</a><a class="text-link" href="${href("/duelos/")}">${icon("duel")}Retar a un amigo</a></div>
<ul class="hero-facts"><li>${icon("clock")}2 minutos</li><li>${icon("target")}Mismo reto para todos</li><li>${icon("flame")}Racha diaria</li></ul>
</div>
<a class="ticket" href="${href("/reto-del-dia/")}" data-ticket style="text-decoration:none">
<div class="ticket-top"><span class="ticket-badge">${icon("calendar")}Reto del día <span data-ticket-num></span></span><span class="ticket-date" data-ticket-date></span></div>
<h2 data-ticket-title>Cinco pruebas. Una puntuación.</h2>
<p data-ticket-sub>Dificultad creciente. Mismo reto para todo el mundo.</p>
<div data-ticket-rounds><ul class="rounds">${["logica", "memoria", "matematicas", "trivia", "ordenar"].map((s) => `<li class="round">${icon(E.catBySlug[s].icon)}<span>${E.catBySlug[s].label}</span></li>`).join("")}</ul></div>
<div class="ticket-foot"><div data-ticket-extra></div><div class="countdown"><span>Nuevo reto en</span><b data-countdown>--:--:--</b></div></div>
</a>
</div></section>

<section class="section" aria-labelledby="cats-title">
<div class="section-head"><div><h2 id="cats-title">Ocho maneras de picarte</h2><p>Cada categoría tiene retos escritos a mano y un generador que crea retos nuevos, siempre comprobados antes de mostrarse.</p></div><a class="link-more" href="${href("/retos/")}">Todos los retos${icon("arrow")}</a></div>
${E.catGrid()}
<a class="surprise" href="${href("/juegos/?tema=sorpresa")}"><span class="cat-tile">${icon("sorpresa")}</span><span><b>¿No sabes por dónde empezar?</b><span class="sub">Sorpréndeme: 10 retos variados, de menos a más.</span></span>${icon("arrow")}</a>
</section>
${adSlot("home")}
<section class="section band" aria-labelledby="duel-title">
<div>
<h2 id="duel-title">Lo divertido es ganar a alguien</h2>
<p class="lead">Al terminar, pulsa «Retar a un amigo». Le llega un enlace con tu marca; juega exactamente lo mismo que tú y ve quién gana.</p>
<ol class="steps-list"><li><div><b>Juegas</b><span>El reto de hoy o cualquier otro.</span></div></li><li><div><b>Mandas el enlace</b><span>Por WhatsApp, Telegram o como quieras. Sin cuentas.</span></div></li><li><div><b>Comparáis</b><span>Tu amigo ve tu marca, juega y puede retarte de vuelta.</span></div></li></ol>
<div class="actions"><a class="btn btn-outline" href="${href("/duelos/")}">${icon("duel")}Cómo funcionan los duelos</a></div>
</div>
<div class="chat" aria-label="Ejemplo de mensaje de reto"><span class="chat-label">Así llega (ejemplo)</span><div class="bubble me">RÉTAME #33 · 23 oct
🟩🟩🟥🟩🟨
⚡ 842/1000 · 🎯 80 %
¿Puedes superarme?<span class="link-preview">Reto del día · RÉTAME</span></div><div class="bubble">Ahora verás 😤</div></div>
</section>

<section class="section" aria-labelledby="how-title">
<div class="section-head"><h2 id="how-title">Cómo funciona</h2><a class="link-more" href="${href("/como-funciona/")}">Reglas completas${icon("arrow")}</a></div>
<ul class="how">
<li><span class="cat-tile">${icon("play")}</span><h3>Juega en dos minutos</h3><p>Cada día, de 4 a 5 pruebas cortas de categorías distintas, de menos a más.</p></li>
<li><span class="cat-tile">${icon("target")}</span><h3>Puntúa sobre 1000</h3><p>Acertar pesa mucho más que la velocidad. Pensar con calma casi nunca sale caro.</p></li>
<li><span class="cat-tile">${icon("duel")}</span><h3>Compártelo</h3><p>Tu resultado en cuadritos, sin destripar las respuestas, y un enlace para retar.</p></li>
</ul>
</section>

<section class="section" aria-labelledby="feat-title">
<div class="section-head"><div><h2 id="feat-title">Para empezar</h2><p>Retos con solución explicada. Cada uno tiene su propia página para jugarlo y compartirlo.</p></div><a class="link-more" href="${href("/retos/")}">Ver los ${E.PUBLIC_CHALLENGES.length} retos${icon("arrow")}</a></div>
${E.challengeList(featured)}
</section>

<section class="section" aria-labelledby="back-title">
<div class="section-head"><div><h2 id="back-title">Mañana, otra vez</h2><p>Sin registro: tu racha, tus récords y tus logros se guardan en este dispositivo.</p></div><a class="link-more" href="${href("/progreso/")}">Mi progreso${icon("arrow")}</a></div>
<div data-home-stats><div class="tiles four"><div class="tile"><b class="is-amber">${icon("flame")}0</b><span>días de racha</span></div><div class="tile"><b>${icon("trophy")}—</b><span>mejor reto del día</span></div><div class="tile"><b>${icon("check")}0</b><span>retos completados</span></div><div class="tile"><b>${icon("star")}0</b><span>logros</span></div></div></div>
</section>
</div>`
});

// Reto del día
add({
  path: "/reto-del-dia/", page: "daily",
  title: "Reto del día: lógica, memoria y trivia en 2 minutos | RÉTAME",
  desc: "El reto del día de RÉTAME: 4 o 5 pruebas cortas de lógica, memoria, números y trivia. Mismo reto para todo el mundo, puntuación sobre 1000 y resultado para compartir.",
  og: ogFile("reto-del-dia"), ogTitle: "Reto del día · RÉTAME",
  ld: [breadcrumbLd([["/", "RÉTAME"], ["/reto-del-dia/", "Reto del día"]])],
  body: `<div class="wrap wrap-narrow">
${crumbs([["/", "Inicio"], ["/reto-del-dia/", "Reto del día"]])}
<header class="page-head"><h1>Reto del día</h1><p class="lead">Un reto nuevo cada día a medianoche (hora peninsular española). Mismo reto para todo el mundo: compara tu resultado sin destripar las respuestas.</p></header>
<div data-daily><div class="ticket"><div class="ticket-top"><span class="ticket-badge">${icon("calendar")}Reto del día</span></div><h2>Cinco pruebas. Una puntuación.</h2><p>Preparando el reto de hoy…</p><noscript><p><b>Para jugar necesitas activar JavaScript.</b></p></noscript></div></div>
<div data-daily-intro>
<section class="section prose" aria-labelledby="d1"><h2 id="d1">Cómo funciona</h2>
<p>Cada día hay entre 4 y 5 pruebas de categorías distintas —lógica, memoria, matemáticas, palabras, trivia, estimación, observación u ordenar— con dificultad creciente: empiezas en «normal» y terminas en «experto».</p>
<p>Las pruebas se generan a partir de la fecha, así que todo el mundo recibe exactamente las mismas, recargar no las cambia y mañana serán otras. Antes de mostrarse, cada pregunta pasa una comprobación automática: la respuesta correcta se recalcula y se descarta cualquier pregunta con más de una respuesta válida.</p>
<h2>Cómo se puntúa</h2>
<p>El reto del día se puntúa sobre <b>1000</b>. Las pruebas más difíciles pesan más. Dentro de cada prueba manda la precisión; la rapidez solo suma un pequeño extra.</p>
<p>Al terminar verás tu resultado en cuadros: <b>verde</b> si la prueba fue perfecta, <b>amarillo</b> si acertaste al menos la mitad y <b>rojo</b> si no. Es lo que compartes: nadie ve las respuestas.</p>
<h2>Racha</h2>
<p>Completa un reto al día y tu racha sube. Si un día no juegas, vuelve a empezar. Si sales a mitad del reto, al volver continúas por donde ibas.</p>
</section>
<section class="section"><h2>Preguntas frecuentes</h2>
<details class="fold"><summary>¿Puedo repetir el reto de hoy?</summary><div><p>Sí, en modo práctica: puedes volver a jugarlo, pero tu resultado oficial del día es el primero.</p></div></details>
<details class="fold"><summary>¿A qué hora cambia?</summary><div><p>A medianoche, hora peninsular española. En la portada tienes la cuenta atrás.</p></div></details>
<details class="fold"><summary>¿Puedo retar a alguien con el reto de hoy?</summary><div><p>Sí. Al terminar, pulsa «Retar a un amigo». Quien abra tu enlace jugará el reto de ese mismo día, aunque lo abra más tarde.</p></div></details>
</section>
${adSlot("content")}
</div>
</div>`
});

// Jugar
add({
  path: "/juegos/", page: "games",
  title: "Jugar: elige categoría o déjate sorprender | RÉTAME",
  desc: "Sesiones de 10 retos sin repetir: elige categoría y dificultad, prueba el modo adaptativo o pulsa Sorpréndeme. Lógica, memoria, números, palabras y trivia.",
  ld: [breadcrumbLd([["/", "RÉTAME"], ["/juegos/", "Jugar"]])],
  body: `<div class="wrap">
<div data-selector>
${crumbs([["/", "Inicio"], ["/juegos/", "Jugar"]])}
<header class="page-head"><h1>¿A qué jugamos?</h1><p class="lead">Sesiones de 10 retos que no se repiten. Elige categoría o deja que RÉTAME decida.</p></header>
<a class="surprise" href="${href("/juegos/?tema=sorpresa")}" style="margin:0 0 18px"><span class="cat-tile">${icon("sorpresa")}</span><span><b>Sorpréndeme</b><span class="sub">Categoría, tipo y dificultad al azar, de menos a más.</span></span>${icon("arrow")}</a>
${E.catGrid("play")}
<a class="surprise" href="${href("/juegos/?tema=grupo")}"><span class="cat-tile" style="--cat:#E8590C">${icon("grupo")}</span><span><b>En grupo</b><span class="sub">Preguntas de opinión para comparar con tus amigos. Sin puntos.</span></span>${icon("arrow")}</a>
<section class="section prose"><h2>Modos de juego</h2>
<p><b>Sorpréndeme</b> mezcla mecánicas y sube la dificultad poco a poco. <b>Adaptativo</b> sube si aciertas y baja si fallas. También puedes fijar la dificultad: fácil, normal, difícil o experto.</p>
<p>El motor combina retos escritos a mano con retos generados al momento, cambia de mecánica para que no se haga repetitivo y evita lo que ya has visto. Cuando agotas una categoría, empieza un ciclo nuevo y te avisa.</p></section>
</div>
<div data-play hidden></div>
<noscript><p class="empty">Para jugar necesitas activar JavaScript.</p></noscript>
</div>`
});

// Retos (índice)
add({
  path: "/retos/", page: "hub",
  title: "Todos los retos: lógica, matemáticas, memoria y trivia | RÉTAME",
  desc: `${E.PUBLIC_CHALLENGES.length} retos con solución en 8 categorías: lógica, matemáticas, palabras, memoria, trivia, estimación, observación y ordenar. Gratis y sin registro.`,
  ld: [breadcrumbLd([["/", "RÉTAME"], ["/retos/", "Retos"]])],
  body: `<div class="wrap">
${crumbs([["/", "Inicio"], ["/retos/", "Retos"]])}
<header class="page-head"><h1>Todos los retos</h1><p class="lead">${E.PUBLIC_CHALLENGES.length} retos escritos a mano, con su solución explicada. Además, cada categoría genera retos nuevos sin fin cuando juegas una sesión.</p></header>
${E.catGrid()}
${E.PUBLIC_CATS.map((c) => `<section class="section" aria-labelledby="h-${c.slug}"><div class="section-head"><h2 id="h-${c.slug}">${esc(c.name)}</h2><a class="link-more" href="${E.catUrl(c.slug)}">Ver categoría${icon("arrow")}</a></div>${E.challengeList(E.PUBLIC_CHALLENGES.filter((x) => x.cat === c.slug))}</section>`).join("\n")}
${adSlot("content")}
</div>`
});

// Categorías
for (const c of E.PUBLIC_CATS) {
  const list = E.PUBLIC_CHALLENGES.filter((x) => x.cat === c.slug);
  const kinds = [...new Set(list.map((x) => x.kind).concat((E.GENERATORS[c.slug] || []).map((g) => g.kind)))];
  add({
    path: `/retos/${c.slug}/`, page: "category",
    title: `${c.seoTitle} | RÉTAME`, desc: c.metaDesc,
    og: ogFile("cat-" + c.slug), ogAlt: c.h1,
    ld: [breadcrumbLd([["/", "RÉTAME"], ["/retos/", "Retos"], [`/retos/${c.slug}/`, c.name]])],
    body: `<div class="wrap">
${crumbs([["/", "Inicio"], ["/retos/", "Retos"], [`/retos/${c.slug}/`, c.name]])}
<header class="page-head"><div class="cat-head">${E.catTile(c, "xl")}<h1>${esc(c.h1)}</h1></div></header>
<div class="two-col"><div>
<div class="prose">${c.intro.map((p) => `<p>${esc(p)}</p>`).join("")}</div>
<div class="actions" style="margin-top:6px"><a class="btn btn-primary btn-lg" href="${href("/juegos/?tema=" + c.slug)}">${icon("play")}Jugar una sesión de ${esc(c.name.toLowerCase())}</a></div>
<section class="section" aria-labelledby="list-title"><h2 id="list-title">${list.length} retos de ${esc(c.name.toLowerCase())} con solución</h2>${E.challengeList(list)}</section>
<section class="section prose" aria-labelledby="how-title"><h2 id="how-title">Cómo se juega</h2><ul>${kinds.map((k) => `<li><b>${esc(E.KIND_LABELS[k])}.</b> ${esc(HOWTO[k])}</li>`).join("")}</ul>${SCORING}</section>
</div>
<aside class="aside-box" aria-labelledby="tips-title"><h2 id="tips-title">Trucos</h2><ul class="tips">${c.tips.map((t) => `<li>${icon("check")}<span>${esc(t)}</span></li>`).join("")}</ul>
<h2 style="margin-top:22px">Otras categorías</h2><div class="chips">${E.PUBLIC_CATS.filter((x) => x.slug !== c.slug).map((x) => `<a class="chip" style="--cat:${x.color}" href="${E.catUrl(x.slug)}">${icon(x.icon)}${esc(x.name)}</a>`).join("")}</div></aside>
</div>
${adSlot("content")}
</div>`
  });
}

// Retos individuales
for (const ch of E.PUBLIC_CHALLENGES) {
  const c = E.catBySlug[ch.cat];
  const related = E.PUBLIC_CHALLENGES.filter((x) => x.cat === ch.cat && x.slug !== ch.slug).slice(0, 4);
  const others = E.PUBLIC_CHALLENGES.filter((x) => x.cat !== ch.cat && E.FEATURED.includes(x.slug)).slice(0, 2);
  const url = `/retos/${ch.cat}/${ch.slug}/`;
  const nq = ch.kind === "emparejar" ? ch.data.parejas.length + " parejas" : ch.data.preguntas.length === 1 ? "1 pregunta" : ch.data.preguntas.length + " preguntas";
  add({
    path: url, page: "challenge", type: "article",
    title: (`${ch.title} — reto de ${c.name.toLowerCase()} | RÉTAME`.length <= 65 ? `${ch.title} — reto de ${c.name.toLowerCase()} | RÉTAME` : `${ch.title} | RÉTAME`),
    desc: clip(`${ch.excerpt} ${ch.description} Con solución explicada.`),
    og: ogFile("reto-" + ch.slug), ogTitle: `${ch.title} · RÉTAME`, ogAlt: `${ch.title}: reto de ${c.name.toLowerCase()} en RÉTAME`,
    ld: [breadcrumbLd([["/", "RÉTAME"], ["/retos/", "Retos"], [`/retos/${c.slug}/`, c.name], [url, ch.title]])],
    body: `<div class="wrap">
${crumbs([["/", "Inicio"], ["/retos/", "Retos"], [`/retos/${c.slug}/`, c.name], [url, ch.title]])}
<div class="two-col"><div>
<header class="page-head"><p class="eyebrow" style="color:${c.color}">${icon(c.icon)}${esc(c.name)}${ch.topic ? " · " + esc(E.TOPICS[ch.topic]) : ""}</p><h1>${esc(ch.title)}</h1><p class="lead">${esc(ch.excerpt)}</p></header>
<div data-duel-banner></div>
<div data-challenge="${esc(ch.slug)}">${E.stageHtml(ch, "Empezar")}</div>
<section class="prose" aria-labelledby="about"><h2 id="about">Sobre este reto</h2><p>${esc(ch.description)}</p><p>${nq} · dificultad ${ch.difficulty} de 5 · unos ${esc(E.durLabel(ch.duration))} · hasta ${E.fmt(ch.max_points)} puntos.</p></section>
<section class="section statement" aria-labelledby="st">
<h2 id="st">Enunciado y solución</h2>
<details class="fold"><summary>Ver el enunciado completo</summary><div>${statementHtml(ch)}</div></details>
<details class="fold" id="solucion"><summary>Ver la solución</summary><div><p>${esc(ch.solution)}</p>${ch.data.preguntas ? `<ul>${ch.data.preguntas.filter((q) => q.explica).map((q) => `<li>${esc(q.explica)}</li>`).join("")}</ul>` : ""}</div></details>
<details class="fold"><summary>Cómo se juega</summary><div><p>${esc(HOWTO[ch.kind])}</p>${SCORING}</div></details>
</section>
</div>
<aside class="aside-box" aria-labelledby="rel"><h2 id="rel">Más de ${esc(c.name.toLowerCase())}</h2>${E.challengeList(related)}
<div class="actions"><a class="btn btn-ghost btn-sm btn-block" href="${href("/juegos/?tema=" + c.slug)}">${icon("play")}Sesión de ${esc(c.name.toLowerCase())}</a></div>
${others.length ? `<h2 style="margin-top:22px">También te puede gustar</h2>${E.challengeList(others)}` : ""}</aside>
</div>
${adSlot("content")}
</div>`
  });
}

// Duelos
add({
  path: "/duelos/", page: "duels",
  title: "Reta a tus amigos: duelos por enlace, sin cuentas | RÉTAME",
  desc: "Juega un reto, manda el enlace con tu puntuación por WhatsApp o Telegram y comprueba quién gana. Sin registro y con el mismo reto para los dos.",
  og: ogFile("duelo"), ogTitle: "Te han retado en RÉTAME",
  ld: [breadcrumbLd([["/", "RÉTAME"], ["/duelos/", "Duelos"]])],
  body: `<div class="wrap wrap-narrow">
<div data-duel-play hidden></div>
<div data-duels-intro>
${crumbs([["/", "Inicio"], ["/duelos/", "Duelos"]])}
<header class="page-head"><h1>Reta a tus amigos</h1><p class="lead">Juegas, mandas un enlace con tu marca y tu amigo juega exactamente lo mismo. Sin cuentas, sin descargas.</p></header>
<section class="band" style="margin-bottom:40px"><div><ol class="steps-list"><li><div><b>Juega un reto</b><span>El reto del día o cualquier otro.</span></div></li><li><div><b>Pulsa «Retar a un amigo»</b><span>Escribe tu nombre si quieres y elige WhatsApp, Telegram o copiar el enlace.</span></div></li><li><div><b>Tu amigo abre el enlace</b><span>Ve tu marca, juega el mismo reto (incluso la misma secuencia de memoria) y ve quién gana.</span></div></li><li><div><b>Revancha</b><span>Puede retarte de vuelta con un toque.</span></div></li></ol></div>
<div class="chat" aria-label="Ejemplo de duelo"><span class="chat-label">Así llega (ejemplo)</span><div class="bubble me">Te reto en RÉTAME: «La balanza de las 9 monedas».
🟩🟩🟥 · 640 puntos en 48 s.
¿Puedes superarlo?<span class="link-preview">La balanza de las 9 monedas · RÉTAME</span></div></div></section>
<div class="actions" style="margin:0 0 32px"><a class="btn btn-primary btn-lg" href="${href("/reto-del-dia/")}">${icon("play")}Jugar el reto de hoy y retar</a></div>
<section class="section" aria-labelledby="pick"><h2 id="pick">Retos para un duelo</h2>${E.challengeList(featured)}</section>
<section class="section prose"><h2>Qué viaja en el enlace</h2><p>El nombre que escribas (opcional), tu puntuación y tu tiempo van dentro del propio enlace. No se guardan en ningún servidor de RÉTAME. Compártelo solo con quien quieras.</p></section>
</div>
</div>`
});

// Progreso (funcional, no indexable)
add({
  path: "/progreso/", page: "progress", noindex: true,
  title: "Mi progreso | RÉTAME",
  desc: "Tu racha, tus récords y tus logros en RÉTAME. Se guardan solo en este dispositivo.",
  body: `<div class="wrap wrap-narrow">
<header class="page-head"><h1>Mi progreso</h1><p class="lead">Racha, récords y logros de este dispositivo. Sin registro.</p></header>
<div data-progress><noscript><p class="empty">Tu progreso se guarda en el navegador y necesita JavaScript para mostrarse.</p></noscript></div>
</div>`
});

// Cómo funciona
add({
  path: "/como-funciona/", page: "info",
  title: "Cómo funciona RÉTAME: reto diario, puntos, rachas y duelos",
  desc: "Las reglas de RÉTAME: un reto del día para todo el mundo, sesiones sin repetir, puntos por precisión y rapidez, rachas, logros y duelos por enlace.",
  ld: [breadcrumbLd([["/", "RÉTAME"], ["/como-funciona/", "Cómo funciona"]])],
  body: `<div class="wrap wrap-narrow">
${crumbs([["/", "Inicio"], ["/como-funciona/", "Cómo funciona"]])}
<header class="page-head"><h1>Cómo funciona</h1><p class="lead">Pocas reglas, y todas a la vista.</p></header>
<div class="prose">
<h2>1. Un reto del día para todo el mundo</h2><p>Cada día a medianoche (hora peninsular española) sale un reto nuevo de 4 o 5 pruebas de categorías distintas y dificultad creciente. Es el mismo para todo el mundo y no cambia al recargar. Se puntúa sobre 1000.</p>
<h2>2. Sesiones que no se repiten</h2><p>En <a href="${href("/juegos/")}">Jugar</a> eliges una categoría y un modo —Sorpréndeme, Adaptativo o una dificultad fija— y juegas 10 retos seguidos. El motor mezcla retos escritos a mano con retos generados, cambia de mecánica y evita lo que ya has visto.</p>
<h2>3. Puntos</h2>${SCORING}<p>Los juegos de opinión «En grupo» no dan puntos: no tienen respuesta correcta.</p>
<h2>4. Racha, récords y logros</h2><p>Si completas al menos un reto al día, tu racha sube. Si un día no juegas, vuelve a cero. En <a href="${href("/progreso/")}">Mi progreso</a> tienes tu mejor reto del día, tu mejor precisión, tus retos sin fallos y tus logros.</p>
<h2>5. Duelos</h2><p>Al terminar cualquier reto puedes crear un enlace con tu marca. Quien lo abre juega lo mismo que tú y ve quién gana. Más en <a href="${href("/duelos/")}">Duelos</a>.</p>
<h2>6. Retos fiables</h2><p>Antes de mostrarse, cada reto pasa una validación automática: se recalculan las operaciones, se comprueban las series y los órdenes, y se descartan preguntas con más de una respuesta válida o respuestas de texto ambiguas. La trivia usa datos estables y verificables.</p>
</div>
<section class="section"><h2>Preguntas frecuentes</h2>
<details class="fold"><summary>¿Necesito una cuenta?</summary><div><p>No. Juegas, tienes racha y creas duelos sin registrarte. Tu progreso se guarda en tu navegador.</p></div></details>
<details class="fold"><summary>¿Qué se guarda de mí?</summary><div><p>Tus puntos, tiempos, racha y logros, solo en el almacenamiento de tu navegador. No se envían a ningún servidor. Más detalle en la <a href="${href("/privacidad/")}">política de privacidad</a>.</p></div></details>
<details class="fold"><summary>¿Se acaban los retos?</summary><div><p>No. Cuando has visto todo lo de una categoría, empieza un ciclo nuevo. Además, cada categoría genera retos nuevos al momento.</p></div></details>
<details class="fold"><summary>He encontrado un error en una pregunta</summary><div><p>Gracias. Cuéntanos qué reto y qué pregunta desde la página de <a href="${href("/contacto/")}">contacto</a>.</p></div></details>
</section>
${adSlot("article")}
</div>`
});

// Sobre RÉTAME
add({
  path: "/sobre-retame/", page: "info",
  title: "Sobre RÉTAME: qué es y por qué existe",
  desc: "RÉTAME es un juego diario de retos cortos para jugar en dos minutos y retar a tus amigos. Sin registro, sin trampas de diseño y con retos comprobados.",
  ld: [breadcrumbLd([["/", "RÉTAME"], ["/sobre-retame/", "Sobre RÉTAME"]])],
  body: `<div class="wrap wrap-narrow">
${crumbs([["/", "Inicio"], ["/sobre-retame/", "Sobre RÉTAME"]])}
<header class="page-head"><h1>Sobre RÉTAME</h1><p class="lead">El juego diario que abres un par de minutos y luego mandas a alguien para picarle.</p></header>
<div class="prose">
<h2>Qué es</h2><p>RÉTAME es una web de retos cortos en español: lógica, matemáticas, palabras, memoria, trivia, estimación, observación y ordenar. Cada día hay un reto nuevo, igual para todo el mundo, y cualquier reto se puede convertir en un duelo con un enlace.</p>
<h2>Por qué existe</h2><p>Porque los mejores juegos diarios caben en una pausa del café y terminan en una conversación: «¿cuánto has sacado?». RÉTAME quiere ser eso: un momento corto, un reto honesto y una excusa para retar a alguien.</p>
<h2>Cómo lo hacemos</h2>
<ul><li><b>Sin registro.</b> Tu progreso vive en tu dispositivo.</li><li><b>Retos comprobados.</b> Cada pregunta pasa una validación automática antes de mostrarse, y la trivia usa datos estables.</li><li><b>Juego, no casino.</b> Rachas y logros sí; notificaciones, recompensas falsas y trucos para engancharte, no.</li><li><b>Pensar cuenta más que correr.</b> La rapidez solo da un pequeño extra.</li></ul>
${C.owner ? `<h2>Quién está detrás</h2><p>RÉTAME lo crea y lo mantiene ${esc(C.owner)}.${C.contactEmail ? ` Puedes escribir a <a href="mailto:${esc(C.contactEmail)}">${esc(C.contactEmail)}</a>.` : ""}</p>` : ""}
<h2>¿Tienes una idea?</h2><p>Si se te ocurre un reto, has visto un error o quieres colaborar, pásate por <a href="${href("/contacto/")}">contacto</a>.</p>
</div>
${adSlot("article")}
</div>`
});

// Contacto
add({
  path: "/contacto/", page: "info",
  title: "Contacto | RÉTAME",
  desc: "Escribe a RÉTAME para proponer retos, avisar de un error o hablar de colaboraciones.",
  ld: [breadcrumbLd([["/", "RÉTAME"], ["/contacto/", "Contacto"]])],
  body: `<div class="wrap wrap-narrow">
${crumbs([["/", "Inicio"], ["/contacto/", "Contacto"]])}
<header class="page-head"><h1>Contacto</h1><p class="lead">¿Una idea de reto, un error o una colaboración? Cuéntanoslo.</p></header>
<section class="card">
${C.contactEmail ? `<h2>Escríbenos</h2><p style="font-size:1.25rem;font-weight:800"><a href="mailto:${esc(C.contactEmail)}">${esc(C.contactEmail)}</a></p>` : `<h2>Escríbenos</h2><p>El canal de contacto todavía no está publicado. Vuelve a esta página en unos días.</p>`}
<ul><li><b>Un reto nuevo:</b> mándalo con su solución.</li><li><b>Un error:</b> dinos en qué reto, qué pregunta y en qué dispositivo.</li><li><b>Colaboraciones o prensa:</b> cuéntanos qué necesitas.</li></ul>
<p class="muted small">No tenemos formulario: así no guardamos tus datos en ningún sitio más que en el correo que nos envíes.</p>
</section>
</div>`
});

// Privacidad
const ADS_ON = /^ca-pub-\d{10,20}$/.test(C.adsense.client || "");
const holder = C.owner ? `${esc(C.owner)}${C.ownerId ? " (" + esc(C.ownerId) + ")" : ""}${C.ownerAddress ? ", con domicilio en " + esc(C.ownerAddress) : ""}` : "el titular de este sitio web";
const contactLine = C.contactEmail ? `<a href="mailto:${esc(C.contactEmail)}">${esc(C.contactEmail)}</a>` : "los datos de contacto que se publiquen en la página de contacto";
add({
  path: "/privacidad/", page: "info",
  title: "Política de privacidad | RÉTAME",
  desc: "Qué datos trata RÉTAME, dónde se guardan, para qué y cuáles son tus derechos.",
  body: `<div class="wrap wrap-narrow">
${crumbs([["/", "Inicio"], ["/privacidad/", "Privacidad"]])}
<header class="page-head"><h1>Política de privacidad</h1><p class="lead">Última actualización: ${new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(new Date())}.</p></header>
<div class="prose">
<h2>Responsable</h2><p>El responsable del tratamiento es ${holder}. Contacto: ${contactLine}.</p>
<h2>Qué datos se tratan</h2>
<ul>
<li><b>En tu dispositivo (almacenamiento local del navegador):</b> tus puntuaciones, tiempos, racha, récords, logros, los retos que ya has visto (para no repetírtelos) y el nombre que elijas para los duelos. Se guardan con las claves <code>retame:v2</code> (y, si jugaste a la versión anterior, <code>retame:v1</code>). No se envían a ningún servidor de RÉTAME.</li>
<li><b>En los enlaces de duelo:</b> el nombre que escribas (opcional), tu puntuación, tu tiempo y, en el reto del día, tu resultado en cuadros, viajan dentro del propio enlace. Quien lo reciba puede verlos, y las aplicaciones por las que lo envíes (por ejemplo, WhatsApp o Telegram) lo tratan según sus propias políticas.</li>
<li><b>Datos técnicos de conexión:</b> el proveedor que aloja la web puede registrar datos básicos de cada visita (como la dirección IP, el navegador y la página solicitada) para servir la web y protegerla frente a abusos.</li>
<li><b>Si nos escribes:</b> tu correo y lo que nos cuentes, solo para responderte.</li>
</ul>
<h2>Qué no hacemos</h2><ul><li>No hay cuentas ni contraseñas.</li><li>No vendemos datos.</li><li>No usamos herramientas de analítica${ADS_ON ? "" : " ni publicidad"}.</li><li>Las fuentes tipográficas se sirven desde el propio dominio: tu navegador no contacta con servicios de terceros para mostrarlas.</li></ul>
<h2>Base legal y plazos</h2><p>El almacenamiento local es necesario para prestar el servicio que pides (recordar tu progreso) y permanece hasta que lo borres desde <a href="${href("/progreso/")}">Mi progreso</a> o limpies los datos del sitio en tu navegador. Los correos se conservan el tiempo necesario para atenderlos.</p>
${ADS_ON ? `<h2>Publicidad</h2><p>Este sitio muestra anuncios de Google AdSense. Google y sus socios pueden usar cookies e identificadores para mostrar anuncios, medirlos y, si lo aceptas, personalizarlos. En el Espacio Económico Europeo, Reino Unido y Suiza te pedimos el consentimiento mediante una plataforma de gestión del consentimiento certificada por Google; puedes cambiar tu elección en cualquier momento desde el enlace de preferencias de privacidad. Más información en <a href="https://policies.google.com/technologies/partner-sites" rel="noopener" target="_blank">cómo usa Google los datos de los sitios que utilizan sus servicios</a>. Tus datos de progreso no se comparten con las redes publicitarias.</p>` : `<h2>Publicidad</h2><p>Actualmente RÉTAME no muestra anuncios. Si en el futuro los incorpora, esta política se actualizará y se te pedirá el consentimiento cuando sea necesario antes de cargar cualquier tecnología publicitaria.</p>`}
<h2>Tus derechos</h2><p>Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a ${contactLine}. Como el progreso del juego solo está en tu dispositivo, puedes consultarlo y borrarlo tú mismo en cualquier momento. Si consideras que no se han atendido tus derechos, puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es) o la autoridad de tu país.</p>
<h2>Menores</h2><p>RÉTAME es un juego para público general sin contenido sensible y no pide datos personales para jugar.</p>
</div>
</div>`
});

// Cookies
add({
  path: "/cookies/", page: "info",
  title: "Política de cookies | RÉTAME",
  desc: "Qué cookies y qué almacenamiento local usa RÉTAME y cómo gestionarlos.",
  body: `<div class="wrap wrap-narrow">
${crumbs([["/", "Inicio"], ["/cookies/", "Cookies"]])}
<header class="page-head"><h1>Política de cookies</h1><p class="lead">Última actualización: ${new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(new Date())}.</p></header>
<div class="prose">
<h2>Lo que usa RÉTAME</h2>
<ul><li><b>Almacenamiento local del navegador</b> (no es una cookie): guarda tu progreso de juego con la clave <code>retame:v2</code>. Es técnico y necesario para recordar tu racha y tus puntos; no sirve para identificarte ni se envía a ningún servidor.</li></ul>
<p>RÉTAME no instala cookies propias ni usa herramientas de analítica.</p>
${ADS_ON ? `<h2>Cookies de terceros: publicidad</h2><p>Este sitio muestra anuncios de Google AdSense. Google y sus socios pueden usar cookies e identificadores para servir, medir y, si das tu consentimiento, personalizar anuncios. En el Espacio Económico Europeo, Reino Unido y Suiza se te pide permiso antes, mediante una plataforma de gestión del consentimiento certificada por Google, y puedes cambiar tu elección cuando quieras. Consulta <a href="https://policies.google.com/technologies/ads" rel="noopener" target="_blank">cómo usa Google las cookies en publicidad</a>.</p>` : `<h2>Publicidad</h2><p>Actualmente no se muestran anuncios ni se cargan cookies de terceros. Si eso cambia, esta política se actualizará y se pedirá tu consentimiento antes de cargar cualquier cookie que lo necesite.</p>`}
<h2>Cómo borrarlo</h2><p>Puedes borrar tu progreso desde <a href="${href("/progreso/")}">Mi progreso</a> o eliminar los datos del sitio desde los ajustes de tu navegador. Si lo haces, RÉTAME no podrá recordar tu racha ni tus puntos.</p>
<p>Más detalles en la <a href="${href("/privacidad/")}">política de privacidad</a>.</p>
</div>
</div>`
});

// 404
add({
  path: "/404.html", page: "notfound", noindex: true,
  title: "Página no encontrada | RÉTAME",
  desc: "Esta página no existe. Vuelve a RÉTAME o juega el reto de hoy.",
  body: `<div class="wrap wrap-narrow notfound">
<p class="big" aria-hidden="true">404</p>
<h1>Aquí no hay ningún reto.</h1>
<p class="lead" style="margin:0 auto">Puede que el enlace esté mal escrito o que la página haya cambiado de sitio. El reto de hoy, en cambio, sí existe.</p>
<div class="actions"><a class="btn btn-primary btn-lg" href="${href("/reto-del-dia/")}">${icon("play")}Jugar el reto de hoy</a><a class="btn btn-ghost btn-lg" href="${href("/retos/")}">Explorar retos</a></div>
<p class="link-row"><a href="${href("/")}">Volver a RÉTAME</a></p>
</div>`
});

/* --- 7a. Archivo único -------------------------------------------------------
 * Todas las páginas viajan en ROUTES y el router de app.js las pinta según
 * el hash. Fuente e icono incrustados: no necesita servidor ni internet. */
if (STANDALONE) {
  const font = fs.readFileSync(path.join(SRC, "static", "fonts", "bricolage-grotesque-latin.woff2")).toString("base64");
  const css = cssOut.replace('url("../fonts/bricolage-grotesque-latin.woff2")', `url(data:font/woff2;base64,${font})`);
  const favicon = "data:image/svg+xml," + encodeURIComponent(fs.readFileSync(path.join(SRC, "static", "favicon.svg"), "utf8"));
  const routes = {};
  for (const p of pages) routes[p.path] = { path: p.path, title: p.title, desc: p.desc, page: p.page || "info", body: p.body };
  const home = pages.find((p) => p.path === "/");
  const safe = (t) => t.replace(/<\/(script)/gi, "<\\/$1");
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(home.title)}</title>
<meta name="description" content="${esc(home.desc)}">
<meta name="theme-color" content="#5B21E8">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="${favicon}">
<style>${css}</style>
</head>
<body data-page="home">
<a class="skip-link" href="#main">Saltar al contenido</a>
${header("/")}
<main id="main" tabindex="-1">
${home.body}
</main>
${footer()}
<div class="toast" data-toast role="status" aria-live="polite" hidden></div>
<script>var ROUTES = ${JSON.stringify(routes).replace(/</g, "\\u003c")};</script>
<script>${safe(jsOut)}</script>
</body>
</html>
`;
  const file = process.env.OUT_FILE ? path.resolve(process.env.OUT_FILE) : path.join(ROOT, "standalone", "retame.html");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  console.log(`✓ Archivo único: ${path.relative(ROOT, file)} (${(html.length / 1024).toFixed(0)} KB, ${pages.length} páginas)`);
  process.exit(0);
}

/* --- 7. Escritura, sitemap, robots, manifest ------------------------------ */
const titles = new Map(), descs = new Map();
for (const p of pages) {
  if (!p.noindex) {
    if (titles.has(p.title)) errors.push(`título duplicado: ${p.path} y ${titles.get(p.title)}`);
    if (descs.has(p.desc)) errors.push(`descripción duplicada: ${p.path} y ${descs.get(p.desc)}`);
    titles.set(p.title, p.path); descs.set(p.desc, p.path);
  }
  const file = p.path.endsWith(".html") ? path.join(OUT, p.path) : path.join(OUT, p.path, "index.html");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, render(p));
}
if (errors.length) { console.error("✗ SEO:\n  " + errors.join("\n  ")); process.exit(1); }

/* lastmod real: solo cambia cuando cambia el contenido de la página. */
let smState = {};
try { smState = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { smState = {}; }
const indexable = pages.filter((p) => !p.noindex);
const nextState = {};
for (const p of indexable) {
  const h = hashOf(p.title + p.desc + p.body);
  const prev = smState[p.path];
  nextState[p.path] = prev && prev.h === h ? prev : { h, lastmod: TODAY };
}
if (!process.env.OUT_DIR) fs.writeFileSync(STATE_FILE, JSON.stringify(nextState, null, 1) + "\n");
if (SITE) {
  fs.writeFileSync(path.join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${indexable.map((p) => `  <url><loc>${esc(abs(p.path))}</loc><lastmod>${nextState[p.path].lastmod}</lastmod></url>`).join("\n")}
</urlset>
`);
}
fs.writeFileSync(path.join(OUT, "robots.txt"), `# RÉTAME
User-agent: *
Allow: /
${SITE ? `\nSitemap: ${abs("/sitemap.xml")}\n` : "\n# Sin dominio configurado (CONFIG.siteUrl): no se publica sitemap.\n"}`);
fs.writeFileSync(path.join(OUT, "manifest.webmanifest"), JSON.stringify({
  name: "RÉTAME — Reto diario", short_name: "RÉTAME", lang: "es", dir: "ltr",
  description: "Un reto nuevo cada día: lógica, memoria, números y trivia en dos minutos.",
  start_url: href("/"), scope: href("/"), display: "standalone", orientation: "portrait",
  background_color: "#FAF9FD", theme_color: "#5B21E8", categories: ["games", "entertainment", "education"],
  icons: [
    { src: href("/icons/icon-192.png"), sizes: "192x192", type: "image/png" },
    { src: href("/icons/icon-512.png"), sizes: "512x512", type: "image/png" },
    { src: href("/icons/maskable-512.png"), sizes: "512x512", type: "image/png", purpose: "maskable" }
  ]
}, null, 1));
if (ADS_ON) fs.writeFileSync(path.join(OUT, "ads.txt"), `google.com, ${C.adsense.client.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n`);

/* --- 8. Informe ------------------------------------------------------------- */
const total = pages.length, idx = indexable.length;
console.log(`✓ ${total} páginas (${idx} indexables), ${E.CHALLENGES.length} retos validados → public/`);
console.log(`  ${JS_FILE} (${(jsOut.length / 1024).toFixed(0)} KB) · ${CSS_FILE} (${(cssOut.length / 1024).toFixed(0)} KB)`);
if (missing.length) console.log("! Pendiente de configurar (src/config.js):\n  - " + missing.join("\n  - "));
