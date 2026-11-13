import type { GenerationProduct } from "./generation/types";
import { htmlToPlain, looksLikeHtml } from "./text";

/**
 * Medidor de calidad del anuncio. Evalúa aspectos objetivos y comprobables
 * (longitud, datos presentes, fotografías…); no promete resultados de venta.
 */
export type QualityFacts = {
  hasPrice: boolean;
  imageCount: number;
  hasCategory: boolean;
  hasBrand: boolean;
  missingAttributes: string[];
  hasDefects: boolean;
  condition: string;
};

export type QualityCheck = { id: string; label: string; passed: boolean; weight: number; hint: string; fixable: "text" | "product" };
export type QualityReport = { score: number; level: "excelente" | "bueno" | "mejorable" | "incompleto"; checks: QualityCheck[] };

export function qualityFacts(product: GenerationProduct): QualityFacts {
  return {
    hasPrice: product.price !== null,
    imageCount: product.imageCount,
    hasCategory: Boolean(product.category),
    hasBrand: Boolean(product.brand || product.model),
    missingAttributes: product.missingAttributes,
    hasDefects: product.defects.trim().length > 0,
    condition: product.condition,
  };
}

type Content = { title: string; description: string; keywords: string[] };
type Limits = { titleMaxLength: number; descriptionMaxLength: number };

export function scoreListing(content: Content, facts: QualityFacts, limits: Limits): QualityReport {
  const title = content.title.trim();
  const description = (looksLikeHtml(content.description) ? htmlToPlain(content.description) : content.description).trim();
  const letters = title.replace(/[^\p{L}]/gu, "");
  const shouting = letters.length >= 8 && letters === letters.toUpperCase();
  // En plataformas de texto corto se exige menos longitud de descripción.
  const minDescription = Math.min(180, Math.round(limits.descriptionMaxLength * 0.2));
  const minTitle = Math.min(30, Math.round(limits.titleMaxLength * 0.5));
  const needsDefects = !["new", "like_new"].includes(facts.condition);

  const checks: QualityCheck[] = [
    { id: "title-length", label: "Título descriptivo", weight: 15, fixable: "text", passed: title.length >= minTitle, hint: `Añade al título la marca, el modelo o un dato clave (al menos ${minTitle} caracteres).` },
    { id: "title-limit", label: "Título dentro del límite", weight: 10, fixable: "text", passed: title.length > 0 && title.length <= limits.titleMaxLength, hint: `El título supera los ${limits.titleMaxLength} caracteres de esta plataforma.` },
    { id: "title-style", label: "Título sin mayúsculas ni signos excesivos", weight: 5, fixable: "text", passed: !shouting && !/[!?¡¿]{2,}|[€$]{2,}/.test(title), hint: "Evita escribir todo en mayúsculas o repetir signos: resta credibilidad." },
    { id: "description-length", label: "Descripción completa", weight: 15, fixable: "text", passed: description.length >= minDescription, hint: `Amplía la descripción (al menos ${minDescription} caracteres) con lo que un comprador preguntaría.` },
    { id: "description-limit", label: "Descripción dentro del límite", weight: 5, fixable: "text", passed: content.description.length <= limits.descriptionMaxLength, hint: `La descripción supera los ${limits.descriptionMaxLength} caracteres de esta plataforma.` },
    { id: "keywords", label: "Palabras clave", weight: 5, fixable: "text", passed: content.keywords.length >= 4, hint: "Añade al menos 4 palabras clave por las que te buscarían." },
    { id: "price", label: "Precio indicado", weight: 10, fixable: "product", passed: facts.hasPrice, hint: "Indica el precio en el producto." },
    { id: "photos", label: "Al menos una fotografía", weight: 5, fixable: "product", passed: facts.imageCount >= 1, hint: "Añade fotografías: es lo primero que mira un comprador." },
    { id: "photos-3", label: "Tres o más fotografías", weight: 5, fixable: "product", passed: facts.imageCount >= 3, hint: "Con 3 o más fotos (general, detalle y defectos) el anuncio resuelve más dudas." },
    { id: "category", label: "Categoría y datos clave", weight: 10, fixable: "product", passed: facts.hasCategory && facts.missingAttributes.length === 0, hint: facts.hasCategory ? `Completa en el producto: ${facts.missingAttributes.join(", ")}.` : "Asigna una categoría al producto para ver sus datos clave." },
    { id: "brand", label: "Marca o modelo", weight: 5, fixable: "product", passed: facts.hasBrand, hint: "Si el producto tiene marca o modelo, indícalo: es por lo que más se busca." },
    { id: "defects", label: "Estado explicado con transparencia", weight: 10, fixable: "product", passed: !needsDefects || facts.hasDefects, hint: "Describe las marcas de uso o defectos (o indica que no los tiene): evita devoluciones y regateos." },
  ];

  const total = checks.reduce((sum, check) => sum + check.weight, 0);
  const earned = checks.reduce((sum, check) => sum + (check.passed ? check.weight : 0), 0);
  const score = Math.round((earned / total) * 100);
  const level = score >= 90 ? "excelente" : score >= 75 ? "bueno" : score >= 50 ? "mejorable" : "incompleto";
  return { score, level, checks };
}
