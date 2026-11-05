/**
 * Atomic edit operations. The visual editor, the local intent parser and Claude all modify
 * documents exclusively through these, so an AI instruction can only touch what it names
 * and every result is schema-validated before it is accepted.
 */
import { z } from "zod";
import { artMedia, motifFor } from "./art";
import { createSection } from "./generate";
import {
  ANIMATION_PRESETS,
  ctaSchema,
  itemSchema,
  mediaSchema,
  formSchema,
  SECTION_TYPES,
  STYLE_IDS,
  sectionStyleSchema,
  siteDocumentSchema,
  type Section,
  type SiteDocument,
} from "./schema";
import { buildTheme, flipMode, harmonizeTheme } from "./styles";
import { deepClone, hashString, slugify, uid } from "./util";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const contentPatchSchema = z
  .object({
    eyebrow: z.string().max(240).nullable(),
    heading: z.string().max(300).nullable(),
    subheading: z.string().max(600).nullable(),
    body: z.string().max(4000).nullable(),
    note: z.string().max(600).nullable(),
    html: z.string().max(40000).nullable(),
    image: mediaSchema.nullable(),
    items: z.array(itemSchema).max(48),
    ctas: z.array(ctaSchema).max(4),
    form: formSchema,
  })
  .partial();

export const sectionPatchSchema = z
  .object({
    variant: z.string().max(40),
    style: sectionStyleSchema.partial(),
    animation: z.object({ preset: z.enum(ANIMATION_PRESETS), delay: z.number().min(0).max(2) }).partial(),
    hidden: z.object({ desktop: z.boolean(), tablet: z.boolean(), mobile: z.boolean() }).partial(),
    content: contentPatchSchema,
    sample: z.boolean(),
  })
  .partial();

export const themePatchSchema = z
  .object({
    style: z.enum(STYLE_IDS),
    mode: z.enum(["light", "dark"]),
    colors: z.object({ bg: hex, surface: hex, text: hex, muted: hex, primary: hex, primaryText: hex, accent: hex, border: hex }).partial(),
    fonts: z.object({ display: z.string().max(60), body: z.string().max(60), mono: z.string().max(60) }).partial(),
    radius: z.number().min(0).max(40),
    density: z.enum(["compact", "comfortable", "airy"]),
    motion: z.enum(["none", "subtle", "expressive", "cinematic"]),
    scale: z.number().min(1.1).max(1.6),
    headingCase: z.enum(["normal", "upper"]),
  })
  .partial();

export const operationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("update_section"), pageId: z.string(), sectionId: z.string(), patch: sectionPatchSchema }),
  z.object({ op: z.literal("add_section"), pageId: z.string(), index: z.number().int().min(0).optional(), sectionType: z.enum(SECTION_TYPES), patch: sectionPatchSchema.optional() }),
  z.object({ op: z.literal("insert_section"), pageId: z.string(), index: z.number().int().min(0).optional(), section: z.any() }),
  z.object({ op: z.literal("remove_section"), pageId: z.string(), sectionId: z.string() }),
  z.object({ op: z.literal("move_section"), pageId: z.string(), sectionId: z.string(), toIndex: z.number().int().min(0) }),
  z.object({ op: z.literal("duplicate_section"), pageId: z.string(), sectionId: z.string() }),
  z.object({ op: z.literal("update_theme"), patch: themePatchSchema }),
  z.object({ op: z.literal("restyle"), style: z.enum(STYLE_IDS), mode: z.enum(["light", "dark"]).optional(), keepBrandColor: z.boolean().optional() }),
  z.object({ op: z.literal("add_page"), name: z.string().min(1).max(60), path: z.string().max(80).optional(), sectionTypes: z.array(z.enum(SECTION_TYPES)).max(20).optional() }),
  z.object({ op: z.literal("update_page"), pageId: z.string(), name: z.string().min(1).max(60).optional(), path: z.string().max(80).optional(), seo: z.object({ title: z.string().max(120), description: z.string().max(320), ogImage: z.string().max(600), noindex: z.boolean() }).partial().optional() }),
  z.object({ op: z.literal("remove_page"), pageId: z.string() }),
  z.object({ op: z.literal("update_settings"), patch: z.object({ siteName: z.string().min(1).max(80), lang: z.enum(["es", "en", "fr", "de", "it", "pt"]), notifyEmail: z.string().max(200), formWebhook: z.string().max(600), currency: z.string().length(3) }).partial() }),
  z.object({ op: z.literal("save_component"), pageId: z.string(), sectionId: z.string(), name: z.string().min(1).max(60) }),
  z.object({ op: z.literal("insert_component"), pageId: z.string(), componentId: z.string(), index: z.number().int().min(0).optional() }),
  z.object({ op: z.literal("remove_component"), componentId: z.string() }),
]);
export type Operation = z.infer<typeof operationSchema>;

export interface ApplyResult {
  doc: SiteDocument;
  applied: string[];
  errors: string[];
}

function findPage(doc: SiteDocument, pageId: string) {
  const page = doc.pages.find((p) => p.id === pageId) ?? doc.pages.find((p) => p.path === pageId || p.name.toLowerCase() === pageId.toLowerCase());
  if (!page) throw new Error(`Página ${pageId} no encontrada`);
  return page;
}

function findSection(doc: SiteDocument, pageId: string, sectionId: string) {
  const page = findPage(doc, pageId);
  const index = page.sections.findIndex((s) => s.id === sectionId);
  if (index < 0) throw new Error(`Sección ${sectionId} no encontrada en ${page.name}`);
  return { page, index, section: page.sections[index] };
}

function applySectionPatch(section: Section, patch: z.infer<typeof sectionPatchSchema>) {
  if (patch.variant) section.variant = patch.variant;
  if (patch.style) section.style = { ...section.style, ...patch.style };
  if (patch.animation) section.animation = { ...section.animation, ...patch.animation };
  if (patch.hidden) section.hidden = { ...(section.hidden ?? {}), ...patch.hidden };
  if (patch.sample !== undefined) section.sample = patch.sample;
  if (patch.content) {
    const c = section.content as Record<string, unknown>;
    for (const [k, v] of Object.entries(patch.content)) {
      if (v === null) delete c[k];
      else if (v !== undefined) c[k] = v;
    }
  }
}

/** Regenerates generated (abstract) artwork so it follows the current palette. */
export function refreshGeneratedArt(doc: SiteDocument) {
  let i = 0;
  const seedBase = hashString(doc.settings.siteName);
  const redo = (m: { kind: string; alt: string; query?: string } | undefined) => {
    if (!m || m.kind !== "generated") return m;
    const idx = i++;
    return artMedia(doc.theme, seedBase + idx * 7919, m.alt, m.query, motifFor(doc.theme, idx));
  };
  for (const p of doc.pages)
    for (const s of p.sections) {
      if (s.content.image) s.content.image = redo(s.content.image) as Section["content"]["image"];
      for (const it of s.content.items ?? []) if (it.image) it.image = redo(it.image) as typeof it.image;
    }
}

function normalizePath(name: string, path?: string) {
  const p = path ? "/" + path.replace(/^\/+/, "").split("/").map(slugify).filter(Boolean).join("/") : "/" + slugify(name);
  return p === "/" && name.toLowerCase() !== "inicio" ? "/" + (slugify(name) || "pagina") : p;
}

function syncNavigation(doc: SiteDocument) {
  // Keep navbar/footer page links in sync when pages are added/removed/renamed.
  const pageLinks = doc.pages.map((p) => ({ name: p.name, path: p.path }));
  for (const p of doc.pages)
    for (const s of p.sections) {
      if (s.type !== "navbar" && s.type !== "footer") continue;
      const items = s.content.items ?? [];
      const anchors = items.filter((i) => i.href && /#/.test(i.href) && !doc.pages.some((pg) => pg.path === i.href));
      const pagesOnly = pageLinks.filter((l) => (s.type === "footer" ? true : l.path !== "/"));
      const next = [
        ...pagesOnly.map((l) => items.find((i) => i.href === l.path) ?? { id: uid("lk"), title: l.name, text: "", href: l.path }),
        ...anchors,
      ].map((i) => {
        const pg = pageLinks.find((l) => l.path === i.href);
        return pg ? { ...i, title: pg.name } : i;
      });
      s.content.items = s.type === "navbar" ? next.slice(0, 6) : next;
    }
}

export function applyOperations(input: SiteDocument, rawOps: unknown[]): ApplyResult {
  const doc = deepClone(input);
  const applied: string[] = [];
  const errors: string[] = [];
  let themeChanged = false;
  let pagesChanged = false;

  for (const raw of rawOps) {
    const parsed = operationSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push(`Operación no válida: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
      continue;
    }
    const op = parsed.data;
    try {
      switch (op.op) {
        case "update_section": {
          const { section } = findSection(doc, op.pageId, op.sectionId);
          applySectionPatch(section, op.patch);
          applied.push(`Sección ${section.type} actualizada`);
          break;
        }
        case "add_section": {
          const page = findPage(doc, op.pageId);
          const section = createSection(doc, op.sectionType);
          if (op.patch) applySectionPatch(section, op.patch);
          const footerIdx = page.sections.findIndex((s) => s.type === "footer");
          const idx = op.index ?? (footerIdx >= 0 ? footerIdx : page.sections.length);
          page.sections.splice(Math.min(idx, page.sections.length), 0, section);
          applied.push(`Sección ${op.sectionType} añadida a ${page.name}`);
          break;
        }
        case "insert_section": {
          const page = findPage(doc, op.pageId);
          const section = { ...(op.section as Section), id: uid("sec") };
          const idx = op.index ?? page.sections.length;
          page.sections.splice(Math.min(idx, page.sections.length), 0, section);
          applied.push(`Sección insertada en ${page.name}`);
          break;
        }
        case "remove_section": {
          const { page, index, section } = findSection(doc, op.pageId, op.sectionId);
          page.sections.splice(index, 1);
          applied.push(`Sección ${section.type} eliminada`);
          break;
        }
        case "move_section": {
          const { page, index, section } = findSection(doc, op.pageId, op.sectionId);
          page.sections.splice(index, 1);
          page.sections.splice(Math.min(op.toIndex, page.sections.length), 0, section);
          applied.push(`Sección ${section.type} movida`);
          break;
        }
        case "duplicate_section": {
          const { page, index, section } = findSection(doc, op.pageId, op.sectionId);
          const copy = deepClone(section);
          copy.id = uid("sec");
          if (copy.style.anchor) delete copy.style.anchor;
          page.sections.splice(index + 1, 0, copy);
          applied.push(`Sección ${section.type} duplicada`);
          break;
        }
        case "update_theme": {
          const { colors, fonts, mode, ...rest } = op.patch;
          let theme = { ...doc.theme, ...rest };
          if (mode && mode !== theme.mode) theme = flipMode(theme, mode);
          if (colors) theme = { ...theme, colors: { ...theme.colors, ...colors } };
          if (fonts) theme = { ...theme, fonts: { ...theme.fonts, ...fonts } };
          doc.theme = harmonizeTheme(theme);
          themeChanged = true;
          applied.push("Tema actualizado");
          break;
        }
        case "restyle": {
          const primary = doc.theme.colors.primary;
          const next = buildTheme({ style: op.style, kind: doc.kind, seed: hashString(doc.brief + op.style), mode: op.mode });
          if (op.keepBrandColor) next.colors.primary = primary;
          doc.theme = harmonizeTheme(next);
          themeChanged = true;
          applied.push(`Estilo cambiado a ${op.style}`);
          break;
        }
        case "add_page": {
          const path = normalizePath(op.name, op.path);
          if (doc.pages.some((p) => p.path === path)) throw new Error(`Ya existe una página en ${path}`);
          const home = doc.pages.find((p) => p.path === "/") ?? doc.pages[0];
          const types = op.sectionTypes?.length ? op.sectionTypes : (["showcase", "features", "cta"] as const);
          const nav = home.sections.find((s) => s.type === "navbar");
          const foot = home.sections.find((s) => s.type === "footer");
          const body = types.filter((t) => t !== "navbar" && t !== "footer").map((t) => createSection(doc, t));
          const sections = [nav ? { ...deepClone(nav), id: uid("sec") } : createSection(doc, "navbar"), ...body, foot ? { ...deepClone(foot), id: uid("sec") } : createSection(doc, "footer")];
          doc.pages.push({ id: uid("pg"), name: op.name, path, seo: { title: `${op.name} — ${doc.settings.siteName}`, description: "", noindex: false }, sections });
          pagesChanged = true;
          applied.push(`Página «${op.name}» creada en ${path}`);
          break;
        }
        case "update_page": {
          const page = findPage(doc, op.pageId);
          if (op.name) page.name = op.name;
          if (op.path !== undefined && page.path !== "/") {
            const path = normalizePath(page.name, op.path);
            if (doc.pages.some((p) => p.path === path && p.id !== page.id)) throw new Error(`Ya existe una página en ${path}`);
            page.path = path;
          }
          if (op.seo) page.seo = { ...page.seo, ...op.seo };
          pagesChanged = true;
          applied.push(`Página «${page.name}» actualizada`);
          break;
        }
        case "remove_page": {
          const page = findPage(doc, op.pageId);
          if (page.path === "/") throw new Error("No se puede eliminar la página de inicio");
          doc.pages = doc.pages.filter((p) => p.id !== page.id);
          pagesChanged = true;
          applied.push(`Página «${page.name}» eliminada`);
          break;
        }
        case "update_settings": {
          doc.settings = { ...doc.settings, ...op.patch } as SiteDocument["settings"];
          applied.push("Ajustes actualizados");
          break;
        }
        case "save_component": {
          const { section } = findSection(doc, op.pageId, op.sectionId);
          const copy = deepClone(section);
          const id = uid("cmp");
          copy.componentId = id;
          doc.library.push({ id, name: op.name, section: copy });
          applied.push(`Componente «${op.name}» guardado en la biblioteca`);
          break;
        }
        case "insert_component": {
          const page = findPage(doc, op.pageId);
          const comp = doc.library.find((c) => c.id === op.componentId);
          if (!comp) throw new Error("Componente no encontrado");
          const copy = deepClone(comp.section);
          copy.id = uid("sec");
          delete copy.style.anchor;
          const footerIdx = page.sections.findIndex((s) => s.type === "footer");
          page.sections.splice(op.index ?? (footerIdx >= 0 ? footerIdx : page.sections.length), 0, copy);
          applied.push(`Componente «${comp.name}» insertado`);
          break;
        }
        case "remove_component": {
          doc.library = doc.library.filter((c) => c.id !== op.componentId);
          applied.push("Componente eliminado de la biblioteca");
          break;
        }
      }
    } catch (e) {
      errors.push((e as Error).message);
    }
  }

  if (themeChanged) refreshGeneratedArt(doc);
  if (pagesChanged) syncNavigation(doc);

  const valid = siteDocumentSchema.safeParse(doc);
  if (!valid.success) {
    return {
      doc: input,
      applied: [],
      errors: [...errors, ...valid.error.issues.slice(0, 5).map((i) => `Resultado no válido en ${i.path.join(".")}: ${i.message}`)],
    };
  }
  return { doc: valid.data, applied, errors };
}
