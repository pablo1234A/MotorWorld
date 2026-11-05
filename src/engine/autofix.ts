/** Automatic fixer for issues flagged as `fixable` by the validator. Pure: returns a new document. */
import { createSection } from "./generate";
import type { Section, SiteDocument } from "./schema";
import { harmonizeTheme } from "./styles";
import { deepClone, ensureContrast, readableOn, slugify, uid } from "./util";
import { checkHref, collectAnchors, validateDocument, type QaReport } from "./validate";
import { isValidVariant, VARIANTS } from "./variants";

export interface AutofixResult {
  doc: SiteDocument;
  fixed: string[];
  before: QaReport;
  after: QaReport;
}

function fallbackHref(doc: SiteDocument): string {
  for (const p of doc.pages) {
    const c = p.sections.find((s) => s.type === "contact" && s.style.anchor);
    if (c) return `${p.path}#${c.style.anchor}`;
  }
  return "/";
}

export function sanitizeCustomHtml(html: string): string {
  return html
    .replace(/<\s*(script|iframe|object|embed|link|meta|base|form)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|iframe|object|embed|link|meta|base)[^>]*\/?>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1="#"');
}

export function autofix(input: SiteDocument): AutofixResult {
  const before = validateDocument(input);
  const doc = deepClone(input);
  const fixed: string[] = [];

  // Theme contrast
  const t0 = JSON.stringify(doc.theme.colors);
  doc.theme = harmonizeTheme(doc.theme);
  doc.theme.colors.primaryText = readableOn(doc.theme.colors.primary);
  doc.theme.colors.text = ensureContrast(doc.theme.colors.text, doc.theme.colors.surface, 4.5);
  if (JSON.stringify(doc.theme.colors) !== t0) fixed.push("Contraste de colores ajustado a WCAG AA.");

  // Home page and duplicate paths
  if (!doc.pages.some((p) => p.path === "/")) {
    doc.pages[0].path = "/";
    fixed.push("Primera página convertida en inicio (/).");
  }
  const seen = new Set<string>();
  for (const p of doc.pages) {
    if (seen.has(p.path)) {
      p.path = `/${slugify(p.name) || "pagina"}-${p.id.slice(-4)}`;
      fixed.push(`Ruta duplicada renombrada a ${p.path}.`);
    }
    seen.add(p.path);
  }

  for (const page of doc.pages) {
    // SEO
    const hero = page.sections.find((s) => s.type === "hero" || s.type === "scene3d") ?? page.sections.find((s) => s.content.heading && s.type !== "navbar");
    if (!page.seo.title.trim()) {
      page.seo.title = page.path === "/" ? `${doc.settings.siteName} — ${hero?.content.heading ?? ""}`.slice(0, 60) : `${page.name} — ${doc.settings.siteName}`.slice(0, 60);
      fixed.push(`Título SEO creado para «${page.name}».`);
    } else if (page.seo.title.length > 65) {
      page.seo.title = page.seo.title.slice(0, 57).replace(/\s+\S*$/, "") + "…";
      fixed.push(`Título SEO acortado en «${page.name}».`);
    }
    const desc = page.seo.description.trim();
    if (!desc || desc.length < 50 || desc.length > 165) {
      const source = [hero?.content.subheading, ...page.sections.map((s) => s.content.body || s.content.subheading)].filter(Boolean).join(" ");
      const text = (source || `${doc.settings.siteName}. ${page.name}.`).replace(/\s+/g, " ");
      page.seo.description = text.length > 158 ? text.slice(0, 155).replace(/\s+\S*$/, "") + "…" : text.length < 50 ? `${text} ${doc.settings.siteName}: información, contacto y más.`.slice(0, 158) : text;
      fixed.push(`Meta descripción ajustada en «${page.name}».`);
    }

    // Navigation/footer presence
    const home = doc.pages.find((p) => p.path === "/");
    if (!page.sections.some((s) => s.type === "navbar")) {
      const nav = home?.sections.find((s) => s.type === "navbar");
      page.sections.unshift(nav ? { ...deepClone(nav), id: uid("sec") } : createSection(doc, "navbar"));
      fixed.push(`Navegación añadida a «${page.name}».`);
    }
    if (!page.sections.some((s) => s.type === "footer")) {
      const foot = home?.sections.find((s) => s.type === "footer");
      page.sections.push(foot ? { ...deepClone(foot), id: uid("sec") } : createSection(doc, "footer"));
      fixed.push(`Pie de página añadido a «${page.name}».`);
    }
  }

  // Section-level fixes need anchors computed after structural fixes.
  const anchors = collectAnchors(doc);
  const fb = fallbackHref(doc);
  for (const page of doc.pages) {
    for (const s of page.sections) {
      if (!isValidVariant(s.type, s.variant)) {
        s.variant = VARIANTS[s.type][0].id;
        fixed.push(`Variante corregida en ${s.type}.`);
      }
      for (const c of s.content.ctas ?? []) {
        if (!c.label.trim()) c.label = "Saber más";
        if (checkHref(c.href, doc, page.path, anchors)) {
          c.href = fb;
          fixed.push(`Botón «${c.label}» redirigido a ${fb}.`);
        }
      }
      for (const it of s.content.items ?? []) {
        if (it.href !== undefined && checkHref(it.href, doc, page.path, anchors)) {
          it.href = s.type === "navbar" || s.type === "footer" ? "/" : fb;
          fixed.push(`Enlace «${it.title}» corregido.`);
        }
      }
      fixImages(s, fixed);
      if (s.content.form) {
        const names = new Set<string>();
        s.content.form.fields = s.content.form.fields.filter((f) => (names.has(f.name) ? false : (names.add(f.name), true)));
      } else if (s.type === "contact" || s.type === "newsletter") {
        s.content.form = createSection(doc, s.type).content.form;
        fixed.push(`Formulario añadido a ${s.type}.`);
      }
      if (s.type === "custom" && s.content.html) {
        const clean = sanitizeCustomHtml(s.content.html);
        if (clean !== s.content.html) {
          s.content.html = clean;
          fixed.push("HTML personalizado saneado (scripts y eventos eliminados).");
        }
      }
    }
  }

  return { doc, fixed: Array.from(new Set(fixed)), before, after: validateDocument(doc) };
}

function fixImages(s: Section, fixed: string[]) {
  const fallbackAlt = s.content.heading ?? s.content.eyebrow ?? "Imagen";
  const fix = (img: { alt: string } | undefined, alt: string) => {
    if (img && !img.alt?.trim()) {
      img.alt = alt;
      fixed.push("Texto alternativo añadido a imágenes.");
    }
  };
  fix(s.content.image, fallbackAlt);
  for (const m of s.content.media ?? []) fix(m, fallbackAlt);
  for (const it of s.content.items ?? []) fix(it.image, it.title || fallbackAlt);
}
