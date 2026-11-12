import { htmlToPlain, looksLikeHtml, plainToHtml, truncateAtWord, uniqueStrings } from "../text";
import { PRODUCT_FIELD_LABELS, type MarketplaceProfile, type ProductField } from "./profiles";

export type ListingContent = {
  title: string;
  description: string;
  shortDescription: string;
  highlights: string[];
  sellingPoints: string[];
  keywords: string[];
  conditionInfo: string;
  cta: string;
};

export type AdaptResult = { content: ListingContent; warnings: string[] };

function hashtagLine(keywords: string[]): string {
  return keywords
    .map((keyword) => `#${keyword.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "")}`)
    .filter((tag) => tag.length > 2)
    .join(" ");
}

/** Recorta una descripción en texto plano respetando párrafos completos cuando es posible. */
export function fitPlainDescription(text: string, max: number): string {
  if (text.length <= max) return text;
  const blocks = text.split(/\n{2,}/);
  let result = "";
  for (const block of blocks) {
    const candidate = result ? `${result}\n\n${block}` : block;
    if (candidate.length > max) break;
    result = candidate;
  }
  return result.length >= max * 0.5 ? result : truncateAtWord(text, max);
}

/**
 * Adapta un anuncio existente (generado o editado a mano) a las reglas de un perfil:
 * límites de caracteres, formato de descripción y número de palabras clave.
 * No añade información nueva: solo recorta y reformatea.
 */
export function adaptListing(content: ListingContent, profile: MarketplaceProfile): AdaptResult {
  const warnings: string[] = [];

  let title = content.title.replace(/\s+/g, " ").trim();
  if (title.length > profile.titleMaxLength) {
    warnings.push(`El título se ha recortado de ${title.length} a ${profile.titleMaxLength} caracteres para ${profile.name}.`);
    title = truncateAtWord(title, profile.titleMaxLength, false);
  }

  const keywords = uniqueStrings(content.keywords).slice(0, profile.maxKeywords);
  let plain = looksLikeHtml(content.description) ? htmlToPlain(content.description) : content.description.trim();
  // Se eliminan hashtags previos para no duplicarlos al cambiar de plataforma.
  plain = plain.replace(/\n+(#[\p{L}\p{N}]+\s*)+$/u, "").trim();

  const tags = profile.hashtags ? hashtagLine(keywords) : "";
  const reserved = tags ? tags.length + 2 : 0;
  const budget = Math.max(100, profile.descriptionMaxLength - reserved);

  if (plain.length > budget) {
    warnings.push(`La descripción se ha recortado a ${profile.descriptionMaxLength} caracteres para ${profile.name}.`);
    plain = fitPlainDescription(plain, budget);
  }
  if (tags) plain = `${plain}\n\n${tags}`;

  let description = plain;
  if (profile.descriptionFormat === "html") {
    description = plainToHtml(plain);
    if (description.length > profile.descriptionMaxLength) {
      description = plainToHtml(fitPlainDescription(plain, Math.floor(profile.descriptionMaxLength * 0.8)));
    }
  }

  return {
    content: {
      ...content,
      title,
      description,
      keywords,
      shortDescription: truncateAtWord(content.shortDescription, 300),
      cta: profile.includeCta ? content.cta : "",
    },
    warnings,
  };
}

export type FieldPresence = Record<ProductField, boolean>;

/** Campos que el perfil considera obligatorios y que el producto todavía no tiene. */
export function missingRequiredFields(profile: MarketplaceProfile, presence: FieldPresence): string[] {
  return profile.requiredFields.filter((field) => !presence[field]).map((field) => PRODUCT_FIELD_LABELS[field]);
}
