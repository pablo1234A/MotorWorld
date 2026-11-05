/** Section renderers: one function per section type, each handling its layout variants. */
import type { Cta, Item, Media, Page, Section, SiteDocument } from "@/engine/schema";
import { escapeAttr as a, escapeHtml as h } from "@/engine/util";
import { icon } from "./icons";

export type RenderMode = "edit" | "publish" | "export";

export interface RenderCtx {
  doc: SiteDocument;
  page: Page;
  mode: RenderMode;
  /** Maps an internal href ("/x#y") to the URL for this render target. */
  link: (href: string) => string;
  /** Maps an asset src (uploads) to the URL for this render target. */
  asset: (src: string) => string;
  /** Absolute endpoint that receives form submissions. */
  formAction: string;
  /** Endpoint for Stripe Checkout sessions (null when Stripe is not configured). */
  checkoutAction: string | null;
  projectId: string;
  h1Used: boolean;
  sectionIndex: number;
}

const ed = (ctx: RenderCtx, field: string, itemId?: string) =>
  ctx.mode === "edit" ? ` data-wb-field="${field}"${itemId ? ` data-wb-item="${a(itemId)}"` : ""}` : "";

function text(ctx: RenderCtx, tag: string, cls: string, value: string | undefined, field: string, itemId?: string): string {
  if (!value) return "";
  return `<${tag} class="${cls}"${ed(ctx, field, itemId)}>${h(value)}</${tag}>`;
}

function heading(ctx: RenderCtx, s: Section, level: 1 | 2 | 3, cls = ""): string {
  if (!s.content.heading) return "";
  // Exactly one <h1> per page: the first hero-like heading claims it.
  let lv: number = level;
  if (level === 1) {
    if (ctx.h1Used) lv = 2;
    else ctx.h1Used = true;
  }
  const size = level === 1 ? "wb-h1" : level === 2 ? "wb-h2" : "wb-h3";
  return `<h${lv} class="wb-h ${size} ${cls}"${ed(ctx, "heading")}>${h(s.content.heading)}</h${lv}>`;
}

function eyebrow(ctx: RenderCtx, s: Section) {
  return text(ctx, "p", "wb-eyebrow", s.content.eyebrow, "eyebrow");
}
function sub(ctx: RenderCtx, s: Section) {
  return text(ctx, "p", "wb-sub", s.content.subheading, "subheading");
}
function body(ctx: RenderCtx, s: Section) {
  return text(ctx, "p", "wb-body", s.content.body, "body");
}

function head(ctx: RenderCtx, s: Section, level: 2 | 3 = 2) {
  if (!s.content.heading && !s.content.eyebrow && !s.content.subheading) return "";
  return `<div class="wb-head">${eyebrow(ctx, s)}${heading(ctx, s, level)}${sub(ctx, s)}</div>`;
}

export function btn(ctx: RenderCtx, c: Cta, i = 0, extraCls = ""): string {
  const external = /^https?:\/\//.test(c.href);
  const arrow = c.style === "primary" || c.style === "link" ? icon("arrow", 16) : "";
  return `<a class="wb-btn wb-btn-${c.style} ${extraCls}" href="${a(ctx.link(c.href))}"${external ? ' target="_blank" rel="noopener"' : ""}${ed(ctx, `ctas.${i}.label`)}>${h(c.label)}${arrow}</a>`;
}

function ctas(ctx: RenderCtx, s: Section) {
  const list = s.content.ctas ?? [];
  if (!list.length) return "";
  return `<div class="wb-ctas">${list.map((c, i) => btn(ctx, c, i)).join("")}</div>`;
}

function img(ctx: RenderCtx, m: Media | undefined, cls = "", eager = false, field?: string, itemId?: string): string {
  if (!m?.src) return "";
  const src = m.kind === "generated" ? m.src : ctx.asset(m.src);
  const credit =
    m.credit && m.credit.provider !== "generated" && m.credit.provider !== "upload" && m.credit.name
      ? `<figcaption class="wb-credit">Foto: ${m.credit.url ? `<a href="${a(m.credit.url)}" target="_blank" rel="noopener">${h(m.credit.name)}</a>` : h(m.credit.name)} · ${m.credit.provider === "unsplash" ? "Unsplash" : "Pexels"}</figcaption>`
      : "";
  const attrs = ctx.mode === "edit" && field ? ` data-wb-media="${field}"${itemId ? ` data-wb-item="${a(itemId)}"` : ""}` : "";
  if (m.kind === "video") {
    return `<figure class="wb-media ${cls}"${attrs}><video src="${a(src)}" autoplay muted loop playsinline aria-label="${a(m.alt)}"></video>${credit}</figure>`;
  }
  return `<figure class="wb-media ${cls}"${attrs}><img src="${a(src)}" alt="${a(m.alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">${credit}</figure>`;
}

function stagger(s: Section) {
  return s.animation.preset === "stagger" ? " wb-stagger" : "";
}

export function formatPrice(ctx: RenderCtx, price: string | undefined): string {
  if (!price) return "";
  const n = Number(price.replace(",", "."));
  if (!Number.isFinite(n)) return h(price);
  if (n === 0) return ctx.doc.settings.lang === "en" ? "Free" : "Gratis";
  try {
    return new Intl.NumberFormat(ctx.doc.settings.lang, { style: "currency", currency: ctx.doc.settings.currency, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
  } catch {
    return `${n} ${ctx.doc.settings.currency}`;
  }
}

function initials(name: string) {
  return h(name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase());
}

function isCurrentLink(ctx: RenderCtx, href?: string) {
  return href === ctx.page.path ? ' aria-current="page"' : "";
}

// ───────────────────────────────── renderers ─────────────────────────────────

function navbar(ctx: RenderCtx, s: Section) {
  const links = (s.content.items ?? []).map((l) => `<li><a href="${a(ctx.link(l.href ?? "/"))}"${isCurrentLink(ctx, l.href)}${ed(ctx, "title", l.id)}>${h(l.title)}</a></li>`).join("");
  const hasStore = ctx.doc.pages.some((p) => p.sections.some((x) => x.type === "products" && x.variant === "grid"));
  const cart = hasStore ? `<button class="wb-icon-btn wb-cart-btn" type="button" data-wb-cart-open aria-label="Abrir carrito">${icon("cart", 18)}<span class="wb-cart-count" data-wb-cart-count hidden>0</span></button>` : "";
  const cta = s.content.ctas?.[0] ? btn(ctx, s.content.ctas[0], 0) : "";
  return `<a class="wb-skip" href="#wb-main">Saltar al contenido</a><nav class="wb-c" aria-label="Principal">
<a class="wb-logo" href="${a(ctx.link("/"))}"><span class="wb-logo-mark" aria-hidden="true"></span><span${ed(ctx, "heading")}>${h(s.content.heading ?? ctx.doc.settings.siteName)}</span></a>
<ul class="wb-links" id="wb-menu-${a(s.id)}">${links}</ul>
<div class="wb-nav-end">${cart}${cta}<button class="wb-burger" type="button" aria-expanded="false" aria-controls="wb-menu-${a(s.id)}" aria-label="Abrir menú" data-wb-burger>${icon("menu", 20)}</button></div>
</nav>`;
}

function hero(ctx: RenderCtx, s: Section) {
  const c = s.content;
  const media = img(ctx, c.image, "ar-hero", true, "image");
  switch (s.variant) {
    case "split":
      return `<div class="wb-c"><div>${eyebrow(ctx, s)}${heading(ctx, s, 1)}${sub(ctx, s)}${ctas(ctx, s)}</div>${media}</div>`;
    case "editorial":
      return `<div class="wb-c">${eyebrow(ctx, s)}${heading(ctx, s, 1)}<div class="wb-hero-grid">${img(ctx, c.image, "", true, "image")}<div class="wb-hero-aside">${sub(ctx, s)}${ctas(ctx, s)}</div></div></div>`;
    case "fullbleed":
      return `<div class="wb-hero-bg" style="--ov:${s.style.overlay ?? 0.25}">${c.image ? `<img src="${a(c.image.kind === "generated" ? c.image.src : ctx.asset(c.image.src))}" alt="${a(c.image.alt)}" fetchpriority="high"${ctx.mode === "edit" ? ' data-wb-media="image"' : ""}>` : ""}</div><div class="wb-c">${eyebrow(ctx, s)}${heading(ctx, s, 1)}${sub(ctx, s)}${ctas(ctx, s)}</div>`;
    case "product":
      return `<div class="wb-c">${eyebrow(ctx, s)}${heading(ctx, s, 1)}${sub(ctx, s)}${ctas(ctx, s)}<div class="wb-device"><div class="wb-device-bar" aria-hidden="true"><i></i><i></i><i></i></div>${img(ctx, c.image, "", true, "image")}</div></div>`;
    case "poster":
      return `<div class="wb-c">${eyebrow(ctx, s)}${heading(ctx, s, 1)}<div class="wb-poster-row"><div>${sub(ctx, s)}</div><div>${ctas(ctx, s)}</div></div>${img(ctx, c.image, "", true, "image")}</div>`;
    default:
      return `<div class="wb-c">${eyebrow(ctx, s)}${heading(ctx, s, 1)}${sub(ctx, s)}${ctas(ctx, s)}<div class="wb-hero-media">${media}</div></div>`;
  }
}

function logos(ctx: RenderCtx, s: Section) {
  const words = (s.content.items ?? []).map((i) => `<span class="wb-logo-word"${ed(ctx, "title", i.id)}>${h(i.title)}</span>`).join("");
  const label = s.content.eyebrow ? `<p class="wb-eyebrow" style="margin-bottom:2rem"${ed(ctx, "eyebrow")}>${h(s.content.eyebrow)}</p>` : "";
  if (s.variant === "marquee")
    return `<div class="wb-c">${label}</div><div class="wb-marquee-wrap"><div class="wb-marquee-track" style="--dur:30s">${words}${words.replace(/data-wb-[a-z]+="[^"]*"/g, "")}</div></div>`;
  return `<div class="wb-c">${label}<div class="wb-logo-row">${words}</div></div>`;
}

function features(ctx: RenderCtx, s: Section) {
  const items = s.content.items ?? [];
  if (s.variant === "list") {
    const rows = items
      .map((it, i) => `<div class="wb-feature-row"><span class="wb-num">${String(i + 1).padStart(2, "0")}</span><h3 class="wb-h wb-h4"${ed(ctx, "title", it.id)}>${h(it.title)}</h3><p${ed(ctx, "text", it.id)}>${h(it.text)}</p></div>`)
      .join("");
    return `<div class="wb-c">${head(ctx, s)}<div class="${stagger(s).trim()}">${rows}</div></div>`;
  }
  const cards = items
    .map((it) => `<article class="wb-card wb-card-hover">${it.icon ? `<div class="wb-ic">${icon(it.icon, 20)}</div>` : ""}<h3 class="wb-h wb-h4"${ed(ctx, "title", it.id)}>${h(it.title)}</h3><p${ed(ctx, "text", it.id)}>${h(it.text)}</p></article>`)
    .join("");
  return `<div class="wb-c">${head(ctx, s)}<div class="wb-grid${stagger(s)}">${cards}</div></div>`;
}

function showcase(ctx: RenderCtx, s: Section) {
  const copy = `<div>${eyebrow(ctx, s)}${heading(ctx, s, 2)}${body(ctx, s)}${ctas(ctx, s)}</div>`;
  return `<div class="wb-c"><div class="wb-split">${img(ctx, s.content.image, "", false, "image")}${copy}</div></div>`;
}

function steps(ctx: RenderCtx, s: Section) {
  const items = s.content.items ?? [];
  const list = items
    .map((it, i) => `<div class="wb-step"><span class="wb-step-n" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span><h3 class="wb-h wb-h4"${ed(ctx, "title", it.id)}>${h(it.title)}</h3><p${ed(ctx, "text", it.id)}>${h(it.text)}</p></div>`)
    .join("");
  if (s.variant === "rail") return `<div class="wb-c" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:3rem">${head(ctx, s)}<div class="wb-rail" data-wb-progress><span class="wb-rail-fill" aria-hidden="true"></span>${list}</div></div>`;
  return `<div class="wb-c">${head(ctx, s)}<div class="wb-grid${stagger(s)}">${list}</div></div>`;
}

function stats(ctx: RenderCtx, s: Section) {
  const items = (s.content.items ?? [])
    .map((it) => {
      const counter = it.value !== undefined && ctx.mode !== "edit" ? ` data-wb-count="${it.value}"` : "";
      const inner = `<span class="wb-stat-v"${counter}${ed(ctx, "title", it.id)}>${h(it.title)}</span><span class="wb-stat-l"${ed(ctx, "text", it.id)}>${h(it.text)}</span>`;
      return s.variant === "cards" ? `<div class="wb-card wb-stat">${inner}</div>` : `<div class="wb-stat">${inner}</div>`;
    })
    .join("");
  return `<div class="wb-c">${head(ctx, s)}<div class="wb-grid${stagger(s)}">${items}</div></div>`;
}

function gallery(ctx: RenderCtx, s: Section) {
  const tiles = (s.content.items ?? [])
    .map((it) => {
      const inner = `${img(ctx, it.image, "", false, "image", it.id)}<div class="wb-tile-meta"><span${ed(ctx, "title", it.id)}>${h(it.title)}</span><span${ed(ctx, "meta", it.id)}>${h(it.meta)}</span></div>`;
      return it.href ? `<a class="wb-tile" href="${a(ctx.link(it.href))}">${inner}</a>` : `<div class="wb-tile">${inner}</div>`;
    })
    .join("");
  const wrap = s.variant === "masonry" ? "wb-masonry" : s.variant === "scroller" ? "wb-scroller" : "wb-grid";
  return `<div class="wb-c">${head(ctx, s)}<div class="${wrap}${stagger(s)}">${tiles}</div></div>`;
}

function quote(ctx: RenderCtx, it: Item, card = true) {
  return `<figure class="wb-quote${card ? " wb-card" : ""}"><blockquote${ed(ctx, "text", it.id)}>“${h(it.text)}”</blockquote><figcaption><span class="wb-avatar" aria-hidden="true">${initials(it.title)}</span><div><strong${ed(ctx, "title", it.id)}>${h(it.title)}</strong><span${ed(ctx, "meta", it.id)}>${h(it.meta)}</span></div></figcaption></figure>`;
}

function testimonials(ctx: RenderCtx, s: Section) {
  const items = s.content.items ?? [];
  if (s.variant === "single" && items.length) {
    const [first, ...rest] = items;
    return `<div class="wb-c">${eyebrow(ctx, s)}${quote(ctx, first, false)}${rest.length ? `<div class="wb-quote-more">${rest.map((i) => quote(ctx, i, false)).join("")}</div>` : ""}</div>`;
  }
  if (s.variant === "marquee") {
    const cards = items.map((i) => quote(ctx, i)).join("");
    return `<div class="wb-c">${head(ctx, s)}</div><div class="wb-marquee-wrap"><div class="wb-marquee-track" style="--dur:55s">${cards}${cards.replace(/data-wb-[a-z]+="[^"]*"/g, "")}</div></div>`;
  }
  return `<div class="wb-c">${head(ctx, s)}<div class="wb-grid${stagger(s)}">${items.map((i) => quote(ctx, i)).join("")}</div></div>`;
}

function pricing(ctx: RenderCtx, s: Section) {
  const plans = (s.content.items ?? [])
    .map((it) => {
      const featured = !!it.badge;
      const price = formatPrice(ctx, it.price);
      const buy = it.checkout?.paymentLink ?? it.href ?? "/";
      return `<article class="wb-card wb-plan${featured ? " is-featured" : ""}">${it.badge ? `<span class="wb-plan-badge"${ed(ctx, "badge", it.id)}>${h(it.badge)}</span>` : ""}
<div><h3 class="wb-h wb-h4"${ed(ctx, "title", it.id)}>${h(it.title)}</h3><p style="margin:.35rem 0 0;color:var(--c-muted)"${ed(ctx, "text", it.id)}>${h(it.text)}</p></div>
<div class="wb-price"><span${ed(ctx, "price", it.id)}>${price}</span>${it.meta ? `<small${ed(ctx, "meta", it.id)}>${h(it.meta)}</small>` : ""}</div>
${it.features?.length ? `<ul class="wb-checks">${it.features.map((f) => `<li>${icon("check", 18)}<span>${h(f)}</span></li>`).join("")}</ul>` : ""}
${btn(ctx, { label: Number(it.price) === 0 ? "Empezar gratis" : /^\d/.test(it.price ?? "") ? "Elegir plan" : "Contactar", href: buy, style: featured ? "primary" : "secondary" })}</article>`;
    })
    .join("");
  return `<div class="wb-c">${head(ctx, s)}<div class="wb-grid${stagger(s)}">${plans}</div></div>`;
}

function products(ctx: RenderCtx, s: Section) {
  const items = s.content.items ?? [];
  const canBuy = (it: Item) => !!(it.price && Number.isFinite(Number(it.price)));
  const buyAttrs = (it: Item) =>
    `data-wb-add data-id="${a(it.id)}" data-name="${a(it.title)}" data-price="${a(it.price ?? "")}"${it.checkout?.paymentLink ? ` data-link="${a(it.checkout.paymentLink)}"` : ""}${it.checkout?.priceId ? ` data-price-id="${a(it.checkout.priceId)}"` : ""}`;

  if (s.variant === "inventory") {
    const fuels = Array.from(new Set(items.map((i) => i.features?.[2]).filter(Boolean))) as string[];
    const filters = fuels.length > 1 ? `<div class="wb-filters" role="group" aria-label="Filtrar por combustible"><button class="wb-chip" type="button" aria-pressed="true" data-wb-filter="*">Todos</button>${fuels.map((f) => `<button class="wb-chip" type="button" aria-pressed="false" data-wb-filter="${a(f)}">${h(f)}</button>`).join("")}</div>` : "";
    const cards = items
      .map((it) => `<article class="wb-product" data-wb-tag="${a(it.features?.[2] ?? "")}"><div style="position:relative">${it.badge ? `<span class="wb-badge"${ed(ctx, "badge", it.id)}>${h(it.badge)}</span>` : ""}${img(ctx, it.image, "", false, "image", it.id)}</div>
<div class="wb-product-body"><div class="wb-product-info"><div><h3${ed(ctx, "title", it.id)}>${h(it.title)}</h3><p${ed(ctx, "meta", it.id)}>${h(it.meta)}</p></div></div>
${it.features?.length ? `<div class="wb-specs">${it.features.slice(0, 4).map((f) => `<span>${h(f)}</span>`).join("")}</div>` : ""}
<div class="wb-product-info" style="align-items:center"><span class="wb-product-price"${ed(ctx, "price", it.id)}>${formatPrice(ctx, it.price)}</span>${btn(ctx, { label: "Me interesa", href: it.href ?? contactHref(ctx), style: "secondary" })}</div></div></article>`)
      .join("");
    return `<div class="wb-c"><div class="wb-head-row">${head(ctx, s)}</div>${filters}<div class="wb-grid${stagger(s)}">${cards}</div></div>`;
  }

  if (s.variant === "courses") {
    const cards = items
      .map((it) => `<article class="wb-product">${it.meta ? `<span class="wb-level"${ed(ctx, "meta", it.id)}>${h(it.meta)}</span>` : ""}<div><h3 class="wb-h wb-h3"${ed(ctx, "title", it.id)}>${h(it.title)}</h3><p style="margin:.5rem 0 0;color:var(--c-muted)"${ed(ctx, "text", it.id)}>${h(it.text)}</p></div>
${it.features?.length ? `<ul class="wb-checks">${it.features.map((f) => `<li>${icon("check", 18)}<span>${h(f)}</span></li>`).join("")}</ul>` : ""}
<div class="wb-product-info" style="align-items:center;margin-top:auto"><span class="wb-product-price" style="font-size:1.4rem"${ed(ctx, "price", it.id)}>${formatPrice(ctx, it.price)}</span>${canBuy(it) ? `<button class="wb-btn wb-btn-primary" type="button" ${buyAttrs(it)}>Inscribirme</button>` : ""}</div></article>`)
      .join("");
    return `<div class="wb-c">${head(ctx, s)}<div class="wb-grid${stagger(s)}">${cards}</div></div>`;
  }

  const cards = items
    .map((it) => `<article class="wb-product"><div style="position:relative">${it.badge ? `<span class="wb-badge"${ed(ctx, "badge", it.id)}>${h(it.badge)}</span>` : ""}${img(ctx, it.image, "", false, "image", it.id)}</div>
<div class="wb-product-info"><div><h3${ed(ctx, "title", it.id)}>${h(it.title)}</h3><p${ed(ctx, "text", it.id)}>${h(it.text)}</p></div><span class="wb-product-price"${ed(ctx, "price", it.id)}>${formatPrice(ctx, it.price)}</span></div>
${canBuy(it) ? `<button class="wb-btn wb-btn-secondary wb-add" type="button" ${buyAttrs(it)}>${icon("plus", 16)}Añadir al carrito</button>` : ""}</article>`)
    .join("");
  return `<div class="wb-c"><div class="wb-head-row">${head(ctx, s)}</div><div class="wb-grid${stagger(s)}">${cards}</div></div>`;
}

function contactHref(ctx: RenderCtx) {
  for (const p of ctx.doc.pages) {
    const c = p.sections.find((s) => s.type === "contact" && s.style.anchor);
    if (c) return `${p.path}#${c.style.anchor}`;
  }
  return "/";
}

function menu(ctx: RenderCtx, s: Section) {
  const groups = new Map<string, Item[]>();
  for (const it of s.content.items ?? []) {
    const k = it.meta || "Carta";
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }
  const html = Array.from(groups.entries())
    .map(([cat, items]) => `<div><h3 class="wb-menu-cat">${h(cat)}</h3>${items.map((it) => `<div class="wb-dish"><h3${ed(ctx, "title", it.id)}>${h(it.title)}</h3><span class="wb-dish-price"${ed(ctx, "price", it.id)}>${formatPrice(ctx, it.price)}</span><p${ed(ctx, "text", it.id)}>${h(it.text)}</p></div>`).join("")}</div>`)
    .join("");
  return `<div class="wb-c">${head(ctx, s)}<div class="wb-menu-groups">${html}</div>${s.content.note ? `<p class="wb-menu-note"${ed(ctx, "note")}>${h(s.content.note)}</p>` : ""}</div>`;
}

function team(ctx: RenderCtx, s: Section) {
  const people = (s.content.items ?? [])
    .map((it) => `<article class="wb-person">${img(ctx, it.image, "", false, "image", it.id)}<h3${ed(ctx, "title", it.id)}>${h(it.title)}</h3><span${ed(ctx, "meta", it.id)}>${h(it.meta)}</span><p${ed(ctx, "text", it.id)}>${h(it.text)}</p></article>`)
    .join("");
  return `<div class="wb-c">${head(ctx, s)}<div class="wb-grid${stagger(s)}">${people}</div></div>`;
}

function timeline(ctx: RenderCtx, s: Section) {
  const items = (s.content.items ?? [])
    .map((it) => `<div class="wb-tl-item"><time${ed(ctx, "meta", it.id)}>${h(it.meta)}</time><div><h3 class="wb-h wb-h4"${ed(ctx, "title", it.id)}>${h(it.title)}</h3><p${ed(ctx, "text", it.id)}>${h(it.text)}</p></div></div>`)
    .join("");
  return `<div class="wb-c">${head(ctx, s)}<div class="wb-tl">${items}</div></div>`;
}

function faq(ctx: RenderCtx, s: Section) {
  const items = (s.content.items ?? [])
    .map((it, i) => `<details${i === 0 ? " open" : ""}><summary><span${ed(ctx, "title", it.id)}>${h(it.title)}</span>${icon("plus", 20)}</summary><div class="wb-faq-a"${ed(ctx, "text", it.id)}>${h(it.text)}</div></details>`)
    .join("");
  // FAQPage structured data for rich results.
  const ld = ctx.mode === "edit" ? "" : `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: (s.content.items ?? []).map((i) => ({ "@type": "Question", name: i.title, acceptedAnswer: { "@type": "Answer", text: i.text } })) }).replace(/</g, "\\u003c")}</script>`;
  return `<div class="wb-c">${head(ctx, s)}<div class="wb-faq-list">${items}</div></div>${ld}`;
}

function cta(ctx: RenderCtx, s: Section) {
  if (s.variant === "big") return `<div class="wb-c">${eyebrow(ctx, s)}${heading(ctx, s, 2)}${sub(ctx, s)}${ctas(ctx, s)}</div>`;
  return `<div class="wb-c"><div class="wb-cta-box"><div>${eyebrow(ctx, s)}${heading(ctx, s, 2)}${sub(ctx, s)}</div>${ctas(ctx, s)}</div></div>`;
}

export function renderForm(ctx: RenderCtx, s: Section, compact = false): string {
  const f = s.content.form;
  if (!f) return "";
  const id = (n: string) => `f-${s.id}-${n}`;
  const field = (fl: (typeof f.fields)[number]) => {
    const req = fl.required ? " required" : "";
    const label = `<label for="${a(id(fl.name))}">${h(fl.label)}${fl.required ? '<span class="req" aria-hidden="true">*</span>' : ""}</label>`;
    const ph = fl.placeholder ? ` placeholder="${a(fl.placeholder)}"` : "";
    const common = `id="${a(id(fl.name))}" name="${a(fl.name)}" class="wb-input"${req}${ph}`;
    if (fl.type === "textarea") return `<div class="wb-field">${label}<textarea ${common} maxlength="4000"></textarea></div>`;
    if (fl.type === "select") return `<div class="wb-field">${label}<select ${common}><option value="">Selecciona…</option>${(fl.options ?? []).map((o) => `<option>${h(o)}</option>`).join("")}</select></div>`;
    if (fl.type === "checkbox") return `<label class="wb-check"><input type="checkbox" name="${a(fl.name)}" value="sí"${req}> ${h(fl.label)}</label>`;
    const auto = fl.type === "email" ? ' autocomplete="email" inputmode="email"' : fl.type === "tel" ? ' autocomplete="tel" inputmode="tel"' : fl.name === "nombre" ? ' autocomplete="name"' : "";
    return `<div class="wb-field">${label}<input type="${fl.type}" ${common}${auto} maxlength="300"></div>`;
  };
  const hp = `<div class="wb-hp" aria-hidden="true"><label>No rellenar<input type="text" name="_gotcha" tabindex="-1" autocomplete="off"></label></div>`;
  const meta = `<input type="hidden" name="_form" value="${a(f.id)}"><input type="hidden" name="_page" value="${a(ctx.page.path)}">`;
  const submit = `<button class="wb-btn wb-btn-primary" type="submit"${ed(ctx, "form.submitLabel")}>${h(f.submitLabel)}</button>`;
  const msg = `<p class="wb-form-msg" role="status" aria-live="polite" data-ok="${a(f.successMessage)}"></p>`;
  if (compact) {
    const fl = f.fields[0];
    return `<form class="wb-news-form" method="post" action="${a(ctx.formAction)}" data-wb-form novalidate>${meta}${hp}<label class="wb-sr" for="${a(id(fl.name))}">${h(fl.label)}</label><input id="${a(id(fl.name))}" type="${fl.type}" name="${a(fl.name)}" class="wb-input" required placeholder="${a(fl.placeholder ?? fl.label)}" autocomplete="email">${submit}${msg}</form>`;
  }
  // Pair short fields on one row for a calmer layout.
  const rows: string[] = [];
  const short = (t: string) => ["text", "email", "tel", "date", "number"].includes(t);
  for (let i = 0; i < f.fields.length; i++) {
    const cur = f.fields[i];
    const next = f.fields[i + 1];
    if (next && short(cur.type) && short(next.type)) {
      rows.push(`<div class="wb-form-row">${field(cur)}${field(next)}</div>`);
      i++;
    } else rows.push(field(cur));
  }
  return `<form class="wb-form" method="post" action="${a(ctx.formAction)}" data-wb-form novalidate>${meta}${hp}${rows.join("")}${submit}${msg}</form>`;
}

function contact(ctx: RenderCtx, s: Section) {
  const details = (s.content.items ?? [])
    .map((it) => `<li>${icon(it.icon ?? "map", 20)}<div><strong${ed(ctx, "title", it.id)}>${h(it.title)}</strong>${it.href ? `<a href="${a(it.href)}"${ed(ctx, "text", it.id)}>${h(it.text)}</a>` : `<span${ed(ctx, "text", it.id)}>${h(it.text)}</span>`}</div></li>`)
    .join("");
  if (s.variant === "centered") return `<div class="wb-c">${head(ctx, s)}<div class="wb-form-card">${renderForm(ctx, s)}</div></div>`;
  return `<div class="wb-c"><div>${head(ctx, s)}${details ? `<ul class="wb-contact-list">${details}</ul>` : ""}</div><div class="wb-form-card">${renderForm(ctx, s)}</div></div>`;
}

function newsletter(ctx: RenderCtx, s: Section) {
  return `<div class="wb-c">${head(ctx, s)}${renderForm(ctx, s, true)}</div>`;
}

function richtext(ctx: RenderCtx, s: Section) {
  return `<div class="wb-c"><div class="wb-prose">${eyebrow(ctx, s)}${heading(ctx, s, 2)}${s.content.body ? `<p${ed(ctx, "body")}>${h(s.content.body)}</p>` : ""}</div></div>`;
}

function marquee(ctx: RenderCtx, s: Section) {
  const words = (s.content.items ?? []).map((i) => `<span class="wb-marquee-word">${h(i.title)}</span>`).join("");
  return `<div class="wb-marquee-wrap" aria-hidden="true"><div class="wb-marquee-track">${words}${words}</div></div><p class="wb-sr">${h((s.content.items ?? []).map((i) => i.title).join(", "))}</p>`;
}

function chart(values: number[]) {
  const w = 720;
  const hh = 220;
  const max = Math.max(...values, 1) * 1.1;
  const step = w / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => [i * step, hh - (v / max) * hh] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w} ${hh} L0 ${hh} Z`;
  const grid = [0.25, 0.5, 0.75].map((g) => `<line class="gr" x1="0" x2="${w}" y1="${hh * g}" y2="${hh * g}"/>`).join("");
  const months = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  const labels = values.map((_, i) => `<text x="${i * step}" y="${hh + 18}" text-anchor="${i === 0 ? "start" : i === values.length - 1 ? "end" : "middle"}">${months[i % 12]}</text>`).join("");
  return `<svg viewBox="0 -6 ${w} ${hh + 30}" role="img" aria-label="Evolución mensual">${grid}<path class="ar" d="${area}"/><path class="ln" d="${line}" pathLength="1" data-wb-draw/>${labels}</svg>`;
}

function dashboard(ctx: RenderCtx, s: Section) {
  const kpis = (s.content.items ?? [])
    .slice(0, 4)
    .map((it, i) => `<div class="wb-kpi"><span${ed(ctx, "text", it.id)}>${h(it.text)}</span><strong${ed(ctx, "title", it.id)}>${h(it.title)}</strong><em>${["+12,4 %", "+3,1 %", "+8,7 %", "-1,2 %"][i]}</em></div>`)
    .join("");
  const series = (s.content.body ?? "").split(",").map((n) => Number(n.trim())).filter((n) => Number.isFinite(n));
  return `<div class="wb-c">${head(ctx, s)}<div class="wb-dash"><div class="wb-dash-top"><strong>${h(ctx.doc.settings.siteName)}</strong><div class="wb-pills"><span>7 d</span><span class="is-on">30 d</span><span>12 m</span></div></div><div class="wb-kpis">${kpis}</div><div class="wb-chart">${series.length > 1 ? chart(series) : ""}</div></div></div>`;
}

function scene3d(ctx: RenderCtx, s: Section) {
  const vendor = ctx.asset("/vendor/three.module.js");
  return `<div class="wb-scene-fallback" aria-hidden="true"></div><canvas class="wb-gl" data-wb-scene="${a(s.variant)}" data-three="${a(vendor)}" aria-hidden="true"></canvas><div class="wb-c">${eyebrow(ctx, s)}${heading(ctx, s, 1)}${sub(ctx, s)}${ctas(ctx, s)}</div><span class="wb-scene-hint" aria-hidden="true">Mueve el cursor</span>`;
}

function custom(ctx: RenderCtx, s: Section) {
  // Stored HTML is sanitized by autofix on every save (no scripts, no event handlers).
  return `<div class="wb-c wb-custom"${ed(ctx, "html")}>${s.content.html ?? ""}</div>`;
}

function footer(ctx: RenderCtx, s: Section) {
  const links = (s.content.items ?? []).map((l) => `<li><a href="${a(ctx.link(l.href ?? "/"))}"${ed(ctx, "title", l.id)}>${h(l.title)}</a></li>`).join("");
  const base = `<div class="wb-foot-base"><span${ed(ctx, "note")}>${h(s.content.note)}</span><span>Hecho con World Builder AI</span></div>`;
  if (s.variant === "minimal")
    return `<div class="wb-c"><div class="wb-foot"><a class="wb-logo" href="${a(ctx.link("/"))}"><span class="wb-logo-mark" aria-hidden="true"></span><span${ed(ctx, "heading")}>${h(s.content.heading)}</span></a><ul class="wb-foot-links">${links}</ul></div>${base}</div>`;
  const big = s.variant === "big" ? `<div class="wb-bigmark" aria-hidden="true">${h(s.content.heading)}</div>` : "";
  return `<div class="wb-c"><div class="wb-foot"><div><a class="wb-logo" href="${a(ctx.link("/"))}"><span class="wb-logo-mark" aria-hidden="true"></span><span${ed(ctx, "heading")}>${h(s.content.heading)}</span></a>${s.content.body ? `<p${ed(ctx, "body")}>${h(s.content.body)}</p>` : ""}</div><ul class="wb-foot-links">${links}</ul></div>${big}${base}</div>`;
}

const RENDERERS: Record<Section["type"], (ctx: RenderCtx, s: Section) => string> = {
  navbar,
  hero,
  logos,
  features,
  showcase,
  steps,
  stats,
  gallery,
  testimonials,
  pricing,
  products,
  menu,
  team,
  timeline,
  faq,
  cta,
  contact,
  newsletter,
  richtext,
  marquee,
  dashboard,
  scene3d,
  custom,
  footer,
};

export function renderSection(ctx: RenderCtx, s: Section): string {
  const tag = s.type === "navbar" ? "header" : s.type === "footer" ? "footer" : "section";
  const classes = [
    "wb-s",
    `wb-${s.type}`,
    `wb-${s.type}-${s.variant}`,
    `bg-${s.style.background}`,
    `pad-${s.style.padding}`,
    `al-${s.style.align}`,
    `w-${s.style.width}`,
    s.type === "navbar" ? "wb-nav" : "",
    s.type === "navbar" ? `wb-nav-${s.variant}` : "",
    s.type === "newsletter" ? `wb-news-${s.variant}` : "",
    s.type === "showcase" && ctx.sectionIndex % 2 === 1 ? "is-flipped" : "",
    s.hidden?.desktop ? "hide-desktop" : "",
    s.hidden?.tablet ? "hide-tablet" : "",
    s.hidden?.mobile ? "hide-mobile" : "",
  ].filter(Boolean);
  const preset = s.animation.preset;
  const animated = preset !== "none" && preset !== "stagger" && s.type !== "navbar" && ctx.doc.theme.motion !== "none";
  const animAttrs = animated ? ` data-anim="${preset === "cinematic" || preset === "parallax" ? "fade-up" : preset}"` : "";
  const extra = [
    s.style.anchor ? ` id="${a(s.style.anchor)}"` : "",
    ctx.mode === "edit" ? ` data-wb-section="${a(s.id)}" data-wb-type="${s.type}"` : "",
    preset === "stagger" && ctx.doc.theme.motion !== "none" ? ' data-wb-stagger' : "",
    preset === "cinematic" ? ' data-wb-cinematic' : "",
    preset === "parallax" ? ' data-wb-parallax' : "",
    s.type !== "navbar" && s.type !== "footer" && s.content.heading ? ` aria-label="${a(s.content.heading.slice(0, 80))}"` : "",
  ].join("");
  let inner = RENDERERS[s.type](ctx, s);
  // Entrance animations go on the content container, never the section, so backgrounds and
  // absolutely positioned layers (full-bleed images, WebGL canvas) never move.
  if (animated) inner = inner.replace('<div class="wb-c', `<div${animAttrs} class="wb-anim wb-c`);
  return `<${tag} class="${classes.join(" ")}"${extra}>${inner}</${tag}>`;
}
