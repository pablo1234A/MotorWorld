import { z } from "zod";
import { conditionPaths, conditionSchema, evaluate, getPath, type Condition } from "./conditions";

/**
 * Motor documental de Legalito.
 *
 * Una plantilla es un documento estructurado (JSON) compuesto por secciones y
 * bloques. Cada bloque puede tener una condición `when` y texto con variables
 * `{{ruta.de.variable}}`. El motor:
 *   1. valida la estructura de la plantilla,
 *   2. evalúa qué secciones y bloques aplican al contexto,
 *   3. sustituye las variables,
 *   4. informa de las variables obligatorias que faltan (no genera texto vacío),
 *   5. devuelve un documento renderizado independiente del formato de salida.
 * El texto jurídico vive exclusivamente en las plantillas revisadas.
 */

// ---------------------------------------------------------------------------
// Esquema de plantilla
// ---------------------------------------------------------------------------
const text = z.string().min(1).max(4000);
const when = conditionSchema.optional();

const listItem = z.union([text, z.object({ text, when }).strict()]);

const blockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), text, when }).strict(),
  z.object({ type: z.literal("heading"), text: z.string().min(1).max(200), when }).strict(),
  z
    .object({
      type: z.literal("list"),
      ordered: z.boolean().optional(),
      items: z.array(listItem).optional(),
      source: z.string().optional(),
      itemText: z.string().optional(),
      when,
    })
    .strict()
    .refine((b) => (b.items && b.items.length > 0) || (b.source && b.itemText), {
      message: "Una lista necesita `items` o `source` + `itemText`",
    }),
  z
    .object({
      type: z.literal("table"),
      columns: z.array(z.string().min(1).max(80)).min(1).max(6),
      rows: z.array(z.object({ cells: z.array(text), when }).strict()).optional(),
      source: z.string().optional(),
      cellTexts: z.array(z.string()).optional(),
      empty: z.string().optional(),
      when,
    })
    .strict()
    .refine((b) => (b.rows && b.rows.length > 0) || (b.source && b.cellTexts), {
      message: "Una tabla necesita `rows` o `source` + `cellTexts`",
    })
    .refine((b) => !b.rows || b.rows.every((r) => r.cells.length === b.columns.length), {
      message: "Cada fila debe tener tantas celdas como columnas",
    })
    .refine((b) => !b.cellTexts || b.cellTexts.length === b.columns.length, {
      message: "`cellTexts` debe tener tantos elementos como columnas",
    }),
  z.object({ type: z.literal("callout"), tone: z.enum(["info", "warning"]), text, when }).strict(),
]);

const sectionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{2,60}$/),
    heading: z.string().min(1).max(200),
    when,
    blocks: z.array(blockSchema).min(1),
  })
  .strict();

export const templateContentSchema = z
  .object({
    title: z.string().min(1).max(200),
    intro: z.array(blockSchema).optional(),
    sections: z.array(sectionSchema).min(1),
    closing: z.array(blockSchema).optional(),
  })
  .strict()
  .refine((t) => new Set(t.sections.map((s) => s.id)).size === t.sections.length, {
    message: "Los identificadores de sección deben ser únicos",
  });

export type TemplateContent = z.infer<typeof templateContentSchema>;
export type TemplateBlock = z.infer<typeof blockSchema>;

export const templateVariableSchema = z.object({
  key: z.string(),
  description: z.string().optional(),
});
export type TemplateVariable = z.infer<typeof templateVariableSchema>;

// ---------------------------------------------------------------------------
// Documento renderizado (agnóstico del formato)
// ---------------------------------------------------------------------------
export type RenderedBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; columns: string[]; rows: string[][] }
  | { type: "callout"; tone: "info" | "warning"; text: string };

export interface RenderedSection {
  id: string;
  number: number;
  heading: string;
  blocks: RenderedBlock[];
}

export interface RenderedDocument {
  title: string;
  intro: RenderedBlock[];
  sections: RenderedSection[];
  closing: RenderedBlock[];
}

export interface RenderResult {
  document: RenderedDocument;
  /** Variables referenciadas en bloques incluidos que no tienen valor. */
  missing: string[];
  usedVariables: string[];
  includedSections: string[];
}

const VAR_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)\s*\}\}/g;

function formatValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value.trim() === "" ? null : value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "sí" : "no";
  return null;
}

class Interpolator {
  missing = new Set<string>();
  used = new Set<string>();
  constructor(private ctx: unknown) {}

  run(template: string, scope?: Record<string, unknown>): string {
    return template.replace(VAR_RE, (_m, path: string) => {
      const value =
        scope && path.startsWith("item.") ? getPath(scope, path) : getPath(this.ctx, path);
      if (!path.startsWith("item.")) this.used.add(path);
      const formatted = formatValue(value);
      if (formatted === null) {
        this.missing.add(path);
        return "";
      }
      return formatted;
    });
  }
}

function renderBlock(block: TemplateBlock, ctx: unknown, interp: Interpolator): RenderedBlock | null {
  if (!evaluate(block.when as Condition | undefined, ctx)) return null;
  switch (block.type) {
    case "paragraph":
      return { type: "paragraph", text: interp.run(block.text) };
    case "heading":
      return { type: "heading", text: interp.run(block.text) };
    case "callout":
      return { type: "callout", tone: block.tone, text: interp.run(block.text) };
    case "list": {
      let items: string[] = [];
      if (block.items) {
        items = block.items
          .filter((i) => typeof i === "string" || evaluate(i.when as Condition | undefined, ctx))
          .map((i) => interp.run(typeof i === "string" ? i : i.text));
      } else if (block.source && block.itemText) {
        const source = getPath(ctx, block.source);
        interp.used.add(block.source);
        if (Array.isArray(source)) {
          items = source.map((item) => interp.run(block.itemText!, { item }));
        }
      }
      return items.length > 0 ? { type: "list", ordered: Boolean(block.ordered), items } : null;
    }
    case "table": {
      let rows: string[][] = [];
      if (block.rows) {
        rows = block.rows
          .filter((r) => evaluate(r.when as Condition | undefined, ctx))
          .map((r) => r.cells.map((c) => interp.run(c)));
      } else if (block.source && block.cellTexts) {
        const source = getPath(ctx, block.source);
        interp.used.add(block.source);
        if (Array.isArray(source)) {
          rows = source.map((item) => block.cellTexts!.map((c) => interp.run(c, { item })));
        }
      }
      if (rows.length === 0) {
        return block.empty ? { type: "paragraph", text: interp.run(block.empty) } : null;
      }
      return { type: "table", columns: block.columns, rows };
    }
  }
}

function renderBlocks(blocks: TemplateBlock[] | undefined, ctx: unknown, interp: Interpolator): RenderedBlock[] {
  return (blocks ?? []).map((b) => renderBlock(b, ctx, interp)).filter((b): b is RenderedBlock => b !== null);
}

export function parseTemplateContent(input: unknown): TemplateContent {
  return templateContentSchema.parse(input);
}

export function renderTemplate(content: TemplateContent, ctx: unknown): RenderResult {
  const interp = new Interpolator(ctx);
  const sections: RenderedSection[] = [];
  let n = 0;
  for (const section of content.sections) {
    if (!evaluate(section.when as Condition | undefined, ctx)) continue;
    const blocks = renderBlocks(section.blocks, ctx, interp);
    if (blocks.length === 0) continue;
    n += 1;
    sections.push({ id: section.id, number: n, heading: interp.run(section.heading), blocks });
  }
  const document: RenderedDocument = {
    title: interp.run(content.title),
    intro: renderBlocks(content.intro, ctx, interp),
    sections,
    closing: renderBlocks(content.closing, ctx, interp),
  };
  return {
    document,
    missing: Array.from(interp.missing).sort(),
    usedVariables: Array.from(interp.used).sort(),
    includedSections: sections.map((s) => s.id),
  };
}

// ---------------------------------------------------------------------------
// Introspección (para administración: variables y reglas de una plantilla)
// ---------------------------------------------------------------------------
function collectTexts(content: TemplateContent): string[] {
  const out: string[] = [content.title];
  const fromBlocks = (blocks?: TemplateBlock[]) => {
    for (const b of blocks ?? []) {
      if ("text" in b && typeof b.text === "string") out.push(b.text);
      if (b.type === "list") {
        for (const i of b.items ?? []) out.push(typeof i === "string" ? i : i.text);
        if (b.itemText) out.push(b.itemText);
      }
      if (b.type === "table") {
        for (const r of b.rows ?? []) out.push(...r.cells);
        out.push(...(b.cellTexts ?? []));
        if (b.empty) out.push(b.empty);
      }
    }
  };
  fromBlocks(content.intro);
  for (const s of content.sections) {
    out.push(s.heading);
    fromBlocks(s.blocks);
  }
  fromBlocks(content.closing);
  return out;
}

export function extractVariables(content: TemplateContent): string[] {
  const vars = new Set<string>();
  for (const t of collectTexts(content)) {
    for (const m of t.matchAll(VAR_RE)) if (!m[1].startsWith("item.")) vars.add(m[1]);
  }
  return Array.from(vars).sort();
}

export function extractRules(content: TemplateContent): { scope: string; paths: string[] }[] {
  const rules: { scope: string; paths: string[] }[] = [];
  const add = (scope: string, c: unknown) => {
    const paths = conditionPaths(c as Condition | undefined);
    if (paths.length) rules.push({ scope, paths: Array.from(new Set(paths)) });
  };
  for (const s of content.sections) {
    add(`section:${s.id}`, s.when);
    s.blocks.forEach((b, i) => {
      add(`section:${s.id}/block:${i}`, b.when);
      if (b.type === "list") b.items?.forEach((it, j) => typeof it !== "string" && add(`section:${s.id}/block:${i}/item:${j}`, it.when));
      if (b.type === "table") b.rows?.forEach((r, j) => add(`section:${s.id}/block:${i}/row:${j}`, r.when));
    });
  }
  return rules;
}

/** Texto plano del documento (para hash de contenido y búsquedas). */
export function documentToPlainText(doc: RenderedDocument): string {
  const blockText = (b: RenderedBlock): string => {
    switch (b.type) {
      case "paragraph":
      case "heading":
      case "callout":
        return b.text;
      case "list":
        return b.items.join("\n");
      case "table":
        return [b.columns.join(" | "), ...b.rows.map((r) => r.join(" | "))].join("\n");
    }
  };
  return [
    doc.title,
    ...doc.intro.map(blockText),
    ...doc.sections.flatMap((s) => [`${s.number}. ${s.heading}`, ...s.blocks.map(blockText)]),
    ...doc.closing.map(blockText),
  ].join("\n\n");
}
