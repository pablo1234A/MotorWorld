/** Tipos y catálogos de dominio compartidos entre servidor y cliente (sin dependencias de framework). */

export const CONDITION_CODES = ["new", "like_new", "very_good", "good", "acceptable", "refurbished", "for_parts", "custom"] as const;
export type ConditionCode = (typeof CONDITION_CODES)[number];

export const LANGUAGES = ["es", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

export const CURRENCIES = ["EUR", "USD", "GBP", "MXN", "ARS", "COP", "CLP", "PEN"] as const;
export type Currency = (typeof CURRENCIES)[number];

type ConditionInfo = { label: Record<Language, string>; explanation: Record<Language, string> };

/**
 * Las explicaciones describen el significado general del grado elegido por el usuario;
 * no añaden afirmaciones sobre el producto concreto.
 */
export const CONDITIONS: Record<Exclude<ConditionCode, "custom">, ConditionInfo> = {
  new: {
    label: { es: "Nuevo", en: "New" },
    explanation: { es: "Artículo nuevo, sin uso.", en: "Brand-new, unused item." },
  },
  like_new: {
    label: { es: "Como nuevo", en: "Like new" },
    explanation: { es: "Usado en muy pocas ocasiones y sin marcas de uso apreciables.", en: "Barely used with no noticeable signs of wear." },
  },
  very_good: {
    label: { es: "Muy buen estado", en: "Very good condition" },
    explanation: { es: "Usado con cuidado; puede presentar marcas de uso mínimas.", en: "Carefully used; may show minimal signs of wear." },
  },
  good: {
    label: { es: "Buen estado", en: "Good condition" },
    explanation: { es: "Usado con normalidad; presenta señales de uso.", en: "Normally used; shows signs of wear." },
  },
  acceptable: {
    label: { es: "Aceptable", en: "Acceptable" },
    explanation: { es: "Presenta señales de uso evidentes.", en: "Shows evident signs of wear." },
  },
  refurbished: {
    label: { es: "Reacondicionado", en: "Refurbished" },
    explanation: { es: "Artículo revisado y puesto a punto para su venta.", en: "Item inspected and restored for resale." },
  },
  for_parts: {
    label: { es: "Para reparar", en: "For parts or repair" },
    explanation: { es: "No funciona correctamente o necesita reparación.", en: "Does not work properly or needs repair." },
  },
};

export function conditionLabel(code: ConditionCode, custom: string | null | undefined, language: Language = "es"): string {
  if (code === "custom") return (custom ?? "").trim() || (language === "es" ? "Estado personalizado" : "Custom condition");
  return CONDITIONS[code].label[language];
}

export const CONDITION_OPTIONS = CONDITION_CODES.map((code) => ({
  value: code,
  label: code === "custom" ? "Personalizado" : CONDITIONS[code].label.es,
}));

export const TONES = ["professional", "friendly", "persuasive", "minimal"] as const;
export type Tone = (typeof TONES)[number];
export const TONE_LABELS: Record<Tone, string> = {
  professional: "Profesional",
  friendly: "Cercano",
  persuasive: "Comercial",
  minimal: "Directo",
};

export const LENGTHS = ["short", "medium", "long"] as const;
export type Length = (typeof LENGTHS)[number];
export const LENGTH_LABELS: Record<Length, string> = { short: "Breve", medium: "Estándar", long: "Detallada" };

export const LISTING_STATUSES = ["draft", "ready", "archived"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];
export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = { draft: "Borrador", ready: "Preparado", archived: "Archivado" };

export type AttributeType = "text" | "number" | "select" | "boolean";
export type AttributeValue = string | number | boolean | null;
