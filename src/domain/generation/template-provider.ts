import { CONDITIONS, conditionLabel, type Language, type Tone } from "../product";
import { adaptListing, missingRequiredFields } from "../marketplaces/adapt";
import { capitalize, firstSentences, includesNormalized, normalizeForCompare, sanitizeLine, sanitizeText, truncateAtWord, uniqueStrings } from "../text";
import { TITLE_VARIANTS, type GeneratedListing, type GenerationOptions, type GenerationProduct, type GenerationProvider } from "./types";

/**
 * Generador por plantillas y reglas. NO es un modelo de IA: compone el anuncio
 * exclusivamente con los datos proporcionados por el usuario y frases fijas.
 * Regla de oro: nunca añade especificaciones, garantías ni condiciones que el
 * usuario no haya indicado; lo que falta se omite y se devuelve en `missingInfo`.
 */

type Phrases = {
  intro: Record<Tone, (name: string, condition: string) => string>;
  features: string;
  condition: string;
  defects: string;
  price: string;
  location: string;
  cta: Record<Tone, string>;
  includes: string;
  battery: (value: string) => string;
  missing: {
    description: string;
    price: string;
    images: string;
    attribute: (label: string) => string;
    platformField: (field: string, platform: string) => string;
  };
  stopwords: Set<string>;
};

const PHRASES: Record<Language, Phrases> = {
  es: {
    intro: {
      professional: (name, condition) => `Se vende ${name}. Estado: ${condition.toLowerCase()}.`,
      friendly: (name, condition) => `¡Hola! Vendo ${name}, ${condition.toLowerCase()}.`,
      persuasive: (name, condition) => `${capitalize(name)}, ${condition.toLowerCase()}. Aquí tienes todos los detalles.`,
      minimal: () => "",
    },
    features: "Características",
    condition: "Estado",
    defects: "Detalles a tener en cuenta",
    price: "Precio",
    location: "Ubicación",
    cta: {
      professional: "Para cualquier consulta, puedes escribirme.",
      friendly: "¿Alguna duda? Escríbeme sin compromiso.",
      persuasive: "Si te interesa, escríbeme y lo concretamos.",
      minimal: "",
    },
    includes: "Incluye",
    battery: (value) => `Batería al ${value}`,
    missing: {
      description: "Añade una descripción o características para obtener un anuncio más completo.",
      price: "No has indicado el precio.",
      images: "Añade fotografías del producto antes de publicar.",
      attribute: (label) => `Falta indicar: ${label}.`,
      platformField: (field, platform) => `${platform} suele requerir: ${field}.`,
    },
    stopwords: new Set(["de", "del", "la", "el", "los", "las", "con", "para", "por", "sin", "una", "uno", "unos", "unas", "en", "al", "que", "muy", "como", "y", "o", "a", "se", "su"]),
  },
  en: {
    intro: {
      professional: (name, condition) => `For sale: ${name}. Condition: ${condition.toLowerCase()}.`,
      friendly: (name, condition) => `Hi! I'm selling this ${name}, ${condition.toLowerCase()}.`,
      persuasive: (name, condition) => `${capitalize(name)}, ${condition.toLowerCase()}. All the details below.`,
      minimal: () => "",
    },
    features: "Features",
    condition: "Condition",
    defects: "Things to note",
    price: "Price",
    location: "Location",
    cta: {
      professional: "Feel free to message me with any questions.",
      friendly: "Any questions? Just send me a message.",
      persuasive: "Interested? Message me and we'll sort out the details.",
      minimal: "",
    },
    includes: "Includes",
    battery: (value) => `Battery at ${value}`,
    missing: {
      description: "Add a description or features to get a more complete listing.",
      price: "No price has been provided.",
      images: "Add product photos before publishing.",
      attribute: (label) => `Missing: ${label}.`,
      platformField: (field, platform) => `${platform} usually requires: ${field}.`,
    },
    stopwords: new Set(["the", "a", "an", "of", "for", "with", "and", "or", "in", "on", "to", "very", "as", "is", "it"]),
  },
};

export function formatPriceText(price: number, currency: string, language: Language): string {
  try {
    return new Intl.NumberFormat(language === "es" ? "es-ES" : "en-US", { style: "currency", currency }).format(price);
  } catch {
    return `${price} ${currency}`;
  }
}

/** Nombre base: añade marca y modelo solo si no están ya contenidos en el nombre. */
function baseName(product: GenerationProduct): string {
  let name = sanitizeLine(product.name, 200);
  const brand = sanitizeLine(product.brand, 120);
  const model = sanitizeLine(product.model, 120);
  if (model && !includesNormalized(name, model)) name = `${name} ${model}`;
  if (brand && !includesNormalized(name, brand)) name = `${brand} ${name}`;
  return name;
}

/**
 * Construye el título comercial. Si no cabe en el límite, va descartando primero
 * el estado y después los atributos menos prioritarios antes de recortar.
 */
export function buildTitle(product: GenerationProduct, variant: number, maxLength: number, language: Language): string {
  const base = baseName(product);
  const condition = conditionLabel(product.condition, product.conditionCustom, language);
  const attrs = product.attributes
    .filter((attribute) => attribute.showInTitle && !includesNormalized(base, attribute.value))
    .map((attribute) => attribute.value);

  const compose = (attributes: string[], withCondition: boolean): string => {
    const v = ((variant % TITLE_VARIANTS) + TITLE_VARIANTS) % TITLE_VARIANTS;
    switch (v) {
      case 1:
        return [base, ...attributes, withCondition ? condition : ""].filter(Boolean).join(" | ");
      case 2:
        return [withCondition ? condition : "", base, ...attributes].filter(Boolean).join(" · ");
      case 3:
        return `${base}${attributes.length ? ` (${attributes.join(", ")})` : ""}`;
      case 4:
        return [base, ...attributes].join(" ");
      default:
        return `${[base, ...attributes].join(" ")}${withCondition ? ` - ${condition}` : ""}`;
    }
  };

  for (const withCondition of [true, false]) {
    for (let count = attrs.length; count >= 0; count -= 1) {
      const candidate = compose(attrs.slice(0, count), withCondition).replace(/\s+/g, " ").trim();
      if (candidate.length <= maxLength) return candidate;
    }
  }
  return truncateAtWord(base, maxLength, false);
}

function buildSellingPoints(product: GenerationProduct, phrases: Phrases, language: Language): string[] {
  const points: string[] = [];
  if (product.condition !== "custom" && ["new", "like_new", "refurbished"].includes(product.condition)) {
    points.push(CONDITIONS[product.condition].label[language]);
  }
  for (const attribute of product.attributes) {
    if (attribute.key === "accesorios" || attribute.key === "incluye") points.push(`${phrases.includes}: ${attribute.value}`);
    else if (attribute.key === "estado_bateria") points.push(phrases.battery(attribute.value));
    else if (attribute.isBoolean && attribute.value !== "No") points.push(attribute.label);
  }
  points.push(...product.features.slice(0, 3).map((feature) => sanitizeLine(feature, 120)));
  return uniqueStrings(points.filter(Boolean)).slice(0, 5);
}

function buildKeywords(product: GenerationProduct, phrases: Phrases, max: number): string[] {
  const candidates: string[] = [];
  if (product.brand) candidates.push(product.brand);
  if (product.model) candidates.push(product.model);
  for (const token of normalizeForCompare(product.name).split(" ")) {
    if (token.length >= 3 && !phrases.stopwords.has(token)) candidates.push(token);
  }
  if (product.subcategory) candidates.push(product.subcategory);
  if (product.category) candidates.push(product.category);
  for (const attribute of product.attributes) {
    if (!attribute.isBoolean && attribute.value.length <= 24 && /[a-zA-Z]/.test(attribute.value) && ["color", "material", "tipo", "plataforma", "combustible", "talla"].includes(attribute.key)) {
      candidates.push(attribute.value);
    }
  }
  return uniqueStrings(candidates.map((candidate) => sanitizeLine(candidate, 40).toLowerCase())).slice(0, max);
}

function buildConditionInfo(product: GenerationProduct, language: Language, detailed: boolean): string {
  const label = conditionLabel(product.condition, product.conditionCustom, language);
  if (product.condition === "custom" || !detailed) return label;
  return `${label}. ${CONDITIONS[product.condition].explanation[language]}`;
}

export function composeListing(product: GenerationProduct, options: GenerationOptions): GeneratedListing {
  const { profile, tone, length } = options;
  const language = options.language;
  const phrases = PHRASES[language];
  const bullet = profile.bullet;

  const name = baseName(product);
  const conditionShort = conditionLabel(product.condition, product.conditionCustom, language);
  const userDescription = sanitizeText(product.description, 6000);
  const defects = sanitizeText(product.defects, 2000);
  const features = uniqueStrings(product.features.map((feature) => sanitizeLine(feature, 200)).filter(Boolean));
  const maxBullets = length === "short" ? 5 : length === "medium" ? 10 : 40;

  const highlights = uniqueStrings([
    ...product.attributes.map((attribute) => `${attribute.label}: ${attribute.value}`),
    ...features,
  ]);

  const title = buildTitle(product, options.titleVariant, profile.titleMaxLength, language);
  const conditionInfo = buildConditionInfo(product, language, length === "long");

  const sections: string[] = [];
  const intro = profile.customIntro ? sanitizeLine(profile.customIntro, 300) : phrases.intro[tone](name, conditionShort);
  if (intro) sections.push(intro);
  if (userDescription) sections.push(length === "short" ? firstSentences(userDescription, 280) : userDescription);
  if (highlights.length > 0) {
    sections.push([`${phrases.features}:`, ...highlights.slice(0, maxBullets).map((item) => `${bullet} ${item}`)].join("\n"));
  }
  // El estado y los defectos se incluyen siempre: forman parte de un anuncio honesto.
  const conditionBlock = [`${phrases.condition}: ${length === "long" ? conditionInfo : conditionShort}`];
  if (defects) conditionBlock.push(`${phrases.defects}: ${defects}`);
  if (!intro || defects || length === "long") sections.push(conditionBlock.join("\n"));
  if (profile.includePrice && product.price !== null) {
    sections.push(`${phrases.price}: ${formatPriceText(product.price, product.currency, language)}`);
  }
  if (profile.includeLocation && product.location && length !== "short") {
    sections.push(`${phrases.location}: ${sanitizeLine(product.location, 160)}`);
  }
  const cta = profile.includeCta ? (profile.customCta ? sanitizeLine(profile.customCta, 300) : phrases.cta[tone]) : "";
  if (cta) sections.push(cta);

  const shortParts = [name, conditionShort];
  if (product.price !== null) shortParts.push(formatPriceText(product.price, product.currency, language));
  let shortDescription = shortParts.join(" · ");
  const firstLine = userDescription ? firstSentences(userDescription.replace(/\n+/g, " "), 140) : "";
  if (firstLine && length !== "short") shortDescription = `${shortDescription}. ${firstLine}`;

  const missingInfo: string[] = [];
  if (!userDescription && highlights.length === 0) missingInfo.push(phrases.missing.description);
  if (product.price === null) missingInfo.push(phrases.missing.price);
  for (const label of product.missingAttributes) missingInfo.push(phrases.missing.attribute(label));
  if (product.imageCount === 0) missingInfo.push(phrases.missing.images);
  const platformMissing = missingRequiredFields(profile, {
    name: Boolean(product.name),
    price: product.price !== null,
    category: Boolean(product.category),
    brand: Boolean(product.brand),
    condition: true,
    description: Boolean(userDescription),
    images: product.imageCount > 0,
    location: Boolean(product.location),
  }).filter((field) => !["Precio", "Fotografías"].includes(field) || profile.id !== "generic");
  for (const field of platformMissing) {
    const message = phrases.missing.platformField(field, profile.name);
    if (!missingInfo.some((existing) => existing.toLowerCase().includes(field.toLowerCase()))) missingInfo.push(message);
  }

  const adapted = adaptListing(
    {
      title,
      description: sections.join("\n\n"),
      shortDescription: truncateAtWord(shortDescription, 300),
      highlights: highlights.slice(0, 12),
      sellingPoints: buildSellingPoints(product, phrases, language),
      keywords: buildKeywords(product, phrases, profile.maxKeywords),
      conditionInfo: defects ? `${conditionInfo}\n${phrases.defects}: ${defects}` : conditionInfo,
      cta,
    },
    profile,
  );

  return { ...adapted.content, missingInfo: uniqueStrings(missingInfo), warnings: adapted.warnings, method: "template", providerId: "template" };
}

export const templateProvider: GenerationProvider = {
  id: "template",
  method: "template",
  label: "Plantillas inteligentes",
  async generate(product, options) {
    return composeListing(product, options);
  },
};
