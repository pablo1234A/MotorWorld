import { z } from "zod";

/**
 * DSL de condiciones declarativas.
 * Se usa tanto en el cuestionario (qué preguntas se muestran) como en las
 * plantillas (qué bloques se incluyen). Es serializable a JSON para poder
 * almacenarse en base de datos y editarse desde administración.
 */
export type Primitive = string | number | boolean | null;

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { truthy: string }
  | { falsy: string }
  | { nonEmpty: string }
  | { eq: [string, Primitive] }
  | { in: [string, Primitive[]] }
  | { includes: [string, Primitive] };

const primitive = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const path = z.string().regex(/^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)*$/i, "Ruta de variable no válida");

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(conditionSchema).min(1) }).strict(),
    z.object({ any: z.array(conditionSchema).min(1) }).strict(),
    z.object({ not: conditionSchema }).strict(),
    z.object({ truthy: path }).strict(),
    z.object({ falsy: path }).strict(),
    z.object({ nonEmpty: path }).strict(),
    z.object({ eq: z.tuple([path, primitive]) }).strict(),
    z.object({ in: z.tuple([path, z.array(primitive).min(1)]) }).strict(),
    z.object({ includes: z.tuple([path, primitive]) }).strict(),
  ]),
);

export function getPath(source: unknown, dotted: string): unknown {
  let current: unknown = source;
  for (const key of dotted.split(".")) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    // Evita acceder a propiedades heredadas del prototipo (p. ej. "constructor").
    if (!Object.prototype.hasOwnProperty.call(current, key)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function evaluate(condition: Condition | undefined, ctx: unknown): boolean {
  if (!condition) return true;
  if ("all" in condition) return condition.all.every((c) => evaluate(c, ctx));
  if ("any" in condition) return condition.any.some((c) => evaluate(c, ctx));
  if ("not" in condition) return !evaluate(condition.not, ctx);
  if ("truthy" in condition) {
    const v = getPath(ctx, condition.truthy);
    return Array.isArray(v) ? v.length > 0 : Boolean(v);
  }
  if ("falsy" in condition) {
    const v = getPath(ctx, condition.falsy);
    return Array.isArray(v) ? v.length === 0 : !v;
  }
  if ("nonEmpty" in condition) return !isEmpty(getPath(ctx, condition.nonEmpty));
  if ("eq" in condition) return getPath(ctx, condition.eq[0]) === condition.eq[1];
  if ("in" in condition) return condition.in[1].includes(getPath(ctx, condition.in[0]) as Primitive);
  if ("includes" in condition) {
    const v = getPath(ctx, condition.includes[0]);
    return Array.isArray(v) && v.includes(condition.includes[1]);
  }
  return false;
}

/** Devuelve todas las rutas de variables referenciadas por una condición. */
export function conditionPaths(condition: Condition | undefined): string[] {
  if (!condition) return [];
  if ("all" in condition) return condition.all.flatMap(conditionPaths);
  if ("any" in condition) return condition.any.flatMap(conditionPaths);
  if ("not" in condition) return conditionPaths(condition.not);
  if ("truthy" in condition) return [condition.truthy];
  if ("falsy" in condition) return [condition.falsy];
  if ("nonEmpty" in condition) return [condition.nonEmpty];
  if ("eq" in condition) return [condition.eq[0]];
  if ("in" in condition) return [condition.in[0]];
  if ("includes" in condition) return [condition.includes[0]];
  return [];
}
