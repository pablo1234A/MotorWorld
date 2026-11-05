import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { artMedia, motifFor } from "@/engine/art";
import { autofix } from "@/engine/autofix";
import { analyzeBrief } from "@/engine/brief";
import { createSection, generateSite, type GenerateOptions } from "@/engine/generate";
import { FORM_PRESETS } from "@/engine/kb";
import { applyOperations, operationSchema, type Operation } from "@/engine/ops";
import { PROJECT_KINDS, SECTION_TYPES, STYLE_IDS, type Section, type SiteDocument } from "@/engine/schema";
import { buildTheme, harmonizeTheme, STYLES } from "@/engine/styles";
import { hashString, uid } from "@/engine/util";
import { VARIANTS } from "@/engine/variants";
import type { Selection } from "@/engine/intents";

/** Primary model. Never silently replaced: the UI shows which engine produced each result. */
export const MODEL = process.env.WB_MODEL || "claude-opus-5-5";

export function aiEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 10 * 60 * 1000 });
  return client;
}

export class AiError extends Error {}

/** Structured-output JSON schemas accept a subset of JSON Schema; zod re-validates every constraint locally. */
function toOutputSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12", unrepresentable: "any" }) as Record<string, unknown>;
  const strip = new Set(["$schema", "maxLength", "minLength", "maximum", "minimum", "exclusiveMinimum", "exclusiveMaximum", "pattern", "format", "maxItems", "default"]);
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (strip.has(k)) continue;
      if (k === "minItems" && typeof v === "number" && v > 1) continue;
      out[k] = walk(v);
    }
    if (out.type === "object" && out.properties && out.additionalProperties === undefined) out.additionalProperties = false;
    return out;
  };
  return walk(json) as Record<string, unknown>;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(raw);
}

interface CallOptions<T extends z.ZodType> {
  system: string;
  user: string;
  schema: T;
  effort: "low" | "medium" | "high" | "xhigh";
  maxTokens?: number;
}

/**
 * One Claude call that must return JSON matching `schema`. Uses structured outputs; if the API
 * rejects the schema it falls back to JSON-in-text, and a validation failure gets one repair turn.
 */
async function callJson<T extends z.ZodType>({ system, user, schema, effort, maxTokens = 64000 }: CallOptions<T>): Promise<{ data: z.infer<T>; usage: { input: number; output: number } }> {
  const anthropic = getClient();
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: "user", content: user }];
  let useFormat = true;
  for (let attempt = 0; attempt < 3; attempt++) {
    let message: Anthropic.Beta.Messages.BetaMessage;
    try {
      const stream = anthropic.beta.messages.stream({
        model: MODEL,
        max_tokens: maxTokens,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages,
        output_config: useFormat ? { effort, format: { type: "json_schema", schema: toOutputSchema(schema) } } : { effort },
      });
      message = await stream.finalMessage();
    } catch (e) {
      if (e instanceof Anthropic.BadRequestError && useFormat && /schema|format|output_config/i.test(e.message)) {
        useFormat = false;
        messages[0] = { role: "user", content: `${user}\n\nResponde únicamente con un objeto JSON válido, sin texto adicional.` };
        continue;
      }
      if (e instanceof Anthropic.AuthenticationError) throw new AiError("La clave de Anthropic no es válida.");
      if (e instanceof Anthropic.RateLimitError) throw new AiError("Límite de uso de la API alcanzado. Inténtalo en unos segundos.");
      if (e instanceof Anthropic.APIError) throw new AiError(`Error de la API de Claude (${e.status ?? "red"}).`);
      throw e;
    }
    if (message.stop_reason === "refusal") throw new AiError("El modelo rechazó la petición. Reformula la instrucción.");
    if (message.stop_reason === "max_tokens") throw new AiError("La respuesta del modelo se cortó por longitud. Pide un cambio más acotado.");
    const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    let parsed: unknown;
    try {
      parsed = extractJson(text);
    } catch {
      messages.push({ role: "assistant", content: message.content as Anthropic.Beta.Messages.BetaContentBlockParam[] }, { role: "user", content: "La respuesta no era JSON válido. Devuelve solo el objeto JSON." });
      continue;
    }
    const result = schema.safeParse(parsed);
    if (result.success) return { data: result.data, usage: { input: message.usage.input_tokens, output: message.usage.output_tokens } };
    const errors = result.error.issues.slice(0, 12).map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n");
    messages.push(
      { role: "assistant", content: message.content as Anthropic.Beta.Messages.BetaContentBlockParam[] },
      { role: "user", content: `El JSON no cumple el esquema:\n${errors}\nCorrígelo y devuelve el objeto completo.` },
    );
  }
  throw new AiError("No se obtuvo una respuesta válida del modelo tras varios intentos.");
}

// ───────────────────────────── Generation ─────────────────────────────

const planItem = z.object({
  title: z.string(),
  text: z.string(),
  meta: z.string().optional(),
  price: z.string().optional(),
  badge: z.string().optional(),
  icon: z.string().optional(),
  features: z.array(z.string()).optional(),
});

const planSection = z.object({
  type: z.enum(SECTION_TYPES),
  variant: z.string(),
  background: z.enum(["default", "surface", "primary", "inverse", "accent"]),
  animation: z.enum(["none", "fade-up", "fade", "reveal", "stagger", "scale", "parallax", "cinematic"]),
  eyebrow: z.string().optional(),
  heading: z.string().optional(),
  subheading: z.string().optional(),
  body: z.string().optional(),
  note: z.string().optional(),
  imageAlt: z.string().optional(),
  items: z.array(planItem).optional(),
  ctas: z.array(z.object({ label: z.string(), href: z.string(), style: z.enum(["primary", "secondary", "ghost", "link"]) })).optional(),
  formPreset: z.enum(["contact", "quote", "booking", "testdrive", "enroll"]).optional(),
  sample: z.boolean(),
});

const sitePlanSchema = z.object({
  siteName: z.string().min(1).max(80),
  kind: z.enum(PROJECT_KINDS),
  style: z.enum(STYLE_IDS),
  mode: z.enum(["light", "dark"]),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  displayFont: z.string(),
  bodyFont: z.string(),
  motion: z.enum(["none", "subtle", "expressive", "cinematic"]),
  pages: z
    .array(
      z.object({
        name: z.string(),
        path: z.string(),
        seoTitle: z.string(),
        seoDescription: z.string(),
        sections: z.array(planSection).min(2).max(16),
      }),
    )
    .min(1)
    .max(8),
});
type SitePlan = z.infer<typeof sitePlanSchema>;

const VARIANT_GUIDE = Object.entries(VARIANTS)
  .map(([t, vs]) => `${t}: ${vs.map((v) => v.id).join(" | ")}`)
  .join("\n");

const GENERATION_SYSTEM = `Eres el director creativo y desarrollador principal de World Builder AI, un creador de webs profesional. Diseñas sitios que compiten con webs premiadas en Awwwards: originales, con jerarquía clara, tipografía con carácter y copy específico del negocio.

Devuelves un plan de sitio en JSON. Un motor de renderizado convierte ese plan en HTML/CSS/JS, así que eliges tipos de sección, variantes de layout y contenido; no escribes HTML.

Tipos de sección y variantes disponibles:
${VARIANT_GUIDE}

Estilos disponibles: ${STYLE_IDS.map((s) => `${s} (${STYLES[s].description})`).join("; ")}.

Reglas de calidad:
- Cada página empieza con navbar y termina con footer. La home lleva hero (o scene3d si el brief pide 3D).
- Nada de lorem ipsum ni frases vacías («soluciones innovadoras», «calidad y confianza»). Copy concreto: beneficios, cifras plausibles, nombres de productos y servicios reales del brief.
- No repitas el mismo tipo de sección seguido. Alterna fondos para crear ritmo; usa primary/inverse como máximo en 1–2 secciones por página.
- Enlaces internos: usa rutas de las páginas que defines ("/contacto") o anclas de la home ("/#contacto"). Las anclas disponibles son: features→servicios, steps→como-funciona, pricing→precios, products→catalogo, menu→carta, contact→contacto, faq→faq, gallery→proyectos, newsletter→newsletter, dashboard→panel, showcase→producto, scene3d→explorar, team→equipo, testimonials→opiniones.
- Marca sample=true en secciones con testimonios, cifras, precios, datos de contacto o inventario que no vengan del brief: el usuario deberá sustituirlos por datos reales.
- Las secciones contact y newsletter necesitan formPreset (contact|quote|booking|testdrive|enroll).
- Iconos disponibles para items: spark, shield, bolt, leaf, clock, chart, globe, heart, star, truck, card, chat, layers, target, key, wrench, map, cup, book, users, check, phone, mail, calendar, car, gauge, fuel, utensils, wine, camera, palette, code, cpu, lock, rocket, award, graduation, play, cart, box, refresh, search, home, building, scale, stethoscope, hammer, flame, gem, compass, trending.
- Precios como número sin símbolo ("29", "18500"); "0" significa gratis.
- Tipografías: solo Google Fonts con buena pareja display/body. Evita Inter como display.
- Color primario con contraste suficiente sobre el fondo del modo elegido.
- Escribe en el idioma del brief.`;

function planToDocument(plan: SitePlan, brief: string): SiteDocument {
  const seed = hashString(brief + plan.siteName);
  let theme = buildTheme({ style: plan.style, kind: plan.kind, seed, mode: plan.mode });
  theme = harmonizeTheme({
    ...theme,
    motion: plan.motion,
    colors: { ...theme.colors, primary: plan.primaryColor.toLowerCase(), accent: plan.accentColor.toLowerCase() },
    fonts: { ...theme.fonts, display: plan.displayFont, body: plan.bodyFont },
  });
  let art = 0;
  const media = (alt: string) => artMedia(theme, seed + art * 7919, alt, alt, motifFor(theme, art++));
  const seenAnchors = new Set<string>();
  const anchorMap: Partial<Record<string, string>> = { features: "servicios", steps: "como-funciona", pricing: "precios", products: "catalogo", menu: "carta", contact: "contacto", faq: "faq", gallery: "proyectos", newsletter: "newsletter", dashboard: "panel", showcase: "producto", scene3d: "explorar", team: "equipo", testimonials: "opiniones" };

  const pages = plan.pages.map((p, pi) => {
    const path = pi === 0 ? "/" : "/" + p.path.replace(/^\/+/, "").toLowerCase().replace(/[^a-z0-9/-]+/g, "-").replace(/^-|-$/g, "");
    seenAnchors.clear();
    const sections: Section[] = p.sections.map((s) => {
      const validVariant = VARIANTS[s.type].some((v) => v.id === s.variant) ? s.variant : VARIANTS[s.type][0].id;
      const needsImage = ["hero", "showcase"].includes(s.type);
      const itemsWithImages = ["gallery", "products", "team"].includes(s.type);
      const anchor = anchorMap[s.type];
      const sec: Section = {
        id: uid("sec"),
        type: s.type,
        variant: validVariant,
        style: {
          background: s.type === "navbar" || s.type === "hero" ? "default" : s.background,
          padding: s.type === "navbar" ? "none" : s.type === "hero" || s.type === "scene3d" ? "xl" : s.type === "marquee" || s.type === "logos" ? "sm" : theme.density === "airy" ? "xl" : "lg",
          align: ["cta", "newsletter"].includes(s.type) || (s.type === "hero" && ["centered", "poster", "product"].includes(validVariant)) ? "center" : "start",
          width: s.type === "gallery" ? "wide" : s.type === "faq" ? "narrow" : "default",
          ...(anchor && !seenAnchors.has(anchor) ? { anchor } : {}),
        },
        animation: { preset: s.animation, delay: 0 },
        content: {
          ...(s.eyebrow ? { eyebrow: s.eyebrow } : {}),
          ...(s.heading ? { heading: s.heading } : {}),
          ...(s.subheading ? { subheading: s.subheading } : {}),
          ...(s.body ? { body: s.body } : {}),
          ...(s.note ? { note: s.note } : {}),
          ...(needsImage ? { image: media(s.imageAlt || s.heading || plan.siteName) } : {}),
          ...(s.items ? { items: s.items.map((it) => ({ id: uid("it"), ...it, ...(itemsWithImages ? { image: media(it.title) } : {}), ...(s.type === "navbar" || s.type === "footer" ? { href: it.meta?.startsWith("/") ? it.meta : undefined } : {}) })) } : {}),
          ...(s.ctas ? { ctas: s.ctas } : {}),
          ...(s.formPreset ? { form: { id: uid("form"), fields: FORM_PRESETS[s.formPreset].map((f) => ({ ...f, options: "options" in f ? [...f.options] : undefined })), submitLabel: s.formPreset === "booking" ? "Solicitar reserva" : "Enviar", successMessage: "Gracias. Hemos recibido tu mensaje y te responderemos muy pronto." } } : {}),
        },
        ...(s.sample ? { sample: true } : {}),
      } as Section;
      if (anchor) seenAnchors.add(anchor);
      return sec;
    });
    return { id: uid("pg"), name: p.name, path, seo: { title: p.seoTitle, description: p.seoDescription, noindex: false }, sections };
  });

  const doc: SiteDocument = {
    schemaVersion: 1,
    kind: plan.kind,
    brief: brief.slice(0, 4000),
    settings: { siteName: plan.siteName, lang: analyzeBrief(brief).lang, notifyEmail: "", formWebhook: "", currency: "EUR" },
    theme,
    pages,
    library: [],
  };
  // Navbar/footer links always reflect the real page list.
  for (const page of doc.pages)
    for (const s of page.sections) {
      if (s.type === "navbar") s.content.items = doc.pages.filter((x) => x.path !== "/").map((x) => ({ id: uid("lk"), title: x.name, text: "", href: x.path }));
      if (s.type === "footer") s.content.items = doc.pages.map((x) => ({ id: uid("lk"), title: x.name, text: "", href: x.path }));
      if (s.type === "navbar" && !s.content.heading) s.content.heading = doc.settings.siteName;
      if (s.type === "footer" && !s.content.heading) s.content.heading = doc.settings.siteName;
    }
  return doc;
}

export interface AiGenerateResult {
  doc: SiteDocument;
  engine: "claude" | "local";
  model?: string;
  fixes: string[];
  usage?: { input: number; output: number };
}

export async function generateProject(opts: GenerateOptions): Promise<AiGenerateResult> {
  if (!aiEnabled()) {
    const r = autofix(generateSite(opts));
    return { doc: r.doc, engine: "local", fixes: r.fixed };
  }
  const analysis = analyzeBrief(opts.brief, opts.kind);
  const user = `Brief del cliente:\n"""${opts.brief}"""\n\nAnálisis previo (orientativo): ${JSON.stringify({ sector: opts.kind ?? analysis.kind, nombre: opts.name ?? analysis.name, ciudad: analysis.city, oferta: analysis.offerings, necesidades: analysis.wants, paginasSugeridas: opts.pages ?? analysis.pageHints })}
${opts.style ? `Estilo elegido por el usuario: ${opts.style}.` : ""}${opts.mode ? ` Modo: ${opts.mode}.` : ""}${opts.name ? ` Nombre del negocio: ${opts.name}.` : ""}

Diseña el sitio completo. Empieza por la home y añade las páginas que el negocio necesita de verdad (máximo 6).`;
  const { data, usage } = await callJson({ system: GENERATION_SYSTEM, user, schema: sitePlanSchema, effort: "high" });
  if (opts.style) data.style = opts.style;
  if (opts.mode) data.mode = opts.mode;
  const fixedDoc = autofix(planToDocument(data, opts.brief));
  return { doc: fixedDoc.doc, engine: "claude", model: MODEL, fixes: fixedDoc.fixed, usage };
}

// ───────────────────────────── Chat editing ─────────────────────────────

const editResponseSchema = z.object({
  reply: z.string(),
  operations: z.array(operationSchema).max(40),
});

/** Strips heavy fields (data: URIs) so the document fits comfortably in context. */
function compactDoc(doc: SiteDocument) {
  return JSON.parse(
    JSON.stringify(doc, (key, value) => {
      if (key === "src" && typeof value === "string" && value.startsWith("data:")) return "[arte generativo]";
      if (key === "favicon") return undefined;
      return value;
    }),
  );
}

const EDIT_SYSTEM = `Eres el asistente de edición de World Builder AI. Recibes el documento JSON de un sitio web y una instrucción del usuario. Respondes con operaciones atómicas que el editor aplica y valida; nunca reescribes el documento entero.

Operaciones disponibles (campo "op"):
- update_section {pageId, sectionId, patch:{variant?, style?{background,padding,align,width,overlay}, animation?{preset,delay}, hidden?{desktop,tablet,mobile}, content?{eyebrow,heading,subheading,body,note,image,items,ctas,form}, sample?}} — content hace merge por campo; items/ctas sustituyen la lista completa (conserva los id existentes de items).
- add_section {pageId, sectionType, index?, patch?} — crea una sección con contenido base y le aplica patch.
- remove_section / duplicate_section {pageId, sectionId}; move_section {pageId, sectionId, toIndex}
- update_theme {patch:{style?, mode?, colors?{bg,surface,text,muted,primary,primaryText,accent,border}, fonts?{display,body,mono}, radius?, density?, motion?, scale?, headingCase?}}
- restyle {style, mode?, keepBrandColor?} — cambia toda la dirección de arte.
- add_page {name, path?, sectionTypes?}; update_page {pageId, name?, path?, seo?{title,description,noindex}}; remove_page {pageId}
- update_settings {patch:{siteName?, lang?, notifyEmail?, formWebhook?, currency?}}

Variantes por tipo:
${VARIANT_GUIDE}

Principios:
- Cambia solo lo que la instrucción pide. Si hay una sección seleccionada y la instrucción dice «esta sección», actúa sobre ella.
- Para cambios visuales de una sección («premium», «más impacto») combina variante, fondo, padding, animación y copy, sin tocar el resto del sitio.
- Copy concreto y del negocio; nada de lorem ipsum.
- Si la instrucción es ambigua o imposible, devuelve operations vacío y explica en reply qué necesitas.
- reply: una o dos frases en el idioma del usuario que digan qué has cambiado.`;

export interface AiEditResult {
  reply: string;
  ops: Operation[];
  engine: "claude";
  usage: { input: number; output: number };
}

export async function editWithClaude(doc: SiteDocument, instruction: string, selection: Selection, history: Array<{ role: "user" | "assistant"; content: string }>): Promise<AiEditResult> {
  const page = doc.pages.find((p) => p.id === selection.pageId) ?? doc.pages[0];
  const selected = selection.sectionId ? page.sections.find((s) => s.id === selection.sectionId) : undefined;
  const recent = history.slice(-8).map((m) => `${m.role === "user" ? "Usuario" : "Asistente"}: ${m.content}`).join("\n");
  const user = `Documento actual:\n${JSON.stringify(compactDoc(doc))}\n\nPágina activa: ${page.id} (${page.name}, ${page.path})\nSección seleccionada: ${selected ? `${selected.id} (${selected.type}, variante ${selected.variant})` : "ninguna"}\n${recent ? `\nConversación reciente:\n${recent}\n` : ""}\nInstrucción: ${instruction}`;
  let { data, usage } = await callJson({ system: EDIT_SYSTEM, user, schema: editResponseSchema, effort: "medium", maxTokens: 32000 });
  // Dry-run: if operations fail against the real document, ask once for a corrected set.
  const trial = applyOperations(doc, data.operations);
  if (trial.errors.length && data.operations.length) {
    const retry = await callJson({
      system: EDIT_SYSTEM,
      user: `${user}\n\nTu propuesta anterior falló al aplicarse:\n${trial.errors.join("\n")}\nDevuelve un conjunto corregido.`,
      schema: editResponseSchema,
      effort: "medium",
      maxTokens: 32000,
    });
    data = retry.data;
    usage = { input: usage.input + retry.usage.input, output: usage.output + retry.usage.output };
  }
  return { reply: data.reply, ops: data.operations, engine: "claude", usage };
}

/** Rewrites a single section with Claude (used by «Regenerar con IA» on a section). */
export async function regenerateSectionWithClaude(doc: SiteDocument, pageId: string, section: Section, hint: string) {
  return editWithClaude(doc, `Reescribe por completo el contenido de la sección ${section.id} (${section.type}) para que sea más específico y convincente. ${hint}`.trim(), { pageId, sectionId: section.id }, []);
}

export { createSection };
