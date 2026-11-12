import "server-only";
import { randomUUID } from "node:crypto";
import { attributesForCategory, categoryPath, resolveAttributes, validateAttributes, type CategoryCatalog } from "@/domain/categories";
import type { GenerationProduct } from "@/domain/generation/types";
import type { ConditionCode, Language } from "@/domain/product";
import type { Db, Json, Row } from "@/lib/supabase/types";
import { assertCanEdit, type SessionContext } from "@/server/auth/session";
import { ApiError, notFound } from "@/server/http/errors";
import { fromDbError } from "@/server/http/handler";
import { IMAGE_MAX_BYTES, readImageUpload } from "@/server/security/files";
import type { ProductInput, ProductListQuery } from "@/validation/schemas";
import { audit } from "./audit";
import { loadCategoryCatalog } from "./catalog";
import { getUsage } from "./usage";

const IMAGE_BUCKET = "product-images";
const SIGNED_URL_SECONDS = 3600;

export type ProductImage = { id: string; url: string | null; filename: string; size: number; order: number };
export type ProductListItem = Row<"products"> & { categoryName: string | null; thumbnailUrl: string | null; listingCount: number };
export type ProductDetail = Row<"products"> & { images: ProductImage[] };
export type Paginated<T> = { items: T[]; total: number; page: number; pageSize: number; pageCount: number };

/** Neutraliza caracteres con significado en los filtros de PostgREST y en LIKE. */
export function sanitizeSearch(term: string): string {
  return term.replace(/[%_,()"'\\*:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

async function signPaths(supabase: Db, paths: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (paths.length === 0) return result;
  const { data } = await supabase.storage.from(IMAGE_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) result.set(entry.path, entry.signedUrl);
  }
  return result;
}

const SORTS: Record<ProductListQuery["sort"], { column: "created_at" | "updated_at" | "name" | "price"; ascending: boolean }> = {
  created_desc: { column: "created_at", ascending: false },
  created_asc: { column: "created_at", ascending: true },
  updated_desc: { column: "updated_at", ascending: false },
  name_asc: { column: "name", ascending: true },
  name_desc: { column: "name", ascending: false },
  price_asc: { column: "price", ascending: true },
  price_desc: { column: "price", ascending: false },
};

/** Listado paginado en servidor. Una sola consulta trae categoría, miniatura y nº de anuncios (sin N+1). */
export async function listProducts(context: SessionContext, query: ProductListQuery): Promise<Paginated<ProductListItem>> {
  const { supabase, workspace } = context;
  const from = (query.page - 1) * query.pageSize;
  let builder = supabase
    .from("products")
    .select("*, categories(name), product_images(storage_path, display_order), listings(count)", { count: "exact" })
    .eq("workspace_id", workspace.id);

  if (query.archived === "active") builder = builder.is("archived_at", null);
  if (query.archived === "archived") builder = builder.not("archived_at", "is", null);
  if (query.condition) builder = builder.eq("condition", query.condition);
  if (query.category) {
    const catalog = await loadCategoryCatalog(supabase);
    const ids = [query.category, ...catalog.categories.filter((category) => category.parentId === query.category).map((category) => category.id)];
    builder = builder.in("category_id", ids);
  }
  const term = query.q ? sanitizeSearch(query.q) : "";
  if (term) builder = builder.or(`name.ilike.%${term}%,sku.ilike.%${term}%,brand.ilike.%${term}%,model.ilike.%${term}%`);

  const sort = SORTS[query.sort];
  const { data, error, count } = await builder
    .order(sort.column, { ascending: sort.ascending, nullsFirst: false })
    .order("id")
    .range(from, from + query.pageSize - 1);
  if (error) {
    if (error.code === "PGRST103") return { items: [], total: count ?? 0, page: query.page, pageSize: query.pageSize, pageCount: 0 };
    throw fromDbError(error);
  }

  const thumbnails = data
    .map((row) => [...row.product_images].sort((a, b) => a.display_order - b.display_order)[0]?.storage_path)
    .filter((path): path is string => Boolean(path));
  const signed = await signPaths(supabase, thumbnails);

  const items = data.map(({ categories, product_images, listings, ...product }) => {
    const first = [...product_images].sort((a, b) => a.display_order - b.display_order)[0]?.storage_path;
    return {
      ...product,
      categoryName: categories?.name ?? null,
      thumbnailUrl: first ? (signed.get(first) ?? null) : null,
      listingCount: listings[0]?.count ?? 0,
    };
  });
  const total = count ?? 0;
  return { items, total, page: query.page, pageSize: query.pageSize, pageCount: Math.ceil(total / query.pageSize) };
}

export async function getProduct(context: SessionContext, id: string): Promise<ProductDetail> {
  const { data, error } = await context.supabase
    .from("products")
    .select("*, product_images(id, storage_path, filename, size, display_order)")
    .eq("id", id)
    .eq("workspace_id", context.workspace.id)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw notFound("El producto");
  const ordered = [...data.product_images].sort((a, b) => a.display_order - b.display_order);
  const signed = await signPaths(context.supabase, ordered.map((image) => image.storage_path));
  const { product_images: _images, ...product } = data;
  void _images;
  return {
    ...product,
    images: ordered.map((image) => ({ id: image.id, url: signed.get(image.storage_path) ?? null, filename: image.filename, size: image.size, order: image.display_order })),
  };
}

function toRow(input: ProductInput, attributes: Record<string, Json>) {
  return {
    name: input.name,
    description: input.description,
    category_id: input.categoryId,
    brand: input.brand,
    model: input.model,
    price: input.price,
    currency: input.currency,
    cost_price: input.costPrice,
    condition: input.condition,
    condition_custom: input.condition === "custom" ? input.conditionCustom : null,
    sku: input.sku,
    location: input.location,
    features: input.features,
    defects: input.defects,
    attributes,
  };
}

function checkedAttributes(catalog: CategoryCatalog, input: Pick<ProductInput, "categoryId" | "attributes">): Record<string, Json> {
  const result = validateAttributes(attributesForCategory(catalog, input.categoryId), input.attributes);
  if (Object.keys(result.errors).length > 0) {
    const fields = Object.fromEntries(Object.entries(result.errors).map(([key, message]) => [`attributes.${key}`, message]));
    throw new ApiError("validation_error", Object.values(result.errors)[0] ?? "Revisa los atributos.", { fields });
  }
  return result.values;
}

export async function createProduct(context: SessionContext, input: ProductInput): Promise<Row<"products">> {
  assertCanEdit(context);
  const catalog = await loadCategoryCatalog(context.supabase);
  const { data, error } = await context.supabase
    .from("products")
    .insert({ ...toRow(input, checkedAttributes(catalog, input)), workspace_id: context.workspace.id, created_by: context.user.id })
    .select()
    .single();
  if (error) throw fromDbError(error, "No se pudo crear el producto.");
  await audit(context.supabase, { workspaceId: context.workspace.id, action: "product.created", resourceType: "product", resourceId: data.id });
  return data;
}

export async function updateProduct(context: SessionContext, id: string, input: ProductInput): Promise<Row<"products">> {
  assertCanEdit(context);
  const catalog = await loadCategoryCatalog(context.supabase);
  const { data, error } = await context.supabase
    .from("products")
    .update(toRow(input, checkedAttributes(catalog, input)))
    .eq("id", id)
    .eq("workspace_id", context.workspace.id)
    .select()
    .maybeSingle();
  if (error) throw fromDbError(error, "No se pudo guardar el producto.");
  if (!data) throw notFound("El producto");
  return data;
}

async function removeProductFiles(supabase: Db, workspaceId: string, productIds: string[]) {
  if (productIds.length === 0) return;
  const { data } = await supabase.from("product_images").select("storage_path").eq("workspace_id", workspaceId).in("product_id", productIds);
  const paths = (data ?? []).map((row) => row.storage_path);
  for (let index = 0; index < paths.length; index += 100) {
    await supabase.storage.from(IMAGE_BUCKET).remove(paths.slice(index, index + 100));
  }
}

/** Elimina productos junto con sus fotografías en Storage y, en cascada, sus anuncios. */
export async function deleteProducts(context: SessionContext, ids: string[]): Promise<number> {
  assertCanEdit(context);
  await removeProductFiles(context.supabase, context.workspace.id, ids);
  const { data, error } = await context.supabase.from("products").delete().eq("workspace_id", context.workspace.id).in("id", ids).select("id");
  if (error) throw fromDbError(error, "No se pudieron eliminar los productos.");
  if (data.length > 0) {
    await audit(context.supabase, {
      workspaceId: context.workspace.id,
      action: "product.deleted",
      resourceType: "product",
      resourceId: data.length === 1 ? data[0]!.id : null,
      metadata: { count: data.length },
    });
  }
  return data.length;
}

export async function setArchived(context: SessionContext, ids: string[], archived: boolean): Promise<number> {
  assertCanEdit(context);
  const { data, error } = await context.supabase
    .from("products")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("workspace_id", context.workspace.id)
    .in("id", ids)
    .select("id");
  if (error) throw fromDbError(error);
  return data.length;
}

export async function bulkUpdateProducts(
  context: SessionContext,
  ids: string[],
  fields: { categoryId?: string; condition?: ConditionCode; brand?: string; location?: string; currency?: string },
): Promise<number> {
  assertCanEdit(context);
  const patch: Partial<Row<"products">> = {};
  if (fields.categoryId) patch.category_id = fields.categoryId;
  if (fields.condition) {
    patch.condition = fields.condition;
    patch.condition_custom = null;
  }
  if (fields.brand) patch.brand = fields.brand;
  if (fields.location) patch.location = fields.location;
  if (fields.currency) patch.currency = fields.currency;
  const { data, error } = await context.supabase.from("products").update(patch).eq("workspace_id", context.workspace.id).in("id", ids).select("id");
  if (error) throw fromDbError(error);
  await audit(context.supabase, {
    workspaceId: context.workspace.id,
    action: "product.bulk_updated",
    resourceType: "product",
    metadata: { count: data.length, fields: Object.keys(patch) },
  });
  return data.length;
}

/** Duplica un producto (sin SKU, que es único, y sin fotografías). */
export async function duplicateProduct(context: SessionContext, id: string): Promise<Row<"products">> {
  assertCanEdit(context);
  const source = await getProduct(context, id);
  const { data, error } = await context.supabase
    .from("products")
    .insert({
      workspace_id: context.workspace.id,
      created_by: context.user.id,
      name: `${source.name} (copia)`.slice(0, 200),
      description: source.description,
      category_id: source.category_id,
      brand: source.brand,
      model: source.model,
      price: source.price,
      currency: source.currency,
      cost_price: source.cost_price,
      condition: source.condition,
      condition_custom: source.condition_custom,
      sku: null,
      location: source.location,
      features: source.features,
      defects: source.defects,
      attributes: source.attributes,
    })
    .select()
    .single();
  if (error) throw fromDbError(error, "No se pudo duplicar el producto.");
  return data;
}

// --- Fotografías -------------------------------------------------------------
export async function addProductImage(context: SessionContext, productId: string, file: unknown): Promise<ProductImage> {
  assertCanEdit(context);
  const { supabase, workspace } = context;
  const { data: product } = await supabase.from("products").select("id").eq("id", productId).eq("workspace_id", workspace.id).maybeSingle();
  if (!product) throw notFound("El producto");

  const [{ count }, usage] = await Promise.all([
    supabase.from("product_images").select("id", { count: "exact", head: true }).eq("product_id", productId),
    getUsage(supabase, workspace.id),
  ]);
  if ((count ?? 0) >= usage.features.maxImagesPerProduct) {
    throw new ApiError("limit_reached", `Tu plan permite ${usage.features.maxImagesPerProduct} fotografías por producto.`);
  }

  const upload = await readImageUpload(file, IMAGE_MAX_BYTES);
  // Ruta no predecible: {workspace}/{producto}/{uuid aleatorio}.{ext real}
  const path = `${workspace.id}/${productId}/${randomUUID()}.${upload.kind.extension}`;
  const stored = await supabase.storage.from(IMAGE_BUCKET).upload(path, upload.bytes, { contentType: upload.kind.mime, upsert: false, cacheControl: "3600" });
  if (stored.error) throw new ApiError("internal_error", "No se pudo guardar la imagen.");

  const { data, error } = await supabase
    .from("product_images")
    .insert({ product_id: productId, workspace_id: workspace.id, storage_path: path, filename: upload.filename, mime_type: upload.kind.mime, size: upload.bytes.byteLength, display_order: count ?? 0 })
    .select()
    .single();
  if (error) {
    await supabase.storage.from(IMAGE_BUCKET).remove([path]);
    throw fromDbError(error, "No se pudo registrar la imagen.");
  }
  const signed = await signPaths(supabase, [path]);
  return { id: data.id, url: signed.get(path) ?? null, filename: data.filename, size: data.size, order: data.display_order };
}

export async function deleteProductImage(context: SessionContext, productId: string, imageId: string) {
  assertCanEdit(context);
  const { data, error } = await context.supabase
    .from("product_images")
    .delete()
    .eq("id", imageId)
    .eq("product_id", productId)
    .eq("workspace_id", context.workspace.id)
    .select("storage_path")
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw notFound("La imagen");
  await context.supabase.storage.from(IMAGE_BUCKET).remove([data.storage_path]);
}

// --- Conversión para el generador -------------------------------------------
export function toGenerationProduct(product: Row<"products">, catalog: CategoryCatalog, imageCount: number, language: Language): GenerationProduct {
  const definitions = attributesForCategory(catalog, product.category_id);
  const values = (product.attributes ?? {}) as Record<string, unknown>;
  const path = categoryPath(catalog, product.category_id);
  return {
    name: product.name,
    category: path.category,
    subcategory: path.subcategory,
    brand: product.brand,
    model: product.model,
    price: product.price,
    currency: product.currency,
    condition: product.condition as ConditionCode,
    conditionCustom: product.condition_custom,
    description: product.description,
    features: Array.isArray(product.features) ? product.features.map(String) : [],
    defects: product.defects,
    location: product.location,
    attributes: resolveAttributes(definitions, values, language),
    missingAttributes: validateAttributes(definitions, values).missingRequired.map((definition) => definition.name),
    imageCount,
  };
}
