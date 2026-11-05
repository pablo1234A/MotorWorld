/**
 * Local generation engine. Deterministic for a given brief + seed, but every decision
 * (style, palette, type pairing, page plan, section variants, rhythm, imagery) is derived
 * from the brief analysis and a seeded RNG, so different briefs — and different seeds for
 * the same brief — produce genuinely different sites.
 *
 * When ANTHROPIC_API_KEY is configured, src/ai uses Claude Opus 5.5 instead and this engine
 * only supplies the structural baseline and the validation/autofix pass.
 */
import { artMedia, motifFor } from "./art";
import { analyzeBrief, type BriefAnalysis } from "./brief";
import { FORM_PRESETS, KB, type ItemSeed, type KindProfile, type PagePlan } from "./kb";
import type {
  AnimationPreset,
  Cta,
  FormField,
  Item,
  Page,
  ProjectKind,
  Section,
  SectionContent,
  SectionStyle,
  SectionType,
  SiteDocument,
  StyleId,
  Theme,
} from "./schema";
import { buildTheme, KIND_DEFAULTS, STYLES } from "./styles";
import { createRng, hashString, slugify, uid, type Rng } from "./util";
import { VARIANTS } from "./variants";

export interface GenerateOptions {
  brief: string;
  kind?: ProjectKind;
  style?: StyleId;
  mode?: "light" | "dark";
  seed?: number;
  name?: string;
  /** Extra page names requested in the wizard (matched against the kind's page plan). */
  pages?: string[];
}

const DEFAULT_OFFER: Record<ProjectKind, string> = {
  landing: "tu proyecto",
  store: "Piezas artesanales",
  saas: "gestión de operaciones",
  corporate: "consultoría estratégica",
  portfolio: "diseño",
  restaurant: "Cocina de temporada",
  dealership: "Coches de ocasión",
  webapp: "tus proyectos",
  dashboard: "tus métricas",
  education: "programación",
  experience3d: "tu producto",
  interactive: "tu historia",
};

interface Ctx {
  name: string;
  city: string | null;
  offer: string;
  audience: string;
  analysis: BriefAnalysis;
  theme: Theme;
  rng: Rng;
  kb: KindProfile;
  pages: PagePlan[];
  artIndex: number;
}

export function fill(template: string, ctx: Pick<Ctx, "name" | "city" | "offer" | "audience">): string {
  let s = template;
  if (!ctx.city) {
    s = s.replace(/\s(en|de|desde|in)\s\{city\}/g, "").replace(/\{city\}/g, "tu zona");
  }
  s = s
    .replace(/\{name\}/g, ctx.name)
    .replace(/\{city\}/g, ctx.city ?? "")
    .replace(/\{audience\}/g, ctx.audience)
    .replace(/\{offer\}/g, (_m, offset: number) => (offset === 0 ? ctx.offer : ctx.offer.charAt(0).toLowerCase() + ctx.offer.slice(1)));
  s = s.replace(/\s{2,}/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function seedItem(seed: ItemSeed, ctx: Ctx, extra: Partial<Item> = {}): Item {
  return {
    id: uid("it"),
    title: fill(seed.title, ctx),
    text: fill(seed.text, ctx),
    ...(seed.meta ? { meta: fill(seed.meta, ctx) } : {}),
    ...(seed.price ? { price: seed.price } : {}),
    ...(seed.badge ? { badge: seed.badge } : {}),
    ...(seed.icon ? { icon: seed.icon } : {}),
    ...(seed.features ? { features: seed.features.map((f) => fill(f, ctx)) } : {}),
    ...(seed.value !== undefined ? { value: seed.value } : {}),
    ...extra,
  };
}

function nextArt(ctx: Ctx, alt: string) {
  const i = ctx.artIndex++;
  const query = ctx.kb.imagery[i % ctx.kb.imagery.length];
  return artMedia(ctx.theme, hashString(ctx.name) + i * 7919, alt, query, motifFor(ctx.theme, i));
}

function pickVariant(type: SectionType, ctx: Ctx, prev?: string): string {
  const preferred = STYLES[ctx.theme.style].variants[type];
  const all = VARIANTS[type].map((v) => v.id);
  const pool = preferred && preferred.length ? [...preferred, ...all.filter((v) => !preferred.includes(v))] : all;
  // Weighted toward the style's preferences, never repeating the previous variant of the same type.
  const weighted = pool.flatMap((v, i) => Array(Math.max(1, pool.length - i)).fill(v) as string[]);
  const candidates = weighted.filter((v) => v !== prev);
  return ctx.rng.pick(candidates.length ? candidates : weighted);
}

function animationFor(type: SectionType, theme: Theme, rng: Rng): AnimationPreset {
  if (theme.motion === "none" || type === "navbar") return "none";
  if (type === "footer") return theme.motion === "subtle" ? "none" : "fade";
  if (theme.motion === "subtle") return rng.pick(["fade-up", "fade"] as const);
  if (["features", "products", "pricing", "gallery", "team", "stats", "menu"].includes(type)) return "stagger";
  if (theme.motion === "cinematic" && ["showcase", "hero", "cta"].includes(type)) return rng.pick(["cinematic", "reveal"] as const);
  if (type === "showcase") return rng.pick(["reveal", "parallax"] as const);
  return rng.pick(["fade-up", "reveal", "scale"] as const);
}

function anchorFor(type: SectionType): string | undefined {
  const map: Partial<Record<SectionType, string>> = {
    features: "servicios",
    steps: "como-funciona",
    pricing: "precios",
    products: "catalogo",
    menu: "carta",
    contact: "contacto",
    faq: "faq",
    gallery: "proyectos",
    newsletter: "newsletter",
    dashboard: "panel",
    showcase: "producto",
    scene3d: "explorar",
    team: "equipo",
    testimonials: "opiniones",
  };
  return map[type];
}

function navLinks(ctx: Ctx): Item[] {
  const links: Item[] = ctx.pages
    .filter((p) => p.path !== "/")
    .slice(0, 4)
    .map((p) => ({ id: uid("lk"), title: p.name, text: "", href: p.path }));
  if (links.length < 3) {
    const home = ctx.kb.home;
    const extras: Array<[SectionType, string]> = [
      ["features", "Servicios"],
      ["steps", "Cómo funciona"],
      ["pricing", "Precios"],
      ["products", "Catálogo"],
      ["menu", "Carta"],
      ["gallery", "Proyectos"],
      ["faq", "Preguntas"],
      ["testimonials", "Opiniones"],
    ];
    for (const [t, label] of extras) {
      if (links.length >= 4) break;
      const text = t === "gallery" && ctx.analysis.kind !== "portfolio" ? "Galería" : label;
      if (home.includes(t) && !links.some((l) => l.title.toLowerCase() === text.toLowerCase())) links.push({ id: uid("lk"), title: text, text: "", href: `/#${anchorFor(t)}` });
    }
  }
  return links;
}

function primaryCta(ctx: Ctx): Cta {
  const [label, href] = ctx.kb.hero.ctas[0];
  return { label, href: resolveHref(href, ctx), style: "primary" };
}

/** Points CTAs at pages/anchors that actually exist in this site. */
function resolveHref(href: string, ctx: Ctx): string {
  if (href.startsWith("#")) {
    const anchor = href.slice(1);
    const homeAnchors = ctx.kb.home.map(anchorFor).filter(Boolean);
    if (homeAnchors.includes(anchor)) return "/" + href;
    const page = ctx.pages.find((p) => p.sections.some((t) => anchorFor(t) === anchor));
    if (page) return `${page.path}#${anchor}`;
    return homeAnchors.includes("contacto") ? "/#contacto" : "/";
  }
  if (href.startsWith("/")) {
    const [path, hash] = href.split("#");
    if (ctx.pages.some((p) => p.path === path)) return href;
    const contact = ctx.pages.find((p) => p.sections.includes("contact"));
    return contact ? `${contact.path}#contacto` : hash ? `/#${hash}` : "/";
  }
  return href;
}

function form(kind: keyof typeof FORM_PRESETS, submitLabel: string, successMessage: string): SectionContent["form"] {
  return {
    id: uid("form"),
    fields: FORM_PRESETS[kind].map((f) => ({ ...f, options: "options" in f ? [...f.options] : undefined }) as FormField),
    submitLabel,
    successMessage,
  };
}

function buildContent(type: SectionType, ctx: Ctx, occurrence: number): { content: SectionContent; sample?: boolean; variant?: string; style?: Partial<SectionStyle> } {
  const { kb, rng, analysis } = ctx;
  const f = (s: string) => fill(s, ctx);
  switch (type) {
    case "navbar":
      return { content: { heading: ctx.name, items: navLinks(ctx), ctas: [primaryCta(ctx)] } };

    case "hero": {
      const ctas = kb.hero.ctas.map(([label, href], i) => ({ label, href: resolveHref(href, ctx), style: (i === 0 ? "primary" : "secondary") as Cta["style"] }));
      return {
        content: {
          eyebrow: f(rng.pick(kb.hero.eyebrow)),
          heading: f(rng.pick(kb.hero.heading)),
          subheading: f(rng.pick(kb.hero.sub)),
          ctas,
          image: nextArt(ctx, `${ctx.name}: ${kb.imagery[0]}`),
        },
      };
    }

    case "logos":
      return { content: { eyebrow: "Confían en nosotros", items: (kb.logos ?? []).map((l) => ({ id: uid("it"), title: l, text: "" })) }, sample: true };

    case "features": {
      let items = kb.features.items.map((s) => seedItem(s, ctx));
      if (analysis.offerings.length >= 3 && ["corporate", "landing", "saas"].includes(analysis.kind)) {
        items = analysis.offerings.slice(0, 6).map((o, i) => ({
          id: uid("it"),
          title: o,
          text: items[i % items.length]?.text ?? "",
          icon: items[i % items.length]?.icon,
        }));
      }
      return { content: { eyebrow: occurrence ? undefined : "Lo que hacemos", heading: f(rng.pick(kb.features.heading)), subheading: f(rng.pick(kb.features.sub)) || undefined, items } };
    }

    case "showcase": {
      const block = kb.showcase[occurrence % Math.max(1, kb.showcase.length)] ?? { eyebrow: "", heading: ctx.name, body: "" };
      return {
        content: {
          eyebrow: f(block.eyebrow),
          heading: f(block.heading),
          body: f(block.body),
          image: nextArt(ctx, f(block.heading)),
          ctas: occurrence === 0 ? [{ label: "Saber más", href: resolveHref("#contacto", ctx), style: "link" }] : undefined,
        },
      };
    }

    case "steps": {
      const s = kb.steps ?? KB.landing.steps!;
      return { content: { eyebrow: "Proceso", heading: f(s.heading), items: s.items.map((i) => seedItem(i, ctx)) } };
    }

    case "stats":
      return { content: { items: (kb.stats ?? KB.corporate.stats!).map((i) => seedItem(i, ctx)) }, sample: true };

    case "gallery": {
      const titles = analysis.offerings.length ? analysis.offerings : ["Proyecto Norte", "Casa Alba", "Serie Mar", "Estudio Luz", "Identidad Roble", "Edición Sal"];
      const items = titles.slice(0, 6).map((t, i) => ({ id: uid("it"), title: t, text: "", meta: String(2026 - Math.floor(i / 2)), image: nextArt(ctx, t) }));
      return { content: { eyebrow: "Trabajo seleccionado", heading: kb.label === "Portfolio" ? "Proyectos" : "Galería", items } };
    }

    case "testimonials":
      return { content: { eyebrow: "Opiniones", heading: rng.pick(["Lo que dicen quienes ya confían en nosotros", "Palabras de nuestros clientes"]), items: kb.testimonials.map((i) => seedItem(i, ctx)) }, sample: true };

    case "pricing":
      return {
        content: {
          eyebrow: "Precios",
          heading: rng.pick(["Precios claros, sin sorpresas", "Elige el plan que encaja contigo"]),
          subheading: "Puedes cambiar de plan o cancelar en cualquier momento.",
          items: (kb.pricing ?? KB.saas.pricing!).map((i) => seedItem(i, ctx, { href: resolveHref("/contacto", ctx) })),
        },
        sample: true,
      };

    case "products": {
      const seeds = kb.products ?? KB.store.products!;
      let items = seeds.map((s) => seedItem(s, ctx, { image: nextArt(ctx, f(s.title)) }));
      if (analysis.kind === "store" && analysis.offerings.length >= 2) {
        items = analysis.offerings.slice(0, 6).map((o, i) => ({ ...items[i % items.length], id: uid("it"), title: o, text: `${o} seleccionados por ${ctx.name}.`, image: nextArt(ctx, o) }));
      }
      const variant = analysis.kind === "dealership" ? "inventory" : analysis.kind === "education" ? "courses" : "grid";
      const heading = variant === "inventory" ? "Vehículos disponibles" : variant === "courses" ? "Cursos" : rng.pick(["Lo más buscado", "Novedades", "Colección"]);
      return { content: { eyebrow: variant === "inventory" ? "Inventario" : "Tienda", heading, subheading: variant === "inventory" ? "Todos revisados, con garantía y listos para entregar." : undefined, items }, sample: true, variant };
    }

    case "menu":
      return { content: { eyebrow: "La carta", heading: "Cocina de temporada", subheading: "La carta cambia con el mercado. Pregunta por los platos del día.", items: (kb.menu ?? KB.restaurant.menu!).map((i) => seedItem(i, ctx)), note: "IVA incluido. Consulta alérgenos con nuestro equipo." }, sample: true };

    case "team":
      return { content: { eyebrow: "Equipo", heading: "Las personas detrás de " + ctx.name, items: (kb.team ?? KB.corporate.team!).map((i) => seedItem(i, ctx, { image: nextArt(ctx, f(i.title)) })) }, sample: true };

    case "timeline":
      return { content: { eyebrow: "Trayectoria", heading: kb.label === "Portfolio" ? "Experiencia" : "Nuestra historia", items: (kb.timeline ?? KB.corporate.timeline!).map((i) => seedItem(i, ctx)) }, sample: true };

    case "faq":
      return { content: { eyebrow: "Preguntas frecuentes", heading: "Resolvemos tus dudas", items: (kb.faq.length ? kb.faq : KB.landing.faq).map((i) => seedItem(i, ctx)) } };

    case "cta":
      return {
        content: {
          heading: f(rng.pick(kb.cta.heading)),
          subheading: f(rng.pick(kb.cta.sub)) || undefined,
          ctas: [{ label: kb.cta.label, href: resolveHref(analysis.kind === "restaurant" ? "/reservas" : "#contacto", ctx), style: "primary" }],
        },
      };

    case "contact": {
      const c = kb.contact;
      const email = `hola@${slugify(ctx.name) || "tuempresa"}.com`;
      return {
        content: {
          eyebrow: "Contacto",
          heading: f(c.heading),
          subheading: f(c.sub) || undefined,
          form: form(c.fields, c.fields === "booking" ? "Solicitar reserva" : c.fields === "testdrive" ? "Reservar prueba" : c.fields === "enroll" ? "Reservar plaza" : "Enviar", "Gracias. Hemos recibido tu mensaje y te responderemos muy pronto."),
          items: [
            { id: uid("it"), title: "Email", text: email, icon: "mail", href: `mailto:${email}` },
            { id: uid("it"), title: "Teléfono", text: "+34 900 000 000", icon: "phone", href: "tel:+34900000000" },
            { id: uid("it"), title: "Dirección", text: ctx.city ? `Calle Mayor 1, ${ctx.city}` : "Calle Mayor 1", icon: "map" },
            ...(analysis.kind === "restaurant" ? [{ id: uid("it"), title: "Horario", text: "Mar–Dom · 13:00–16:00 y 20:00–23:30", icon: "clock" }] : []),
          ],
        },
        sample: true,
      };
    }

    case "newsletter":
      return {
        content: {
          heading: f(rng.pick(kb.cta.heading)),
          subheading: f(rng.pick(kb.cta.sub)) || "Un correo al mes. Sin spam.",
          form: { id: uid("form"), fields: [{ name: "email", label: "Email", type: "email", required: true, placeholder: "tu@email.com" }], submitLabel: kb.cta.label, successMessage: "¡Listo! Revisa tu bandeja de entrada." },
        },
      };

    case "marquee":
      return { content: { items: (kb.marquee ?? analysis.offerings.concat(["Diseño", "Detalle", "Calidad"])).map((t) => ({ id: uid("it"), title: t, text: "" })) } };

    case "dashboard":
      return {
        content: {
          eyebrow: "Panel",
          heading: "Todo bajo control en una pantalla",
          subheading: "Vista previa del panel con datos de ejemplo.",
          items: (kb.stats ?? KB.webapp.stats!).map((i) => seedItem(i, ctx)),
          body: Array.from({ length: 12 }, (_, i) => Math.round(40 + i * 4 + rng.next() * 18)).join(","),
        },
        sample: true,
      };

    case "scene3d":
      return {
        content: {
          eyebrow: f(rng.pick(kb.hero.eyebrow)),
          heading: f(rng.pick(kb.hero.heading)),
          subheading: f(rng.pick(kb.hero.sub)),
          ctas: kb.hero.ctas.map(([label, href], i) => ({ label, href: resolveHref(href, ctx), style: (i === 0 ? "primary" : "secondary") as Cta["style"] })),
        },
      };

    case "richtext":
      return { content: { heading: ctx.name, body: analysis.offerings.join(", ") } };

    case "custom":
      return { content: { html: "<p>Contenido personalizado</p>" } };

    case "footer": {
      const links = ctx.pages.map((p) => ({ id: uid("lk"), title: p.name, text: "", href: p.path }));
      return {
        content: {
          heading: ctx.name,
          body: f(rng.pick(kb.hero.sub)).split(". ")[0] + ".",
          items: links,
          note: `© ${new Date().getFullYear()} ${ctx.name}. Todos los derechos reservados.`,
        },
      };
    }
  }
}

/** Background rhythm: avoids monotony while keeping emphasis rare. */
function backgroundFor(type: SectionType, index: number, prevBg: SectionStyle["background"], theme: Theme, rng: Rng): SectionStyle["background"] {
  if (type === "navbar" || type === "hero" || type === "scene3d") return "default";
  if (type === "footer") return theme.mode === "dark" ? "surface" : "inverse";
  if (type === "cta") return prevBg === "primary" ? "inverse" : rng.pick(["primary", "inverse"] as const);
  if (type === "marquee" || type === "logos") return "default";
  if (["testimonials", "stats", "faq", "steps", "pricing"].includes(type)) return prevBg === "surface" ? "default" : "surface";
  return index % 3 === 0 && prevBg !== "surface" ? "surface" : "default";
}

function buildSections(types: SectionType[], ctx: Ctx, _isHome: boolean): Section[] {
  const out: Section[] = [];
  const occurrences: Partial<Record<SectionType, number>> = {};
  const lastVariant: Partial<Record<SectionType, string>> = {};
  let prevBg: SectionStyle["background"] = "default";
  types.forEach((type, index) => {
    const occ = occurrences[type] ?? 0;
    occurrences[type] = occ + 1;
    const built = buildContent(type, ctx, occ);
    const variant = built.variant ?? pickVariant(type, ctx, lastVariant[type]);
    lastVariant[type] = variant;
    const background = backgroundFor(type, index, prevBg, ctx.theme, ctx.rng);
    prevBg = background;
    const anchor = anchorFor(type);
    out.push({
      id: uid("sec"),
      type,
      variant,
      style: {
        background,
        padding: type === "navbar" ? "none" : type === "hero" || type === "scene3d" ? "xl" : type === "marquee" || type === "logos" ? "sm" : ctx.theme.density === "airy" ? "xl" : ctx.theme.density === "compact" ? "md" : "lg",
        align: ["cta", "newsletter"].includes(type) || (type === "hero" && ["centered", "poster"].includes(variant)) ? "center" : "start",
        width: type === "gallery" || type === "marquee" ? "wide" : type === "faq" || type === "richtext" ? "narrow" : "default",
        ...(anchor && !out.some((s) => s.style.anchor === anchor) ? { anchor } : {}),
        ...built.style,
      },
      animation: { preset: animationFor(type, ctx.theme, ctx.rng), delay: 0 },
      content: built.content,
      ...(built.sample ? { sample: true } : {}),
    });
  });
  return out;
}

function planPages(kb: KindProfile, analysis: BriefAnalysis, requested: string[] | undefined): PagePlan[] {
  const home: PagePlan = { name: "Inicio", path: "/", sections: [...kb.home] };
  // Needs-driven adjustments to the home plan.
  const ensure = (t: SectionType, beforeT: SectionType = "footer") => {
    if (!home.sections.includes(t)) home.sections.splice(Math.max(0, home.sections.indexOf(beforeT)), 0, t);
  };
  if (analysis.wants.pricing && !["restaurant", "dealership", "portfolio"].includes(analysis.kind)) ensure("pricing", home.sections.includes("faq") ? "faq" : home.sections.includes("cta") ? "cta" : "footer");
  if (analysis.wants.newsletter) ensure("newsletter");
  if (analysis.wants.team) ensure("team");
  if (analysis.wants.threeD && !home.sections.includes("scene3d")) home.sections[home.sections.indexOf("hero")] = "scene3d";
  if (!home.sections.includes("contact") && !home.sections.includes("newsletter") && !kb.pages.some((p) => p.sections.includes("contact"))) ensure("contact");

  const wanted = new Set([...(requested ?? []), ...analysis.pageHints].map((s) => s.toLowerCase()));
  const pages = kb.pages.filter((p, i) => i < 2 || wanted.has(p.name.toLowerCase()) || wanted.size === 0);
  // Requested pages that the kind doesn't define get a sensible generic page.
  for (const name of requested ?? []) {
    if (pages.some((p) => p.name.toLowerCase() === name.toLowerCase())) continue;
    const path = "/" + slugify(name);
    if (path === "/" || pages.some((p) => p.path === path)) continue;
    const generic: SectionType[] = /contact/i.test(name)
      ? ["navbar", "contact", "footer"]
      : /precio|pricing|plan/i.test(name)
        ? ["navbar", "pricing", "faq", "footer"]
        : /blog|noticia/i.test(name)
          ? ["navbar", "richtext", "newsletter", "footer"]
          : ["navbar", "showcase", "features", "cta", "footer"];
    pages.push({ name, path, sections: generic });
  }
  return [home, ...pages].slice(0, 8);
}

function seoFor(page: PagePlan, ctx: Ctx, sections: Section[]): Page["seo"] {
  const hero = sections.find((s) => s.type === "hero" || s.type === "scene3d") ?? sections.find((s) => s.content.heading && s.type !== "navbar");
  const title = page.path === "/" ? `${ctx.name} — ${(hero?.content.heading ?? ctx.kb.label).replace(/\.$/, "")}` : `${page.name} — ${ctx.name}`;
  const desc = (hero?.content.subheading ?? sections.find((s) => s.content.body)?.content.body ?? `${ctx.name}. ${ctx.kb.label}.`).slice(0, 158);
  return { title: title.slice(0, 70), description: desc, noindex: false };
}

export function generateSite(opts: GenerateOptions): SiteDocument {
  const analysis = analyzeBrief(opts.brief, opts.kind);
  const kind = opts.kind ?? analysis.kind;
  const seed = opts.seed ?? hashString(opts.brief + kind);
  const rng = createRng(seed);
  const kb = KB[kind];
  const style: StyleId = opts.style ?? analysis.styleHint ?? rng.pick(KIND_DEFAULTS[kind].styles);
  const def = STYLES[style];
  const mode = opts.mode ?? (analysis.wants.dark === true ? "dark" : analysis.wants.dark === false ? "light" : def.modes[0]);
  let theme = buildTheme({ style, kind, seed, mode });
  if (analysis.wants.animations === "none") theme = { ...theme, motion: "none" };
  else if (analysis.wants.animations === "rich" && theme.motion === "subtle") theme = { ...theme, motion: "expressive" };

  const name = opts.name?.trim() || analysis.name || rng.pick(kb.names);
  const pages = planPages(kb, { ...analysis, kind }, opts.pages);
  const ctx: Ctx = {
    name,
    city: analysis.city,
    offer: analysis.offerings[0] ?? DEFAULT_OFFER[kind],
    audience: analysis.audience ?? "equipos como el tuyo",
    analysis: { ...analysis, kind },
    theme,
    rng,
    kb,
    pages,
    artIndex: 0,
  };

  const docPages: Page[] = pages.map((p) => {
    const sections = buildSections(p.sections, ctx, p.path === "/");
    return { id: uid("pg"), name: p.name, path: p.path, seo: seoFor(p, ctx, sections), sections };
  });

  return {
    schemaVersion: 1,
    kind,
    brief: opts.brief.slice(0, 4000),
    settings: { siteName: name, lang: "es", notifyEmail: "", formWebhook: "", currency: "EUR" },
    theme,
    pages: docPages,
    library: [],
  };
}

/** Builds a single new section of a type for an existing document (used by editor + chat). */
export function createSection(doc: SiteDocument, type: SectionType, seed = Date.now()): Section {
  const kb = KB[doc.kind];
  const analysis = analyzeBrief(doc.brief, doc.kind);
  const ctx: Ctx = {
    name: doc.settings.siteName,
    city: analysis.city,
    offer: analysis.offerings[0] ?? DEFAULT_OFFER[doc.kind],
    audience: analysis.audience ?? "equipos como el tuyo",
    analysis,
    theme: doc.theme,
    rng: createRng(seed),
    kb,
    pages: doc.pages.map((p) => ({ name: p.name, path: p.path, sections: p.sections.map((s) => s.type) })),
    artIndex: seed % 97,
  };
  return buildSections([type], ctx, false)[0];
}
