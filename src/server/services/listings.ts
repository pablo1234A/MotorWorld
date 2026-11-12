import "server-only";
import { adaptListing, type ListingContent } from "@/domain/marketplaces/adapt";
import { exportListings, type ExportableListing, type ExportFile } from "@/domain/marketplaces/export";
import { canExport, EXPORT_FORMAT_LABELS, type ExportFormat } from "@/domain/plans";
import { sanitizeLine, sanitizeText } from "@/domain/text";
import type { Json, Row } from "@/lib/supabase/types";
import { assertCanEdit, type SessionContext } from "@/server/auth/session";
import { ApiError, notFound } from "@/server/http/errors";
import { fromDbError } from "@/server/http/handler";
import type { ListingCreateInput, ListingListQuery, ListingUpdateInput } from "@/validation/schemas";
import { audit } from "./audit";
import { sanitizeSearch, type Paginated } from "./products";
import { resolveListingProfile } from "./templates";
import { getUsage } from "./usage";

export type ListingListItem = Row<"listings"> & { productName: string; isFavorite: boolean };
export type ListingDetail = Row<"listings"> & {
  product: Pick<Row<"products">, "id" | "name" | "sku" | "brand" | "model" | "price" | "currency" | "condition" | "archived_at">;
  isFavorite: boolean;
};

const strings = (value: Json): string[] => (Array.isArray(value) ? value.map(String) : []);

export function listingContent(row: Pick<Row<"listings">, "title" | "description" | "short_description" | "highlights" | "selling_points" | "keywords" | "condition_info" | "cta">): ListingContent {
  return {
    title: row.title,
    description: row.description,
    shortDescription: row.short_description,
    highlights: strings(row.highlights),
    sellingPoints: strings(row.selling_points),
    keywords: strings(row.keywords),
    conditionInfo: row.condition_info,
    cta: row.cta,
  };
}

/** El contenido de usuario se guarda como texto; el HTML peligroso se elimina siempre en servidor. */
function cleanContent(input: Partial<ListingContent>) {
  const patch: Partial<Row<"listings">> = {};
  if (input.title !== undefined) patch.title = sanitizeLine(input.title, 300);
  if (input.description !== undefined) patch.description = sanitizeDescription(input.description);
  if (input.shortDescription !== undefined) patch.short_description = sanitizeLine(input.shortDescription, 600);
  if (input.highlights !== undefined) patch.highlights = input.highlights.map((item) => sanitizeLine(item, 300)).filter(Boolean);
  if (input.sellingPoints !== undefined) patch.selling_points = input.sellingPoints.map((item) => sanitizeLine(item, 300)).filter(Boolean);
  if (input.keywords !== undefined) patch.keywords = input.keywords.map((item) => sanitizeLine(item, 60)).filter(Boolean);
  if (input.conditionInfo !== undefined) patch.condition_info = sanitizeText(input.conditionInfo, 2000);
  if (input.cta !== undefined) patch.cta = sanitizeLine(input.cta, 300);
  return patch;
}

const ALLOWED_TAGS = /<\/?(p|ul|ol|li|br|strong|em|b|i)\s*\/?>/gi;

/**
 * Permite únicamente el HTML básico que producen los perfiles HTML (p, ul, li, br, strong…),
 * sin atributos. Cualquier otra etiqueta se elimina.
 */
export function sanitizeDescription(value: string): string {
  const placeholders: string[] = [];
  const protectedText = value.slice(0, 20000).replace(ALLOWED_TAGS, (tag) => {
    placeholders.push(tag.toLowerCase().replace(/\s+/g, ""));
    return `\u0001${placeholders.length - 1}\u0002`;
  });
  const cleaned = protectedText
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000\u0003-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  return cleaned.replace(/\u0001(\d+)\u0002/g, (_, index: string) => placeholders[Number(index)] ?? "").trim();
}

const SORTS: Record<ListingListQuery["sort"], { column: "created_at" | "updated_at" | "title"; ascending: boolean }> = {
  created_desc: { column: "created_at", ascending: false },
  created_asc: { column: "created_at", ascending: true },
  updated_desc: { column: "updated_at", ascending: false },
  title_asc: { column: "title", ascending: true },
};

export async function listListings(context: SessionContext, query: ListingListQuery): Promise<Paginated<ListingListItem>> {
  const { supabase, workspace, user } = context;
  const from = (query.page - 1) * query.pageSize;
  const onlyFavorites = query.favorites === "1";
  // Con !inner el filtro de favoritos se aplica en la propia consulta (paginación correcta).
  let builder = supabase
    .from("listings")
    .select(`*, products!inner(name), favorites${onlyFavorites ? "!inner" : ""}(user_id)`, { count: "exact" })
    .eq("workspace_id", workspace.id)
    .eq("favorites.user_id", user.id);
  if (query.status) builder = builder.eq("status", query.status);
  else if (!onlyFavorites) builder = builder.neq("status", "archived");
  if (query.platform) builder = builder.eq("platform", query.platform);
  if (query.product) builder = builder.eq("product_id", query.product);
  const term = query.q ? sanitizeSearch(query.q) : "";
  if (term) builder = builder.ilike("title", `%${term}%`);

  const sort = SORTS[query.sort];
  const { data, error, count } = await builder.order(sort.column, { ascending: sort.ascending }).order("id").range(from, from + query.pageSize - 1);
  if (error) {
    if (error.code === "PGRST103") return { items: [], total: count ?? 0, page: query.page, pageSize: query.pageSize, pageCount: 0 };
    throw fromDbError(error);
  }
  const rows = data as unknown as (Row<"listings"> & { products: { name: string }; favorites: { user_id: string }[] })[];
  const items = rows.map(({ products, favorites, ...listing }) => ({ ...listing, productName: products.name, isFavorite: favorites.length > 0 }));
  const total = count ?? 0;
  return { items, total, page: query.page, pageSize: query.pageSize, pageCount: Math.ceil(total / query.pageSize) };
}

export async function getListing(context: SessionContext, id: string): Promise<ListingDetail> {
  const { data, error } = await context.supabase
    .from("listings")
    .select("*, products!inner(id, name, sku, brand, model, price, currency, condition, archived_at), favorites(user_id)")
    .eq("id", id)
    .eq("workspace_id", context.workspace.id)
    .eq("favorites.user_id", context.user.id)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw notFound("El anuncio");
  const { products, favorites, ...listing } = data;
  return { ...listing, product: products, isFavorite: favorites.length > 0 };
}

export async function createListing(context: SessionContext, input: ListingCreateInput): Promise<Row<"listings">> {
  assertCanEdit(context);
  const { supabase, workspace } = context;
  // El producto debe pertenecer al workspace de la sesión (además lo garantiza la FK compuesta).
  const { data: product } = await supabase.from("products").select("id").eq("id", input.productId).eq("workspace_id", workspace.id).maybeSingle();
  if (!product) throw notFound("El producto");

  const content = cleanContent(input);
  const { data, error } = await supabase
    .from("listings")
    .insert({
      workspace_id: workspace.id,
      product_id: input.productId,
      created_by: context.user.id,
      title: content.title ?? input.title,
      description: content.description ?? "",
      short_description: content.short_description ?? "",
      highlights: content.highlights ?? [],
      selling_points: content.selling_points ?? [],
      keywords: content.keywords ?? [],
      condition_info: content.condition_info ?? "",
      cta: content.cta ?? "",
      platform: input.platform,
      template_id: input.templateId,
      tone: input.tone,
      language: input.language,
      status: input.status,
      generation_method: input.generationMethod,
    })
    .select()
    .single();
  if (error) throw fromDbError(error, "No se pudo guardar el anuncio.");
  await audit(supabase, { workspaceId: workspace.id, action: "listing.created", resourceType: "listing", resourceId: data.id, metadata: { method: input.generationMethod } });
  return data;
}

export async function updateListing(context: SessionContext, id: string, input: ListingUpdateInput): Promise<Row<"listings">> {
  assertCanEdit(context);
  const patch: Partial<Row<"listings">> = cleanContent(input);
  if (patch.title !== undefined && !patch.title) throw new ApiError("validation_error", "El título es obligatorio.");
  if (input.status) patch.status = input.status;
  if (input.tone) patch.tone = input.tone;
  if (input.language) patch.language = input.language;
  if (input.generationMethod) patch.generation_method = input.generationMethod;
  if (Object.keys(patch).length === 0) throw new ApiError("bad_request", "No hay cambios que guardar.");

  const { data, error } = await context.supabase
    .from("listings")
    .update(patch)
    .eq("id", id)
    .eq("workspace_id", context.workspace.id)
    .select()
    .maybeSingle();
  if (error) throw fromDbError(error, "No se pudo guardar el anuncio.");
  if (!data) throw notFound("El anuncio");
  return data;
}

export async function deleteListings(context: SessionContext, ids: string[]): Promise<number> {
  assertCanEdit(context);
  const { data, error } = await context.supabase.from("listings").delete().eq("workspace_id", context.workspace.id).in("id", ids).select("id");
  if (error) throw fromDbError(error);
  if (data.length) {
    await audit(context.supabase, { workspaceId: context.workspace.id, action: "listing.deleted", resourceType: "listing", metadata: { count: data.length } });
  }
  return data.length;
}

export async function duplicateListing(context: SessionContext, id: string): Promise<Row<"listings">> {
  const source = await getListing(context, id);
  return createListing(context, {
    ...listingContent(source),
    title: `${source.title} (copia)`.slice(0, 300),
    productId: source.product_id,
    platform: source.platform,
    templateId: source.template_id,
    tone: source.tone as ListingCreateInput["tone"],
    language: source.language as ListingCreateInput["language"],
    status: "draft",
    generationMethod: source.generation_method as ListingCreateInput["generationMethod"],
  });
}

/** Cambia la plataforma/plantilla de un anuncio adaptando su contenido actual (crea una versión nueva). */
export async function adaptExistingListing(context: SessionContext, id: string, platform: string, templateId: string | null) {
  assertCanEdit(context);
  const source = await getListing(context, id);
  const resolved = await resolveListingProfile(context.supabase, context.workspace.id, platform, templateId);
  const adapted = adaptListing(listingContent(source), resolved.profile);
  const { data, error } = await context.supabase
    .from("listings")
    .update({ ...cleanContent(adapted.content), platform: resolved.platform, template_id: resolved.templateId })
    .eq("id", id)
    .eq("workspace_id", context.workspace.id)
    .select()
    .single();
  if (error) throw fromDbError(error, "No se pudo adaptar el anuncio.");
  return { listing: data, warnings: adapted.warnings, profileName: resolved.profile.name };
}

export async function listVersions(context: SessionContext, listingId: string) {
  const { data, error } = await context.supabase
    .from("listing_versions")
    .select("id, version_number, title, description, short_description, platform, generation_method, created_at")
    .eq("listing_id", listingId)
    .eq("workspace_id", context.workspace.id)
    .order("version_number", { ascending: false })
    .limit(100);
  if (error) throw fromDbError(error);
  return data;
}

/** Recupera una versión anterior. No borra historial: la restauración genera una versión nueva. */
export async function restoreVersion(context: SessionContext, listingId: string, versionNumber: number) {
  assertCanEdit(context);
  const { data: version, error } = await context.supabase
    .from("listing_versions")
    .select("*")
    .eq("listing_id", listingId)
    .eq("workspace_id", context.workspace.id)
    .eq("version_number", versionNumber)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!version) throw notFound("La versión");
  const content = (version.content ?? {}) as Record<string, Json>;
  const { data, error: updateError } = await context.supabase
    .from("listings")
    .update({
      title: version.title,
      description: version.description,
      short_description: version.short_description,
      highlights: Array.isArray(content.highlights) ? content.highlights : [],
      selling_points: Array.isArray(content.selling_points) ? content.selling_points : [],
      keywords: Array.isArray(content.keywords) ? content.keywords : [],
      condition_info: typeof content.condition_info === "string" ? content.condition_info : "",
      cta: typeof content.cta === "string" ? content.cta : "",
      platform: version.platform,
    })
    .eq("id", listingId)
    .eq("workspace_id", context.workspace.id)
    .select()
    .maybeSingle();
  if (updateError) throw fromDbError(updateError);
  if (!data) throw notFound("El anuncio");
  return data;
}

export async function setFavorite(context: SessionContext, listingId: string, favorite: boolean) {
  const { supabase, user, workspace } = context;
  const { data: listing } = await supabase.from("listings").select("id").eq("id", listingId).eq("workspace_id", workspace.id).maybeSingle();
  if (!listing) throw notFound("El anuncio");
  if (favorite) {
    const { error } = await supabase.from("favorites").upsert({ user_id: user.id, listing_id: listingId }, { onConflict: "user_id,listing_id", ignoreDuplicates: true });
    if (error) throw fromDbError(error);
  } else {
    const { error } = await supabase.from("favorites").delete().eq("user_id", user.id).eq("listing_id", listingId);
    if (error) throw fromDbError(error);
  }
}

export async function exportWorkspaceListings(
  context: SessionContext,
  filters: { format: ExportFormat; ids?: string[]; status?: string; platform?: string },
): Promise<ExportFile & { count: number }> {
  const usage = await getUsage(context.supabase, context.workspace.id);
  if (!canExport(usage, filters.format)) {
    throw new ApiError("plan_required", `La exportación en formato ${EXPORT_FORMAT_LABELS[filters.format]} no está incluida en tu plan.`);
  }
  let builder = context.supabase
    .from("listings")
    .select("*, products!inner(name, sku, brand, model, price, currency, condition, categories(name))")
    .eq("workspace_id", context.workspace.id)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (filters.ids?.length) builder = builder.in("id", filters.ids);
  if (filters.status) builder = builder.eq("status", filters.status);
  if (filters.platform) builder = builder.eq("platform", filters.platform);
  const { data, error } = await builder;
  if (error) throw fromDbError(error);
  if (data.length === 0) throw new ApiError("not_found", "No hay anuncios que exportar con esos filtros.");

  const listings: ExportableListing[] = data.map((row) => ({
    id: row.id,
    ...listingContent(row),
    platform: row.platform,
    status: row.status,
    language: row.language,
    product: {
      name: row.products.name,
      sku: row.products.sku,
      brand: row.products.brand,
      model: row.products.model,
      price: row.products.price,
      currency: row.products.currency,
      condition: row.products.condition,
      category: row.products.categories?.name ?? null,
    },
  }));
  await audit(context.supabase, { workspaceId: context.workspace.id, action: "listing.exported", resourceType: "listing", metadata: { count: listings.length, format: filters.format } });
  return { ...exportListings(listings, filters.format), count: listings.length };
}
