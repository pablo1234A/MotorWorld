import "server-only";
import type { CategoryCatalog } from "@/domain/categories";
import { getGenerationProvider } from "@/domain/generation/registry";
import { templateProvider } from "@/domain/generation/template-provider";
import { GenerationSystemError, TITLE_VARIANTS, type GeneratedListing, type GenerationOptions } from "@/domain/generation/types";
import type { MarketplaceProfile } from "@/domain/marketplaces/profiles";
import type { UsageState } from "@/domain/plans";
import type { Language, Length, Tone } from "@/domain/product";
import { logger } from "@/lib/logger";
import type { Row } from "@/lib/supabase/types";
import { assertCanEdit, type SessionContext } from "@/server/auth/session";
import { ApiError, notFound } from "@/server/http/errors";
import { fromDbError } from "@/server/http/handler";
import type { GenerateInput } from "@/validation/schemas";
import { loadCategoryCatalog } from "./catalog";
import { toGenerationProduct } from "./products";
import { resolveListingProfile } from "./templates";
import { consumeUsage, refundUsage } from "./usage";

export type ResolvedOptions = { tone: Tone; length: Length; language: Language; titleVariant: number };

export function resolveOptions(
  profile: MarketplaceProfile,
  requested: { tone?: Tone; length?: Length; language?: Language; titleVariant?: number },
): ResolvedOptions {
  return {
    tone: requested.tone ?? profile.defaultTone ?? "professional",
    length: requested.length ?? profile.defaultLength ?? "medium",
    language: requested.language ?? profile.language,
    // La variante 0 respeta la estructura propia del perfil; "Mejorar título" rota desde ahí.
    titleVariant: (profile.titleVariant + (requested.titleVariant ?? 0)) % TITLE_VARIANTS,
  };
}

/** Genera el contenido de un anuncio. No toca el consumo: lo gestiona quien llama. */
export async function generateContent(
  product: Row<"products">,
  catalog: CategoryCatalog,
  imageCount: number,
  profile: MarketplaceProfile,
  options: ResolvedOptions,
): Promise<GeneratedListing> {
  const generationOptions: GenerationOptions = { ...options, profile: { ...profile, language: options.language } };
  const input = toGenerationProduct(product, catalog, imageCount, options.language);
  return getGenerationProvider().generate(input, generationOptions);
}

export type GenerateResult = {
  listing: GeneratedListing;
  options: ResolvedOptions & { platform: string; templateId: string | null };
  usage: UsageState;
  profile: { name: string; titleMaxLength: number; descriptionMaxLength: number; rules: string[] };
};

/**
 * Generación individual con control de consumo:
 * 1. Se registra el intento de forma atómica (falla si no queda cuota).
 * 2. Se genera el contenido.
 * 3. Si falla por un error interno/del proveedor, se devuelve la cuota.
 */
export async function generateForProduct(context: SessionContext, input: GenerateInput): Promise<GenerateResult> {
  assertCanEdit(context);
  const { supabase, workspace } = context;

  const { data: product, error } = await supabase
    .from("products")
    .select("*, product_images(count)")
    .eq("id", input.productId)
    .eq("workspace_id", workspace.id)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!product) throw notFound("El producto");

  const [catalog, resolved] = await Promise.all([
    loadCategoryCatalog(supabase),
    resolveListingProfile(supabase, workspace.id, input.options.platform, input.options.templateId),
  ]);
  const options = resolveOptions(resolved.profile, input.options);
  const usageKey = `gen:${input.idempotencyKey}`;
  const operation = input.operation === "generate" || input.operation === "regenerate" ? "generation" : "refinement";

  const consumed = await consumeUsage(supabase, workspace.id, operation, usageKey, {
    product_id: product.id,
    operation: input.operation,
    platform: resolved.platform,
  });
  if (!consumed.allowed) {
    throw new ApiError("limit_reached", "Has alcanzado el límite mensual de generaciones de tu plan.", { usage: consumed.usage });
  }

  const { product_images: images, ...row } = product;
  let listing: GeneratedListing;
  try {
    listing = await generateContent(row, catalog, images[0]?.count ?? 0, resolved.profile, options);
  } catch (cause) {
    const refunded = await refundUsage(workspace.id, usageKey);
    logger.error("generation.failed", { workspaceId: workspace.id, productId: product.id, refunded, error: cause });
    const detail = cause instanceof GenerationSystemError ? cause.message : "Error interno del generador.";
    throw new ApiError("internal_error", `${detail} ${refunded ? "No se ha descontado ninguna generación." : ""}`.trim());
  }

  return {
    listing,
    options: { ...options, platform: resolved.platform, templateId: resolved.templateId },
    usage: consumed.usage,
    profile: {
      name: resolved.profile.name,
      titleMaxLength: resolved.profile.titleMaxLength,
      descriptionMaxLength: resolved.profile.descriptionMaxLength,
      rules: resolved.profile.rules,
    },
  };
}

export { templateProvider };
