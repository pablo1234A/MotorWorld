/**
 * Static QA. Runs on every generation, every AI edit and before publishing.
 * Each issue says where it is, why it matters and whether autofix can resolve it.
 */
import type { Page, Section, SiteDocument } from "./schema";
import { contrast } from "./util";
import { isValidVariant, SECTION_LABELS } from "./variants";

export type Severity = "error" | "warning" | "info";
export type QaCategory = "links" | "accessibility" | "seo" | "forms" | "design" | "content" | "performance";

export interface QaIssue {
  id: string;
  severity: Severity;
  category: QaCategory;
  message: string;
  pageId?: string;
  sectionId?: string;
  fixable: boolean;
}

export interface QaReport {
  score: number;
  issues: QaIssue[];
  checkedAt: string;
  summary: Record<QaCategory, number>;
}

function sectionLabel(s: Section) {
  return SECTION_LABELS[s.type] + (s.content.heading ? ` «${s.content.heading.slice(0, 40)}»` : "");
}

export function collectAnchors(doc: SiteDocument): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const p of doc.pages) map.set(p.path, new Set(p.sections.map((s) => s.style.anchor).filter(Boolean) as string[]));
  return map;
}

/** Returns null when an internal href resolves, otherwise a description of the problem. */
export function checkHref(href: string | undefined, doc: SiteDocument, currentPath: string, anchors = collectAnchors(doc)): string | null {
  if (href === undefined || href.trim() === "") return "enlace vacío";
  if (/^(https?:|mailto:|tel:)/.test(href)) return null;
  if (href === "#") return "enlace «#» que no lleva a ninguna parte";
  let path = currentPath;
  let hash = "";
  if (href.startsWith("#")) hash = href.slice(1);
  else {
    const [p, h] = href.split("#");
    path = p || "/";
    hash = h ?? "";
  }
  if (!anchors.has(path)) return `la página ${path} no existe`;
  if (hash && !anchors.get(path)!.has(hash)) return `el ancla #${hash} no existe en ${path}`;
  return null;
}

function sectionLinks(s: Section): Array<{ href: string | undefined; label: string }> {
  const out: Array<{ href: string | undefined; label: string }> = [];
  for (const c of s.content.ctas ?? []) out.push({ href: c.href, label: `botón «${c.label}»` });
  for (const i of s.content.items ?? []) if (i.href !== undefined) out.push({ href: i.href, label: `enlace «${i.title || i.text}»` });
  return out;
}

export function validateDocument(doc: SiteDocument): QaReport {
  const issues: QaIssue[] = [];
  const anchors = collectAnchors(doc);
  let n = 0;
  const add = (i: Omit<QaIssue, "id">) => issues.push({ ...i, id: `qa${++n}` });
  const { colors } = doc.theme;

  // ─── Theme-level design & accessibility ───
  const pairs: Array<[string, string, number, string]> = [
    [colors.text, colors.bg, 4.5, "Texto sobre fondo"],
    [colors.muted, colors.bg, 4.5, "Texto secundario sobre fondo"],
    [colors.text, colors.surface, 4.5, "Texto sobre superficie"],
    [colors.primaryText, colors.primary, 4.5, "Texto de botón sobre color principal"],
  ];
  for (const [fg, bg, min, label] of pairs) {
    const r = contrast(fg, bg);
    if (r < min) add({ severity: "error", category: "accessibility", message: `${label}: contraste ${r.toFixed(2)}:1 (mínimo ${min}:1, WCAG AA).`, fixable: true });
  }

  const paths = new Set<string>();
  for (const page of doc.pages) {
    if (paths.has(page.path)) add({ severity: "error", category: "links", message: `Ruta duplicada ${page.path}.`, pageId: page.id, fixable: true });
    paths.add(page.path);
    validatePage(doc, page, anchors, add);
  }
  if (!doc.pages.some((p) => p.path === "/")) add({ severity: "error", category: "links", message: "Falta la página de inicio (/).", fixable: true });

  const weights: Record<Severity, number> = { error: 8, warning: 3, info: 0.5 };
  const penalty = issues.reduce((acc, i) => acc + weights[i.severity], 0);
  const summary = { links: 0, accessibility: 0, seo: 0, forms: 0, design: 0, content: 0, performance: 0 } as Record<QaCategory, number>;
  for (const i of issues) summary[i.category]++;
  return { score: Math.max(0, Math.round(100 - penalty)), issues, checkedAt: new Date().toISOString(), summary };
}

function validatePage(doc: SiteDocument, page: Page, anchors: Map<string, Set<string>>, add: (i: Omit<QaIssue, "id">) => void) {
  const pid = page.id;
  // SEO
  const t = page.seo.title.trim();
  if (!t) add({ severity: "error", category: "seo", message: `«${page.name}»: falta el título SEO.`, pageId: pid, fixable: true });
  else if (t.length > 65) add({ severity: "warning", category: "seo", message: `«${page.name}»: título SEO de ${t.length} caracteres (recomendado ≤ 60).`, pageId: pid, fixable: true });
  const d = page.seo.description.trim();
  if (!d) add({ severity: "error", category: "seo", message: `«${page.name}»: falta la meta descripción.`, pageId: pid, fixable: true });
  else if (d.length < 50 || d.length > 165) add({ severity: "warning", category: "seo", message: `«${page.name}»: meta descripción de ${d.length} caracteres (recomendado 50–160).`, pageId: pid, fixable: true });

  // Headings: exactly one h1 (hero/scene3d/poster or first heading gets it in the renderer)
  const visible = page.sections.filter((s) => !(s.hidden?.desktop && s.hidden?.tablet && s.hidden?.mobile));
  const h1Candidates = visible.filter((s) => s.type === "hero" || s.type === "scene3d");
  if (h1Candidates.length > 1) add({ severity: "warning", category: "seo", message: `«${page.name}»: hay ${h1Candidates.length} heros; solo el primero será <h1>.`, pageId: pid, fixable: false });
  if (!visible.some((s) => s.type !== "navbar" && s.type !== "footer" && s.content.heading)) add({ severity: "error", category: "seo", message: `«${page.name}»: la página no tiene ningún titular.`, pageId: pid, fixable: false });

  if (!visible.some((s) => s.type === "navbar")) add({ severity: "warning", category: "links", message: `«${page.name}»: no tiene navegación.`, pageId: pid, fixable: true });
  if (!visible.some((s) => s.type === "footer")) add({ severity: "info", category: "design", message: `«${page.name}»: no tiene pie de página.`, pageId: pid, fixable: true });

  let prevType = "";
  for (const s of page.sections) {
    const sid = s.id;
    const label = sectionLabel(s);
    if (!isValidVariant(s.type, s.variant)) add({ severity: "warning", category: "design", message: `${label}: variante «${s.variant}» desconocida.`, pageId: pid, sectionId: sid, fixable: true });

    // Links & buttons
    for (const l of sectionLinks(s)) {
      const problem = checkHref(l.href, doc, page.path, anchors);
      if (problem) add({ severity: "error", category: "links", message: `${label}: ${l.label} — ${problem}.`, pageId: pid, sectionId: sid, fixable: true });
    }
    for (const it of s.content.items ?? []) {
      if (s.type === "products" && it.checkout?.paymentLink && !/^https:\/\//.test(it.checkout.paymentLink))
        add({ severity: "error", category: "links", message: `${label}: el enlace de pago de «${it.title}» debe ser https.`, pageId: pid, sectionId: sid, fixable: false });
    }

    // Images
    const images = [s.content.image, ...(s.content.media ?? []), ...(s.content.items ?? []).map((i) => i.image)].filter(Boolean);
    for (const img of images) {
      if (!img!.alt?.trim()) add({ severity: "error", category: "accessibility", message: `${label}: imagen sin texto alternativo.`, pageId: pid, sectionId: sid, fixable: true });
      if (!img!.src) add({ severity: "error", category: "content", message: `${label}: imagen sin origen.`, pageId: pid, sectionId: sid, fixable: true });
    }
    const generated = images.filter((i) => i!.kind === "generated").length;
    if (generated && ["hero", "gallery", "products", "team"].includes(s.type))
      add({ severity: "info", category: "content", message: `${label}: usa ${generated} imagen(es) generativa(s). Sustitúyelas por fotos reales o conecta Unsplash/Pexels.`, pageId: pid, sectionId: sid, fixable: false });

    // Forms
    const form = s.content.form;
    if (form) {
      const names = new Set<string>();
      for (const f of form.fields) {
        if (names.has(f.name)) add({ severity: "error", category: "forms", message: `${label}: campo «${f.name}» duplicado.`, pageId: pid, sectionId: sid, fixable: true });
        names.add(f.name);
        if (f.type === "select" && !f.options?.length) add({ severity: "error", category: "forms", message: `${label}: el desplegable «${f.label}» no tiene opciones.`, pageId: pid, sectionId: sid, fixable: false });
      }
      if (!form.fields.some((f) => f.type === "email" || f.type === "tel"))
        add({ severity: "warning", category: "forms", message: `${label}: el formulario no pide email ni teléfono; no podrás responder.`, pageId: pid, sectionId: sid, fixable: false });
    }
    if ((s.type === "contact" || s.type === "newsletter") && !form)
      add({ severity: "error", category: "forms", message: `${label}: sección de ${s.type === "contact" ? "contacto" : "newsletter"} sin formulario.`, pageId: pid, sectionId: sid, fixable: true });

    // Content
    if (s.sample) add({ severity: "warning", category: "content", message: `${label}: contiene datos de ejemplo (opiniones, cifras, precios o contacto). Sustitúyelos por datos reales antes de publicar.`, pageId: pid, sectionId: sid, fixable: false });
    const empty = !s.content.heading && !s.content.body && !(s.content.items?.length) && !s.content.form && !s.content.html && !s.content.image;
    if (empty && s.type !== "custom") add({ severity: "warning", category: "content", message: `${label}: sección vacía.`, pageId: pid, sectionId: sid, fixable: true });
    if (/lorem ipsum/i.test(JSON.stringify(s.content))) add({ severity: "error", category: "content", message: `${label}: contiene texto de relleno (lorem ipsum).`, pageId: pid, sectionId: sid, fixable: false });
    if (s.type === prevType && !["showcase", "richtext", "custom"].includes(s.type))
      add({ severity: "warning", category: "design", message: `${label}: dos secciones del mismo tipo seguidas resultan repetitivas.`, pageId: pid, sectionId: sid, fixable: false });
    for (const c of s.content.ctas ?? []) if (!c.label.trim()) add({ severity: "error", category: "accessibility", message: `${label}: botón sin texto.`, pageId: pid, sectionId: sid, fixable: true });
    if (s.type === "custom" && s.content.html && /<script/i.test(s.content.html))
      add({ severity: "error", category: "content", message: `${label}: el HTML personalizado no puede contener <script>.`, pageId: pid, sectionId: sid, fixable: true });
    prevType = s.type;
  }

  // Performance
  const docSize = JSON.stringify(page).length;
  if (docSize > 900_000) add({ severity: "warning", category: "performance", message: `«${page.name}»: la página pesa ${(docSize / 1024).toFixed(0)} KB de contenido incrustado. Sube las imágenes como archivos.`, pageId: pid, fixable: false });
  if (page.sections.filter((s) => s.type === "scene3d").length > 1) add({ severity: "warning", category: "performance", message: `«${page.name}»: más de una escena 3D por página penaliza el rendimiento.`, pageId: pid, fixable: false });
  void doc;
}
