import type { ResolvedAttribute } from "../categories";
import type { MarketplaceProfile } from "../marketplaces/profiles";
import type { ConditionCode, Language, Length, Tone } from "../product";

/** Datos del producto que el generador puede utilizar. Solo se usa lo que el usuario ha proporcionado. */
export type GenerationProduct = {
  name: string;
  category: string | null;
  subcategory: string | null;
  brand: string | null;
  model: string | null;
  price: number | null;
  currency: string;
  condition: ConditionCode;
  conditionCustom: string | null;
  description: string;
  features: string[];
  defects: string;
  location: string | null;
  attributes: ResolvedAttribute[];
  /** Atributos que la categoría solicita y que no se han informado. */
  missingAttributes: string[];
  imageCount: number;
};

export type GenerationOptions = {
  tone: Tone;
  length: Length;
  language: Language;
  /** Variante de estructura del título; "Mejorar título" rota entre variantes. */
  titleVariant: number;
  profile: MarketplaceProfile;
};

export type GenerationMethod = "template" | "ai";

export type GeneratedListing = {
  title: string;
  description: string;
  shortDescription: string;
  highlights: string[];
  sellingPoints: string[];
  keywords: string[];
  conditionInfo: string;
  cta: string;
  /** Información que conviene pedir al usuario para mejorar el anuncio. */
  missingInfo: string[];
  warnings: string[];
  method: GenerationMethod;
  providerId: string;
};

/**
 * Contrato de un proveedor de generación. Para añadir un modelo nuevo basta con
 * implementar esta interfaz y registrarlo en registry.ts.
 */
export interface GenerationProvider {
  readonly id: string;
  readonly method: GenerationMethod;
  /** Nombre visible. El modo de plantillas nunca se presenta como IA. */
  readonly label: string;
  generate(product: GenerationProduct, options: GenerationOptions): Promise<GeneratedListing>;
}

/** Fallo atribuible al sistema o al proveedor externo: no consume cuota del usuario. */
export class GenerationSystemError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GenerationSystemError";
  }
}

export const TITLE_VARIANTS = 5;
