import type { Language, Length, Tone } from "../product";

export type ProductField = "name" | "price" | "category" | "brand" | "condition" | "description" | "images" | "location";

export const PRODUCT_FIELD_LABELS: Record<ProductField, string> = {
  name: "Nombre",
  price: "Precio",
  category: "Categoría",
  brand: "Marca",
  condition: "Estado",
  description: "Descripción",
  images: "Fotografías",
  location: "Ubicación",
};

export type DescriptionFormat = "plain" | "html";

/**
 * Perfil de presentación de un marketplace.
 *
 * IMPORTANTE: AnunciaPro no tiene integración oficial con ninguna de estas
 * plataformas. Los perfiles solo preparan el texto para copiarlo o exportarlo.
 * Los límites son valores orientativos y editables: cada plataforma puede
 * cambiarlos, por lo que deben verificarse antes de publicar.
 */
export type MarketplaceProfile = {
  id: string;
  name: string;
  language: Language;
  titleMaxLength: number;
  descriptionMaxLength: number;
  descriptionFormat: DescriptionFormat;
  bullet: string;
  /** Variante de estructura del título (ver buildTitle). */
  titleVariant: number;
  includePrice: boolean;
  includeCta: boolean;
  includeLocation: boolean;
  maxKeywords: number;
  /** Añade las palabras clave como hashtags al final de la descripción. */
  hashtags: boolean;
  requiredFields: ProductField[];
  optionalFields: ProductField[];
  /** Reglas de presentación explicadas al usuario. */
  rules: string[];
  defaultTone?: Tone;
  defaultLength?: Length;
  /** Textos fijos opcionales definidos en plantillas personalizadas. */
  customIntro?: string;
  customCta?: string;
};

const base: Omit<MarketplaceProfile, "id" | "name" | "rules"> = {
  language: "es",
  titleMaxLength: 120,
  descriptionMaxLength: 5000,
  descriptionFormat: "plain",
  bullet: "•",
  titleVariant: 0,
  includePrice: false,
  includeCta: true,
  includeLocation: true,
  maxKeywords: 12,
  hashtags: false,
  requiredFields: ["name"],
  optionalFields: ["price", "category", "brand", "condition", "description", "images", "location"],
};

export const MARKETPLACE_PROFILES = {
  generic: {
    ...base,
    id: "generic",
    name: "Genérico",
    rules: ["Formato neutro en texto plano, válido para cualquier plataforma o para tu propia web."],
  },
  wallapop: {
    ...base,
    id: "wallapop",
    name: "Wallapop",
    titleMaxLength: 50,
    descriptionMaxLength: 640,
    titleVariant: 3,
    maxKeywords: 8,
    requiredFields: ["name", "price", "category", "description"],
    optionalFields: ["brand", "condition", "images", "location"],
    defaultLength: "short",
    rules: ["Título muy corto y directo.", "Descripción breve en texto plano, con lo esencial primero.", "El precio se indica en su propio campo, no en el texto."],
  },
  vinted: {
    ...base,
    id: "vinted",
    name: "Vinted",
    titleMaxLength: 100,
    descriptionMaxLength: 3000,
    titleVariant: 0,
    hashtags: true,
    maxKeywords: 8,
    requiredFields: ["name", "price", "category", "brand", "condition", "images"],
    optionalFields: ["description", "location"],
    defaultTone: "friendly",
    rules: ["Tono cercano.", "Marca, talla y estado visibles.", "Palabras clave al final en forma de hashtags."],
  },
  ebay: {
    ...base,
    id: "ebay",
    name: "eBay",
    titleMaxLength: 80,
    descriptionMaxLength: 4000,
    descriptionFormat: "html",
    titleVariant: 1,
    includeCta: false,
    includeLocation: false,
    requiredFields: ["name", "price", "category", "condition"],
    optionalFields: ["brand", "description", "images", "location"],
    rules: ["Título denso en palabras clave (marca, modelo y atributos).", "Descripción estructurada en HTML sencillo.", "Sin datos de contacto en el texto."],
  },
  shopify: {
    ...base,
    id: "shopify",
    name: "Shopify",
    titleMaxLength: 255,
    descriptionMaxLength: 5000,
    descriptionFormat: "html",
    titleVariant: 4,
    includeCta: false,
    includeLocation: false,
    requiredFields: ["name", "price"],
    optionalFields: ["category", "brand", "condition", "description", "images"],
    defaultLength: "long",
    rules: ["Título limpio de producto, sin estado ni reclamos.", "Descripción en HTML para la ficha de producto.", "Las palabras clave se exportan como etiquetas (tags)."],
  },
  facebook_marketplace: {
    ...base,
    id: "facebook_marketplace",
    name: "Facebook Marketplace",
    titleMaxLength: 100,
    descriptionMaxLength: 2000,
    titleVariant: 0,
    maxKeywords: 10,
    requiredFields: ["name", "price", "category", "condition", "location"],
    optionalFields: ["brand", "description", "images"],
    defaultTone: "friendly",
    rules: ["Título claro con el estado.", "Descripción conversacional en texto plano.", "Indica la zona de entrega."],
  },
} satisfies Record<string, MarketplaceProfile>;

export type MarketplaceId = keyof typeof MARKETPLACE_PROFILES;
export const MARKETPLACE_IDS = Object.keys(MARKETPLACE_PROFILES) as MarketplaceId[];

export const MARKETPLACE_OPTIONS = MARKETPLACE_IDS.map((id) => ({ value: id, label: MARKETPLACE_PROFILES[id].name }));

export function platformName(id: string): string {
  if (id === "custom") return "Personalizado";
  return (MARKETPLACE_PROFILES as Record<string, MarketplaceProfile>)[id]?.name ?? id;
}

/** Ajustes que una plantilla personalizada puede sobrescribir sobre el perfil base. */
export type TemplateConfiguration = Partial<
  Pick<
    MarketplaceProfile,
    | "language"
    | "titleMaxLength"
    | "descriptionMaxLength"
    | "descriptionFormat"
    | "titleVariant"
    | "includePrice"
    | "includeCta"
    | "includeLocation"
    | "maxKeywords"
    | "hashtags"
    | "defaultTone"
    | "defaultLength"
    | "customIntro"
    | "customCta"
  >
>;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.trunc(value)));

/** Combina el perfil base de la plataforma con la configuración de una plantilla personalizada. */
export function resolveProfile(platform: string, configuration?: TemplateConfiguration | null, templateName?: string): MarketplaceProfile {
  const profiles = MARKETPLACE_PROFILES as Record<string, MarketplaceProfile>;
  const baseProfile: MarketplaceProfile =
    profiles[platform] ?? { ...MARKETPLACE_PROFILES.generic, id: platform, name: templateName ?? "Personalizado", rules: ["Perfil personalizado definido por el usuario."] };
  if (!configuration) return baseProfile;
  const merged: MarketplaceProfile = { ...baseProfile };
  const c = configuration;
  if (c.language === "es" || c.language === "en") merged.language = c.language;
  if (typeof c.titleMaxLength === "number") merged.titleMaxLength = clamp(c.titleMaxLength, 20, 300);
  if (typeof c.descriptionMaxLength === "number") merged.descriptionMaxLength = clamp(c.descriptionMaxLength, 100, 20000);
  if (c.descriptionFormat === "plain" || c.descriptionFormat === "html") merged.descriptionFormat = c.descriptionFormat;
  if (typeof c.titleVariant === "number") merged.titleVariant = clamp(c.titleVariant, 0, 4);
  if (typeof c.includePrice === "boolean") merged.includePrice = c.includePrice;
  if (typeof c.includeCta === "boolean") merged.includeCta = c.includeCta;
  if (typeof c.includeLocation === "boolean") merged.includeLocation = c.includeLocation;
  if (typeof c.maxKeywords === "number") merged.maxKeywords = clamp(c.maxKeywords, 0, 30);
  if (typeof c.hashtags === "boolean") merged.hashtags = c.hashtags;
  if (c.defaultTone) merged.defaultTone = c.defaultTone;
  if (c.defaultLength) merged.defaultLength = c.defaultLength;
  if (c.customIntro) merged.customIntro = c.customIntro.slice(0, 300);
  if (c.customCta) merged.customCta = c.customCta.slice(0, 300);
  if (templateName) merged.name = `${templateName} (${baseProfile.name})`;
  return merged;
}
