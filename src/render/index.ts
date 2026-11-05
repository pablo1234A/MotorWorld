/**
 * Page renderer: SiteDocument → complete HTML document. Used for the editor preview
 * (mode "edit"), the hosted site (mode "publish") and the ZIP export (mode "export").
 */
import type { Page, SiteDocument } from "@/engine/schema";
import { googleFontsHref } from "@/engine/styles";
import { escapeAttr as a, escapeHtml as h } from "@/engine/util";
import { BASE_CSS, themeVars } from "./css";
import { RUNTIME_JS } from "./runtime";
import { renderSection, type RenderCtx, type RenderMode } from "./sections";

export interface RenderTarget {
  mode: RenderMode;
  projectId: string;
  /** Public base URL of the app, e.g. https://builder.example.com (no trailing slash). */
  appUrl: string;
  /** Path prefix for hosted sites, e.g. "/s/mi-web". Ignored for export. */
  basePath?: string;
  /** Stripe Checkout endpoint, when configured server-side. */
  checkoutEnabled?: boolean;
  /** export: map of upload src → relative file path inside the ZIP. */
  assetMap?: Record<string, string>;
  /** export: reference external site.css/site.js instead of inlining. */
  externalAssets?: boolean;
}

function depthOf(path: string) {
  return path === "/" ? 0 : path.split("/").filter(Boolean).length;
}

export function linkMapper(doc: SiteDocument, page: Page, t: RenderTarget) {
  return (href: string): string => {
    if (!href) return "#";
    if (/^(https?:|mailto:|tel:)/.test(href)) return href;
    if (href.startsWith("#")) return href;
    const [rawPath, hash] = href.split("#");
    const path = rawPath || "/";
    const suffix = hash ? `#${hash}` : "";
    if (t.mode === "export") {
      const up = "../".repeat(depthOf(page.path));
      if (path === page.path) return suffix || (up || "./") + (path === "/" ? "index.html" : "index.html");
      const rel = path === "/" ? "index.html" : `${path.replace(/^\//, "")}/index.html`;
      return `${up}${rel}${suffix}`;
    }
    if (t.mode === "publish") {
      const base = t.basePath ?? "";
      if (path === page.path && hash) return suffix;
      return `${base}${path === "/" ? (base ? "" : "/") : path}${suffix}`;
    }
    return href; // edit: the bridge intercepts navigation
  };
}

export function assetMapper(page: Page, t: RenderTarget) {
  return (src: string): string => {
    if (!src || /^(data:|https?:)/.test(src)) return src;
    if (t.mode === "export") {
      const up = "../".repeat(depthOf(page.path));
      const mapped = t.assetMap?.[src];
      if (mapped) return up + mapped;
      if (src.startsWith("/vendor/")) return up + src.slice(1);
      return src;
    }
    return src;
  };
}

function ctxFor(doc: SiteDocument, page: Page, t: RenderTarget): RenderCtx {
  return {
    doc,
    page,
    mode: t.mode,
    link: linkMapper(doc, page, t),
    asset: assetMapper(page, t),
    formAction: `${t.appUrl}/api/forms/${t.projectId}`,
    checkoutAction: t.checkoutEnabled ? `${t.appUrl}/api/checkout/${t.projectId}` : null,
    projectId: t.projectId,
    h1Used: false,
    h1SectionId: (page.sections.find((s) => (s.type === "hero" || s.type === "scene3d") && s.content.heading) ?? page.sections.find((s) => s.type !== "navbar" && s.type !== "footer" && s.content.heading && !(s.hidden?.desktop && s.hidden?.mobile)))?.id ?? null,
    sectionIndex: 0,
  };
}

/** Renders the sections of a page grouped into header / main / footer landmarks. */
export function renderBody(doc: SiteDocument, page: Page, t: RenderTarget): string {
  const ctx = ctxFor(doc, page, t);
  const header: string[] = [];
  const main: string[] = [];
  const footer: string[] = [];
  let showcaseCount = 0;
  page.sections.forEach((s, i) => {
    ctx.sectionIndex = s.type === "showcase" ? showcaseCount++ : i;
    const html = renderSection(ctx, s);
    if (s.type === "navbar" && main.length === 0) header.push(html);
    else if (s.type === "footer") footer.push(html);
    else main.push(html);
  });
  return `${header.join("")}<main id="wb-main">${main.join("")}</main>${footer.join("")}`;
}

export function renderCss(doc: SiteDocument): string {
  return themeVars(doc.theme) + BASE_CSS;
}

function runtimeConfig(doc: SiteDocument, page: Page, t: RenderTarget) {
  const asset = assetMapper(page, t);
  const vendor = (f: string) => (t.mode === "export" ? asset(`/vendor/${f}`) : `${t.appUrl}/vendor/${f}`);
  const cfg = {
    mode: t.mode,
    projectId: t.projectId,
    lang: doc.settings.lang,
    currency: doc.settings.currency,
    motion: doc.theme.motion,
    gsap: vendor("gsap.min.js"),
    scrollTrigger: vendor("ScrollTrigger.min.js"),
    checkoutAction: t.checkoutEnabled ? `${t.appUrl}/api/checkout/${t.projectId}` : null,
  };
  return `window.__WB=${JSON.stringify(cfg).replace(/</g, "\\u003c")};`;
}

function favicon(doc: SiteDocument) {
  if (doc.settings.favicon) return doc.settings.favicon;
  const letter = (doc.settings.siteName.trim()[0] ?? "W").toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="${Math.min(32, doc.theme.radius * 2 + 8)}" fill="${doc.theme.colors.primary}"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700" font-size="36" fill="${doc.theme.colors.primaryText}">${h(letter)}</text></svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

function structuredData(doc: SiteDocument, url: string) {
  const type = doc.kind === "restaurant" ? "Restaurant" : doc.kind === "store" ? "Store" : doc.kind === "dealership" ? "AutoDealer" : doc.kind === "education" ? "EducationalOrganization" : "Organization";
  return JSON.stringify({ "@context": "https://schema.org", "@type": type, name: doc.settings.siteName, url }).replace(/</g, "\\u003c");
}

export interface RenderedPage {
  html: string;
  css: string;
  js: string;
}

export function renderPage(doc: SiteDocument, page: Page, t: RenderTarget): RenderedPage {
  const css = renderCss(doc);
  const js = RUNTIME_JS;
  const fonts = googleFontsHref(doc.theme);
  const canonicalBase = t.mode === "publish" ? `${t.appUrl}${t.basePath ?? ""}` : t.appUrl;
  const canonical = `${canonicalBase}${page.path === "/" ? (t.mode === "publish" ? "" : "/") : page.path}`;
  const title = page.seo.title || `${page.name} — ${doc.settings.siteName}`;
  const desc = page.seo.description;
  const og = page.seo.ogImage;
  const robots = page.seo.noindex || t.mode === "edit" ? '<meta name="robots" content="noindex,nofollow">' : "";
  const up = t.mode === "export" ? "../".repeat(depthOf(page.path)) : "";
  const styleTag = t.externalAssets ? `<link rel="stylesheet" href="${up}assets/site.css">` : `<style id="wb-theme">${css}</style>`;
  const scriptTag = t.externalAssets
    ? `<script>${runtimeConfig(doc, page, t)}</script><script src="${up}assets/site.js" defer></script>`
    : `<script>${runtimeConfig(doc, page, t)}</script><script>${js}</script>`;
  const bridge = t.mode === "edit" ? `<style>${EDITOR_CSS}</style><script>${EDITOR_BRIDGE_JS}</script>` : "";
  const analytics = t.mode === "publish" && doc.settings.analytics?.plausibleDomain ? `<script defer data-domain="${a(doc.settings.analytics.plausibleDomain)}" src="https://plausible.io/js/script.js"></script>` : "";

  const html = `<!doctype html>
<html lang="${a(doc.settings.lang)}" class="wb-js-off">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${h(title)}</title>
${desc ? `<meta name="description" content="${a(desc)}">` : ""}
${robots}
${t.mode !== "edit" ? `<link rel="canonical" href="${a(canonical)}">` : ""}
<meta property="og:type" content="website">
<meta property="og:title" content="${a(title)}">
${desc ? `<meta property="og:description" content="${a(desc)}">` : ""}
${og ? `<meta property="og:image" content="${a(og)}">` : ""}
<meta name="twitter:card" content="${og ? "summary_large_image" : "summary"}">
<meta name="theme-color" content="${a(doc.theme.colors.bg)}">
<link rel="icon" href="${a(favicon(doc))}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${a(fonts)}">
${styleTag}
${t.mode !== "edit" ? `<script type="application/ld+json">${structuredData(doc, canonical)}</script>` : ""}
${analytics}
</head>
<body>
<div id="wb-root">${renderBody(doc, page, t)}</div>
${scriptTag}
${bridge}
</body>
</html>`;
  return { html, css, js };
}

export function sitemapXml(doc: SiteDocument, baseUrl: string): string {
  const urls = doc.pages
    .filter((p) => !p.seo.noindex)
    .map((p) => `<url><loc>${h(baseUrl + (p.path === "/" ? (/\/s\/[^/]+$/.test(baseUrl) ? "" : "/") : p.path))}</loc></url>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

export function robotsTxt(baseUrl: string): string {
  return `User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`;
}

// ───────────────────────────── editor bridge ─────────────────────────────

const EDITOR_CSS = String.raw`
[data-wb-section]{outline:0 solid transparent;transition:outline-color .12s}
.wbx-hover{position:fixed;pointer-events:none;z-index:9998;border:1.5px solid #6b5cff;border-radius:2px;transition:all .08s ease-out}
.wbx-hover span{position:absolute;top:-22px;left:-1.5px;background:#6b5cff;color:#fff;font:600 11px/22px system-ui,sans-serif;padding:0 8px;border-radius:4px 4px 0 0;white-space:nowrap}
.wbx-sel{position:absolute;pointer-events:none;z-index:9997;border:2px solid #6b5cff;box-shadow:0 0 0 4px rgba(107,92,255,.15)}
[data-wb-field]:hover{outline:1px dashed rgba(107,92,255,.7);outline-offset:3px;cursor:text}
[data-wb-field][contenteditable]{outline:2px solid #6b5cff!important;outline-offset:3px;cursor:text;background:rgba(107,92,255,.06)}
[data-wb-media]{cursor:pointer}
[data-wb-media]:hover{outline:2px dashed rgba(107,92,255,.8);outline-offset:-2px}
`;

/** Runs inside the preview iframe. Talks to the editor via postMessage (same origin only). */
export const EDITOR_BRIDGE_JS = String.raw`(function(){
var d=document;
/* The preview runs in a sandboxed iframe with an opaque origin: messages carry no secrets and the
   editor only accepts them from this iframe's window, while we only accept messages from our parent. */
function post(m){parent.postMessage(Object.assign({source:"wb-preview"},m),"*")}
var hover=d.createElement("div");hover.className="wbx-hover";hover.innerHTML="<span></span>";hover.style.display="none";d.body.appendChild(hover);
var sel=d.createElement("div");sel.className="wbx-sel";sel.style.display="none";d.body.appendChild(sel);
var selected=null,editing=null;
var LABELS=${JSON.stringify({ navbar: "Navegación", hero: "Hero", logos: "Logos", features: "Características", showcase: "Destacado", steps: "Pasos", stats: "Cifras", gallery: "Galería", testimonials: "Testimonios", pricing: "Precios", products: "Productos", menu: "Carta", team: "Equipo", timeline: "Cronología", faq: "FAQ", cta: "Llamada a la acción", contact: "Contacto", newsletter: "Newsletter", richtext: "Texto", marquee: "Marquesina", dashboard: "Panel", scene3d: "Escena 3D", custom: "HTML", footer: "Pie" })};
function place(el,box){var r=el.getBoundingClientRect();box.style.top=r.top+"px";box.style.left=r.left+"px";box.style.width=r.width+"px";box.style.height=r.height+"px"}
function placeSel(){if(!selected||!d.contains(selected)){sel.style.display="none";return}var r=selected.getBoundingClientRect();sel.style.display="block";sel.style.top=(r.top+scrollY)+"px";sel.style.left=(r.left+scrollX)+"px";sel.style.width=r.width+"px";sel.style.height=r.height+"px"}
d.addEventListener("mouseover",function(e){var s=e.target.closest&&e.target.closest("[data-wb-section]");if(!s){hover.style.display="none";return}hover.style.display="block";hover.firstChild.textContent=LABELS[s.getAttribute("data-wb-type")]||"Sección";place(s,hover)});
d.addEventListener("mouseleave",function(){hover.style.display="none"});
window.addEventListener("scroll",function(){hover.style.display="none"},{passive:true});
window.addEventListener("resize",placeSel);
function selectEl(s,silent){selected=s;placeSel();if(!silent&&s)post({type:"select",sectionId:s.getAttribute("data-wb-section")})}
d.addEventListener("click",function(e){
  var t=e.target;
  if(editing&&editing.contains(t))return;
  var link=t.closest("a");
  if(link){e.preventDefault();}
  var media=t.closest("[data-wb-media]");var sec=t.closest("[data-wb-section]");
  if(sec)selectEl(sec);
  if(media&&sec){post({type:"media",sectionId:sec.getAttribute("data-wb-section"),field:media.getAttribute("data-wb-media"),itemId:media.getAttribute("data-wb-item")});return}
  var f=t.closest("[data-wb-field]");
  if(f&&sec)post({type:"field",sectionId:sec.getAttribute("data-wb-section"),field:f.getAttribute("data-wb-field"),itemId:f.getAttribute("data-wb-item")});
  if(link&&!f){var href=link.getAttribute("href")||"";if(href&&href[0]==="/")post({type:"navigate",href:href})}
},true);
d.addEventListener("submit",function(e){e.preventDefault()},true);
d.addEventListener("dblclick",function(e){
  var f=e.target.closest("[data-wb-field]");if(!f||f.getAttribute("data-wb-field")==="html")return;var sec=f.closest("[data-wb-section]");if(!sec)return;
  e.preventDefault();startEdit(f,sec);
});
function startEdit(f,sec){
  if(editing)finish(true);editing=f;var original=f.textContent;
  try{f.contentEditable="plaintext-only"}catch(_){f.contentEditable="true"}
  if(f.contentEditable!=="plaintext-only")f.contentEditable="true";
  f.focus();var r=d.createRange();r.selectNodeContents(f);var s=getSelection();s.removeAllRanges();s.addRange(r);
  f.__orig=original;f.__sec=sec;
  f.addEventListener("keydown",onKey);f.addEventListener("blur",onBlur);
}
function onKey(e){var multi=/^(body|text|subheading)$/.test(editing.getAttribute("data-wb-field"));if(e.key==="Escape"){e.preventDefault();finish(false)}else if(e.key==="Enter"&&(!multi||e.metaKey||e.ctrlKey)){e.preventDefault();finish(true)}}
function onBlur(){finish(true)}
function finish(save){var f=editing;if(!f)return;editing=null;f.removeEventListener("keydown",onKey);f.removeEventListener("blur",onBlur);f.removeAttribute("contenteditable");
  var v=f.textContent.replace(/ /g," ").trim();if(!save){f.textContent=f.__orig;return}
  var field=f.getAttribute("data-wb-field");if(field==="text"||field==="body"||field==="subheading"||field==="heading"){v=v.replace(/^“|”$/g,"")}
  if(v!==f.__orig.trim())post({type:"edit",sectionId:f.__sec.getAttribute("data-wb-section"),field:field,itemId:f.getAttribute("data-wb-item"),value:v})}
window.addEventListener("message",function(e){
  if(e.source!==parent||!e.data||e.data.source!=="wb-editor")return;var m=e.data;
  if(m.type==="update"){
    var st=d.getElementById("wb-theme");if(st&&m.css!==undefined)st.textContent=m.css;
    if(m.fonts){var l=d.querySelector('link[rel=stylesheet][href*="fonts.googleapis"]');if(l&&l.href!==m.fonts)l.href=m.fonts}
    if(m.body!==undefined){var root=d.getElementById("wb-root");var y=scrollY;root.innerHTML=m.body;
      root.querySelectorAll(".wb-anim,.wb-stagger").forEach(function(x){x.classList.add("is-in")});
      if(window.__wbInit)window.__wbInit();scrollTo(0,y)}
    var id=selected&&selected.getAttribute("data-wb-section");selected=id?d.querySelector('[data-wb-section="'+id+'"]'):null;placeSel();
  }
  if(m.type==="select"){var s=m.sectionId?d.querySelector('[data-wb-section="'+m.sectionId+'"]'):null;selectEl(s,true);if(s&&m.scroll){var r=s.getBoundingClientRect();if(r.top<0||r.top>innerHeight*.6)s.scrollIntoView({behavior:"smooth",block:"start"})}}
});
// In the editor everything is visible immediately (no waiting for scroll reveals).
d.querySelectorAll(".wb-anim,.wb-stagger").forEach(function(x){x.classList.add("is-in")});
post({type:"ready"});
})();`;
