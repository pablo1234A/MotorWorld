import { CONDITIONS, conditionLabel, type Language } from "../product";
import { adaptListing, missingRequiredFields } from "../marketplaces/adapt";
import { capitalize, firstSentences, includesNormalized, normalizeForCompare, sanitizeLine, sanitizeText, truncateAtWord, uniqueStrings } from "../text";
import { ATTRIBUTE_CLAUSES, BOOLEAN_CLAUSES, BRAND_FIRST, CONDITION_COPY, LABELS, OPENINGS, attributesToProse, familyOf, joinList, pick, polishUserText, seedFrom } from "./copy";
import { TITLE_VARIANTS, type GeneratedListing, type GenerationOptions, type GenerationProduct, type GenerationProvider } from "./types";

/**
 * Generador por plantillas y reglas. NO es un modelo de IA: redacta el anuncio
 * exclusivamente con los datos proporcionados por el usuario.
 *
 * Regla de oro: nunca añade especificaciones, garantías, motivos de venta ni
 * condiciones que el usuario no haya indicado; lo que falta se omite y se
 * devuelve en `missingInfo`. Hay pruebas que lo verifican para todos los tonos
 * y variaciones (tests/unit/generation.test.ts).
 */

const MISSING: Record<Language, { description: string; price: string; images: string; defects: string; attribute: (label: string) => string; platformField: (field: string, platform: string) => string }> = {
  es: {
    description: "Añade una descripción o características para obtener un anuncio más completo.",
    price: "No has indicado el precio.",
    images: "Añade fotografías del producto antes de publicar.",
    defects: "Si tiene alguna marca o defecto, indícalo: los anuncios transparentes generan más confianza.",
    attribute: (label) => `Falta indicar: ${label}.`,
    platformField: (field, platform) => `${platform} suele requerir: ${field}.`,
  },
  en: {
    description: "Add a description or features to get a more complete listing.",
    price: "No price has been provided.",
    images: "Add product photos before publishing.",
    defects: "If it has any marks or defects, mention them: transparent listings build trust.",
    attribute: (label) => `Missing: ${label}.`,
    platformField: (field, platform) => `${platform} usually requires: ${field}.`,
  },
};

const STOPWORDS: Record<Language, Set<string>> = {
  es: new Set(["de", "del", "la", "el", "los", "las", "con", "para", "por", "sin", "una", "uno", "unos", "unas", "en", "al", "que", "muy", "como", "y", "o", "a", "se", "su"]),
  en: new Set(["the", "a", "an", "of", "for", "with", "and", "or", "in", "on", "to", "very", "as", "is", "it"]),
};

export function formatPriceText(price: number, currency: string, language: Language): string {
  try {
    return new Intl.NumberFormat(language === "es" ? "es-ES" : "en-US", { style: "currency", currency, maximumFractionDigits: Number.isInteger(price) ? 0 : 2 }).format(price);
  } catch {
    return `${price} ${currency}`;
  }
}

/** Pone mayúscula inicial sin estropear nombres como «iPhone» o «eBook». */
function capitalizeName(value: string): string {
  return /^\p{Ll}\p{Ll}/u.test(value) ? capitalize(value) : value;
}

/**
 * Dentro de una frase, un nombre común va en minúscula («Vendo sofá…»). Se respeta
 * la mayúscula en familias donde el nombre suele ser propio (tecnología, vehículos)
 * y cuando la primera palabra parece una marca o un modelo.
 */
function inSentence(name: string, product: GenerationProduct): string {
  if (BRAND_FIRST.has(familyOf(product.categorySlug))) return name;
  const first = name.split(" ")[0] ?? "";
  const isProper = /\d/.test(first) || /\p{Lu}/u.test(first.slice(1)) || [product.brand, product.model].some((value) => value && normalizeForCompare(value).split(" ")[0] === normalizeForCompare(first));
  return isProper ? name : `${name.charAt(0).toLowerCase()}${name.slice(1)}`;
}

/**
 * Nombre base: añade marca y modelo solo si no están ya contenidos en el nombre.
 * En tecnología, vehículos y herramientas la marca va delante («Apple iPhone 13»);
 * en el resto, detrás («Abrigo de lana Mango»), que es como se busca y se lee.
 */
function baseName(product: GenerationProduct): string {
  const name = capitalizeName(sanitizeLine(product.name, 200));
  const brand = sanitizeLine(product.brand, 120);
  const model = sanitizeLine(product.model, 120);
  const brandFirst = BRAND_FIRST.has(familyOf(product.categorySlug));
  const addBrand = brand && !includesNormalized(name, brand);
  const addModel = model && !includesNormalized(name, model);
  if (brandFirst) return [addBrand ? brand : "", name, addModel ? model : ""].filter(Boolean).join(" ");
  // «Taladro percutor Bosch GSB 18V-55», «Abrigo de lana Mango».
  return [name, addBrand ? brand : "", addModel ? model : ""].filter(Boolean).join(" ");
}

function conditionPhrase(product: GenerationProduct, language: Language): string {
  if (product.condition === "custom") {
    const custom = sanitizeLine(product.conditionCustom, 120);
    return custom ? `${language === "es" ? "estado" : "condition"}: ${custom.charAt(0).toLowerCase()}${custom.slice(1)}` : "";
  }
  return CONDITION_COPY[language][product.condition].phrase;
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
        return `${base}${attributes.length ? ` - ${attributes.join(" / ")}` : ""}`;
      default:
        return `${[base, ...attributes].join(" · ")}${withCondition ? ` · ${condition}` : ""}`;
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

function buildSellingPoints(product: GenerationProduct, language: Language, userDescription: string): string[] {
  const points: string[] = [];
  if (product.condition !== "custom" && ["new", "like_new", "refurbished"].includes(product.condition)) {
    points.push(capitalize(CONDITION_COPY[language][product.condition].phrase));
  }
  for (const attribute of product.attributes) {
    if (attribute.key === "accesorios" || attribute.key === "incluye") points.push(`${LABELS[language].includes}: ${attribute.value}`);
    else if (attribute.key === "estado_bateria") points.push(language === "es" ? `Batería al ${attribute.value}` : `Battery at ${attribute.value}`);
    else if (attribute.isBoolean && attribute.value !== "No") points.push(capitalize(BOOLEAN_CLAUSES[language][attribute.key] ?? attribute.label));
  }
  points.push(...product.features.slice(0, 3).map((feature) => sanitizeLine(feature, 120)));
  // Las frases breves que ha escrito el propio vendedor suelen ser sus mejores argumentos.
  const own = (userDescription.match(/[^.!?\n]+/g) ?? []).map((sentence) => sentence.trim()).filter((sentence) => sentence.length >= 12 && sentence.length <= 70);
  if (product.condition !== "for_parts") points.push(...own.slice(0, 2));
  return uniqueStrings(points.filter(Boolean)).slice(0, 5);
}

function buildKeywords(product: GenerationProduct, language: Language, max: number): string[] {
  const candidates: string[] = [];
  const tokens = sanitizeLine(product.name, 200)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 3 && !STOPWORDS[language].has(token));
  if (product.brand && product.model) candidates.push(`${product.brand} ${product.model}`);
  if (product.brand) candidates.push(product.brand);
  if (product.model) candidates.push(product.model);
  // El nombre completo es la búsqueda más habitual; después, sus palabras sueltas.
  if (tokens.length > 1 && tokens.length <= 4) candidates.push(tokens.join(" "));
  candidates.push(...tokens);
  if (product.subcategory) candidates.push(product.subcategory);
  if (product.category) candidates.push(product.category);
  for (const attribute of product.attributes) {
    if (!attribute.isBoolean && attribute.value.length >= 2 && attribute.value.length <= 24 && /[a-zA-Z]/.test(attribute.value) && ["color", "material", "tipo", "plataforma", "combustible", "almacenamiento"].includes(attribute.key)) {
      candidates.push(attribute.value);
    }
  }
  return uniqueStrings(candidates.map((candidate) => sanitizeLine(candidate, 40).toLowerCase())).slice(0, max);
}

export function composeListing(product: GenerationProduct, options: GenerationOptions): GeneratedListing {
  const { profile, tone, length, language } = options;
  const labels = LABELS[language];
  const missing = MISSING[language];
  const bullet = profile.bullet;
  const seed = seedFrom(`${product.name}|${product.brand ?? ""}`, options.variation ?? 0);

  const name = baseName(product);
  const conditionShort = conditionLabel(product.condition, product.conditionCustom, language);
  const phrase = conditionPhrase(product, language);
  const userDescription = polishUserText(sanitizeText(product.description, 6000));
  const defects = polishUserText(sanitizeText(product.defects, 2000));
  const allFeatures = uniqueStrings(product.features.map((feature) => sanitizeLine(feature, 200)).filter(Boolean));
  // Una característica que el usuario ya ha escrito en su descripción no se repite en el texto.
  const described = new Set(normalizeForCompare(userDescription).split(" "));
  const features = allFeatures.filter((feature) => {
    const words = normalizeForCompare(feature).split(" ").filter((word) => word.length >= 4);
    return words.length === 0 || !words.every((word) => described.has(word));
  });

  const highlights = uniqueStrings([...product.attributes.map((attribute) => `${attribute.label}: ${attribute.value}`), ...allFeatures]);
  const title = buildTitle(product, options.titleVariant, profile.titleMaxLength, language);

  // --- Apertura: nombre + los datos más relevantes + estado, en una sola frase.
  const hookAttributes = product.attributes.filter((attribute) => attribute.showInTitle && !attribute.isBoolean && !includesNormalized(name, attribute.value)).slice(0, 3);
  const hookFacts = joinList(
    hookAttributes.map((attribute) => (ATTRIBUTE_CLAUSES[language][attribute.key] ? ATTRIBUTE_CLAUSES[language][attribute.key]!(attribute.value) : attribute.value)).filter(Boolean),
    language,
  );
  const hookKeys = new Set(hookAttributes.map((attribute) => attribute.key));

  const sections: string[] = [];
  let opening = "";
  if (profile.customIntro) opening = sanitizeLine(profile.customIntro, 300);
  else if (tone !== "minimal") {
    const template = pick(OPENINGS[language][tone], seed, 1);
    opening = capitalize(template(inSentence(name, product), hookFacts, phrase || conditionShort.toLowerCase()).replace(/\s+/g, " "));
  }
  if (opening) sections.push(opening);

  // --- Lo que cuenta el usuario, con sus palabras.
  if (userDescription) sections.push(length === "short" ? firstSentences(userDescription, 260) : userDescription);

  // --- Atributos en lenguaje natural (los de la apertura no se repiten).
  const prose = attributesToProse(product.attributes, language, tone === "minimal" || profile.customIntro ? new Set() : hookKeys);
  const proseKeys = new Set([...prose.used, ...(tone === "minimal" || profile.customIntro ? [] : hookKeys)]);
  if (tone !== "minimal" && prose.sentences.length > 0) {
    sections.push(prose.sentences.slice(0, length === "short" ? 3 : 6).join(" "));
  }

  // --- Lista: lo que no se ha dicho en prosa. En «detallada» o «directo», la ficha completa.
  const fullSheet = length === "long" || tone === "minimal";
  const listed = product.attributes.filter((attribute) => fullSheet || (!proseKeys.has(attribute.key) && !includesNormalized(name, attribute.value))).map((attribute) => `${attribute.label}: ${attribute.value}`);
  const maxBullets = length === "short" ? 5 : length === "medium" ? 10 : 40;
  const bullets = uniqueStrings([...listed, ...features]).slice(0, maxBullets);
  if (listed.length === 0 && features.length > 0 && features.length <= 3 && tone !== "minimal" && features.every((feature) => feature.length <= 60)) {
    // Dos o tres características sueltas se leen mejor como frase que como lista.
    const also = language === "es" ? "Además" : "Also";
    sections.push(`${also}: ${joinList(features.map((feature) => `${feature.charAt(0).toLowerCase()}${feature.slice(1)}`.replace(/\.$/, "")), language)}.`);
  } else if (bullets.length > 0) {
    const heading = fullSheet && listed.length > 0 ? labels.specs : pick(labels.details, seed, 2);
    sections.push([`${heading}:`, ...bullets.map((item) => `${bullet} ${item}`)].join("\n"));
  }

  // --- Estado y defectos. Los defectos se incluyen SIEMPRE: forman parte de un anuncio honesto.
  const conditionSentence = product.condition === "custom" ? `${labels.noteCondition}: ${conditionShort}.` : pick(CONDITION_COPY[language][product.condition].sentence, seed, 3);
  const conditionBlock: string[] = [];
  if (!opening || profile.customIntro || tone === "minimal") conditionBlock.push(tone === "minimal" && phrase ? `${capitalize(phrase)}.` : conditionSentence);
  if (defects) conditionBlock.push(`${pick(labels.defects, seed, 4)}: ${defects.charAt(0).toLowerCase()}${defects.slice(1)}`);
  if (conditionBlock.length > 0) sections.push(conditionBlock.join("\n"));

  if (profile.includePrice && product.price !== null) sections.push(`${labels.price}: ${formatPriceText(product.price, product.currency, language)}`);
  if (profile.includeLocation && product.location && length !== "short") {
    const location = pick(labels.location, seed, 5);
    sections.push(`${location} ${sanitizeLine(product.location, 160)}${location.endsWith(":") ? "" : "."}`);
  }
  const cta = profile.includeCta ? (profile.customCta ? sanitizeLine(profile.customCta, 300) : pick(labels.cta[tone], seed, 6)) : "";
  if (cta) sections.push(cta);

  // --- Descripción breve: nombre, dato clave, estado y precio.
  const shortFacts = hookFacts ? ` (${hookAttributes.map((attribute) => attribute.value).join(", ")})` : "";
  let shortDescription = `${name}${shortFacts}, ${phrase || conditionShort.toLowerCase()}.`;
  if (product.price !== null) shortDescription += ` ${formatPriceText(product.price, product.currency, language)}.`;
  const firstLine = userDescription ? firstSentences(userDescription.replace(/\n+/g, " "), 120) : "";
  if (firstLine && length !== "short") shortDescription += ` ${firstLine}`;

  const conditionInfo = product.condition === "custom" ? conditionShort : `${conditionShort}. ${length === "long" ? CONDITIONS[product.condition].explanation[language] : conditionSentence}`;

  // --- Información que conviene pedir.
  const missingInfo: string[] = [];
  if (!userDescription && highlights.length === 0) missingInfo.push(missing.description);
  if (product.price === null) missingInfo.push(missing.price);
  for (const label of product.missingAttributes) missingInfo.push(missing.attribute(label));
  if (product.imageCount === 0) missingInfo.push(missing.images);
  if (!defects && ["good", "acceptable", "for_parts"].includes(product.condition)) missingInfo.push(missing.defects);
  const platformMissing = missingRequiredFields(profile, {
    name: Boolean(product.name),
    price: product.price !== null,
    category: Boolean(product.category),
    brand: Boolean(product.brand),
    condition: true,
    description: Boolean(userDescription),
    images: product.imageCount > 0,
    location: Boolean(product.location),
  });
  for (const field of platformMissing) {
    if (!missingInfo.some((existing) => existing.toLowerCase().includes(field.toLowerCase().slice(0, 6)))) missingInfo.push(missing.platformField(field, profile.name));
  }

  const adapted = adaptListing(
    {
      title,
      description: sections.join("\n\n"),
      shortDescription: truncateAtWord(shortDescription, 300),
      highlights: highlights.slice(0, 12),
      sellingPoints: buildSellingPoints(product, language, userDescription),
      keywords: buildKeywords(product, language, profile.maxKeywords),
      conditionInfo: defects ? `${conditionInfo}\n${labels.defects[0]}: ${defects}` : conditionInfo,
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
