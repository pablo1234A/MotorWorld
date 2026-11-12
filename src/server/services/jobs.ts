import "server-only";
import { randomUUID } from "node:crypto";
import Papa from "papaparse";
import type { CategoryCatalog } from "@/domain/categories";
import { IMPORT_LIMITS, suggestMapping, validateImportRows, type ColumnMapping, type ImportDefaults, type ImportedProduct, type ImportValidation } from "@/domain/csv/import";
import { GenerationSystemError } from "@/domain/generation/types";
import { toCsv } from "@/domain/marketplaces/export";
import { checkQuota, QUOTA_MESSAGES } from "@/domain/plans";
import type { Language, Length, Tone } from "@/domain/product";
import { htmlToPlain, looksLikeHtml } from "@/domain/text";
import { logger } from "@/lib/logger";
import type { Db, Json, Row } from "@/lib/supabase/types";
import { assertCanEdit, type SessionContext } from "@/server/auth/session";
import { ApiError, notFound } from "@/server/http/errors";
import { fromDbError } from "@/server/http/handler";
import { looksLikeText, safeFilename } from "@/server/security/files";
import { audit } from "./audit";
import { loadCategoryCatalog } from "./catalog";
import { generateContent, resolveOptions } from "./generation";
import type { Paginated } from "./products";
import { resolveListingProfile } from "./templates";
import { getUsage } from "./usage";

const IMPORT_BUCKET = "imports";
/** Elementos por petición de procesamiento y trabajos en paralelo dentro de cada lote. */
export const JOB_BATCH_SIZE = 20;
const JOB_CONCURRENCY = 4;

export type JobOptions = { platform: string; templateId: string | null; tone?: Tone; length?: Length; language?: Language };

// --- Importación de CSV -----------------------------------------------------
function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const result = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim().slice(0, 120),
  });
  const headers = (result.meta.fields ?? []).filter((header) => header !== "");
  const fatal = result.errors.find((error) => error.type === "Delimiter" || error.type === "Quotes");
  if (headers.length === 0 || (fatal && result.data.length === 0)) {
    throw new ApiError("validation_error", "No se ha podido leer el CSV. Comprueba que tiene una fila de cabeceras y un separador válido.");
  }
  if (new Set(headers).size !== headers.length) {
    throw new ApiError("validation_error", "El CSV tiene cabeceras repetidas. Cada columna debe tener un nombre distinto.");
  }
  if (headers.length > IMPORT_LIMITS.maxColumns) {
    throw new ApiError("validation_error", `El CSV tiene demasiadas columnas (máximo ${IMPORT_LIMITS.maxColumns}).`);
  }
  return { headers, rows: result.data };
}

function decode(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // Archivos exportados desde Excel en Windows suelen venir en Windows-1252.
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** Paso 1: valida el archivo, lo guarda en el bucket temporal y devuelve columnas + vista previa. */
export async function analyzeImport(context: SessionContext, file: unknown) {
  assertCanEdit(context);
  if (!(file instanceof File)) throw new ApiError("bad_request", "No se ha recibido ningún archivo.");
  if (file.size === 0) throw new ApiError("validation_error", "El archivo está vacío.");
  if (file.size > IMPORT_LIMITS.maxFileBytes) throw new ApiError("payload_too_large", "El CSV supera el tamaño máximo de 5 MB.");
  if (!/\.(csv|txt)$/i.test(file.name)) throw new ApiError("unsupported_media_type", "Sube un archivo con extensión .csv.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!looksLikeText(bytes)) throw new ApiError("unsupported_media_type", "El archivo no parece un CSV de texto.");
  const { headers, rows } = parseCsv(decode(bytes));
  if (rows.length === 0) throw new ApiError("validation_error", "El CSV no contiene filas de datos.");

  const usage = await getUsage(context.supabase, context.workspace.id);
  const importId = randomUUID();
  const { error } = await context.supabase.storage
    .from(IMPORT_BUCKET)
    .upload(`${context.workspace.id}/${importId}.csv`, bytes, { contentType: "text/csv", upsert: false });
  if (error) throw new ApiError("internal_error", "No se pudo guardar el archivo para procesarlo.");

  return {
    importId,
    filename: safeFilename(file.name),
    headers,
    totalRows: rows.length,
    suggestedMapping: suggestMapping(headers),
    preview: rows.slice(0, IMPORT_LIMITS.previewRows),
    quota: checkQuota(usage, rows.length, true),
    limits: { maxRows: usage.features.maxBulkRows, bulkRemaining: usage.bulkRemaining, remaining: usage.remaining },
  };
}

async function loadImportRows(context: SessionContext, importId: string) {
  const { data, error } = await context.supabase.storage.from(IMPORT_BUCKET).download(`${context.workspace.id}/${importId}.csv`);
  if (error || !data) throw new ApiError("not_found", "La importación ha caducado o no existe. Vuelve a subir el archivo.");
  return parseCsv(decode(new Uint8Array(await data.arrayBuffer())));
}

function checkMapping(mapping: ColumnMapping, headers: string[]) {
  const unknown = Object.keys(mapping).filter((header) => !headers.includes(header));
  if (unknown.length > 0) throw new ApiError("validation_error", "El mapeo hace referencia a columnas que no existen en el archivo.");
}

const MAX_REPORTED_ISSUES = 200;

/** Paso 2: valida todas las filas con el mapeo elegido y devuelve los errores por fila. */
export async function validateImport(context: SessionContext, input: { importId: string; mapping: ColumnMapping; defaults: ImportDefaults }) {
  assertCanEdit(context);
  const [{ headers, rows }, catalog, usage] = await Promise.all([
    loadImportRows(context, input.importId),
    loadCategoryCatalog(context.supabase),
    getUsage(context.supabase, context.workspace.id),
  ]);
  checkMapping(input.mapping, headers);
  const validation = validateImportRows(rows, input.mapping, catalog, input.defaults);
  return { ...summarize(validation), quota: checkQuota(usage, Math.max(validation.valid.length, 1), true) };
}

function summarize(validation: ImportValidation) {
  return {
    totalRows: validation.totalRows,
    validRows: validation.valid.length,
    invalidRows: validation.invalidRows,
    duplicateRows: validation.duplicateRows,
    errors: validation.errors.slice(0, MAX_REPORTED_ISSUES),
    warnings: validation.warnings.slice(0, MAX_REPORTED_ISSUES),
    truncated: validation.errors.length > MAX_REPORTED_ISSUES || validation.warnings.length > MAX_REPORTED_ISSUES,
    sample: validation.valid.slice(0, 5).map((row) => ({ row: row.row, name: row.product.name, price: row.product.price, condition: row.product.condition })),
  };
}

/**
 * Paso 3: crea el trabajo. La función SQL inserta trabajo + elementos y reserva
 * el consumo en una única transacción; si no hay cuota, no se crea nada.
 */
export async function createJob(
  context: SessionContext,
  input: { importId: string; mapping: ColumnMapping; defaults: ImportDefaults; filename: string; options: JobOptions },
) {
  assertCanEdit(context);
  const { supabase, workspace } = context;
  const [{ headers, rows }, catalog] = await Promise.all([loadImportRows(context, input.importId), loadCategoryCatalog(supabase)]);
  checkMapping(input.mapping, headers);
  const validation = validateImportRows(rows, input.mapping, catalog, input.defaults);
  if (validation.valid.length === 0) throw new ApiError("validation_error", "El archivo no contiene ninguna fila válida que procesar.");

  // Valida plataforma/plantilla antes de crear nada.
  const resolved = await resolveListingProfile(supabase, workspace.id, input.options.platform, input.options.templateId);
  const options: JobOptions = { ...input.options, platform: resolved.platform, templateId: resolved.templateId };

  const { data, error } = await supabase.rpc("create_generation_job", {
    p_workspace: workspace.id,
    p_filename: safeFilename(input.filename),
    p_source_path: `${workspace.id}/${input.importId}.csv`,
    p_options: options as unknown as Json,
    p_items: validation.valid.map((row) => ({ row_number: row.row, input: row.product })) as unknown as Json,
  });
  if (error) throw fromDbError(error, "No se pudo crear el trabajo de generación.");
  const result = (data ?? {}) as { allowed?: boolean; reason?: string; job_id?: string; max_rows?: number };
  if (!result.allowed || !result.job_id) {
    const reason = result.reason ?? "monthly_limit";
    throw new ApiError(reason === "plan_required" ? "plan_required" : reason === "too_many_active_jobs" ? "conflict" : "limit_reached", QUOTA_MESSAGES[reason] ?? "No se pudo crear el trabajo.", { reason, maxRows: result.max_rows });
  }

  // El CSV es temporal: una vez creados los elementos ya no se necesita.
  await supabase.storage.from(IMPORT_BUCKET).remove([`${workspace.id}/${input.importId}.csv`]);
  await audit(supabase, { workspaceId: workspace.id, action: "job.created", resourceType: "generation_job", resourceId: result.job_id, metadata: { items: validation.valid.length, skipped: validation.invalidRows + validation.duplicateRows } });
  return { jobId: result.job_id, totalItems: validation.valid.length, skippedRows: validation.invalidRows + validation.duplicateRows };
}

// --- Procesamiento por lotes -------------------------------------------------
async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++]!;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

type ItemContext = { job: Row<"generation_jobs">; catalog: CategoryCatalog; profile: Awaited<ReturnType<typeof resolveListingProfile>>; options: ReturnType<typeof resolveOptions> };

async function report(supabase: Db, itemId: string, status: "progress" | "completed" | "failed", extra: { product?: string | null; listing?: string | null; error?: string; system?: boolean } = {}) {
  const { error } = await supabase.rpc("report_job_item", {
    p_item: itemId,
    p_status: status,
    p_product: extra.product ?? undefined,
    p_listing: extra.listing ?? undefined,
    p_error: extra.error,
    p_system_error: extra.system ?? false,
  });
  if (error) logger.error("job.report_failed", { itemId, status, error: error.message });
}

/** Procesa un elemento de forma idempotente: si ya tiene producto (reintento), no lo vuelve a crear. */
async function processItem(supabase: Db, item: Row<"generation_job_items">, ctx: ItemContext) {
  const input = item.input as unknown as ImportedProduct;
  let productId = item.product_id;
  try {
    let product: Row<"products"> | null = null;
    if (productId) {
      product = (await supabase.from("products").select("*").eq("id", productId).eq("workspace_id", ctx.job.workspace_id).maybeSingle()).data;
    }
    if (!product && input.sku) {
      // Duplicados contra el catálogo: un SKU existente reutiliza el producto.
      product = (await supabase.from("products").select("*").eq("workspace_id", ctx.job.workspace_id).eq("sku", input.sku).maybeSingle()).data;
    }
    if (!product) {
      const created = await supabase
        .from("products")
        .insert({
          workspace_id: ctx.job.workspace_id,
          created_by: ctx.job.created_by,
          name: input.name,
          description: input.description,
          category_id: input.categoryId,
          brand: input.brand,
          model: input.model,
          price: input.price,
          currency: input.currency,
          cost_price: input.costPrice,
          condition: input.condition,
          condition_custom: input.conditionCustom,
          sku: input.sku,
          location: input.location,
          features: input.features,
          defects: input.defects,
          attributes: input.attributes,
        })
        .select()
        .single();
      if (created.error) {
        const mapped = fromDbError(created.error, "No se pudo crear el producto.");
        await report(supabase, item.id, "failed", { error: mapped.message, system: mapped.code === "internal_error" });
        return;
      }
      product = created.data;
    }
    productId = product.id;
    await report(supabase, item.id, "progress", { product: productId });

    const content = await generateContent(product, ctx.catalog, 0, ctx.profile.profile, ctx.options);
    const listing = await supabase
      .from("listings")
      .insert({
        workspace_id: ctx.job.workspace_id,
        product_id: product.id,
        created_by: ctx.job.created_by,
        title: content.title,
        description: content.description,
        short_description: content.shortDescription,
        highlights: content.highlights,
        selling_points: content.sellingPoints,
        keywords: content.keywords,
        condition_info: content.conditionInfo,
        cta: content.cta,
        platform: ctx.profile.platform,
        template_id: ctx.profile.templateId,
        tone: ctx.options.tone,
        language: ctx.options.language,
        status: "draft",
        generation_method: content.method,
      })
      .select("id")
      .single();
    if (listing.error) {
      await report(supabase, item.id, "failed", { product: productId, error: "No se pudo guardar el anuncio generado.", system: true });
      return;
    }
    await report(supabase, item.id, "completed", { product: productId, listing: listing.data.id });
  } catch (cause) {
    const system = cause instanceof GenerationSystemError || !(cause instanceof ApiError);
    logger.error("job.item_failed", { jobId: ctx.job.id, itemId: item.id, error: cause });
    await report(supabase, item.id, "failed", {
      product: productId,
      error: cause instanceof Error && (cause instanceof ApiError || cause instanceof GenerationSystemError) ? cause.message : "Error interno al procesar la fila.",
      system,
    });
  }
}

/**
 * Procesa UN lote de un trabajo. Cada llamada HTTP procesa como máximo JOB_BATCH_SIZE
 * elementos; el cliente (o el cron) repite la llamada hasta terminar. La reserva de
 * elementos es atómica (FOR UPDATE SKIP LOCKED), así que varios procesos pueden
 * colaborar sin duplicar trabajo. `supabase` puede ser el cliente del usuario o el de servicio.
 */
export async function processJobBatch(supabase: Db, jobId: string): Promise<Row<"generation_jobs">> {
  const { data: job, error } = await supabase.from("generation_jobs").select("*").eq("id", jobId).maybeSingle();
  if (error) throw fromDbError(error);
  if (!job) throw notFound("El trabajo");
  if (!["pending", "processing"].includes(job.status)) return job;

  const { data: items, error: claimError } = await supabase.rpc("claim_job_items", { p_job: jobId, p_limit: JOB_BATCH_SIZE });
  if (claimError) throw fromDbError(claimError);

  if (items && items.length > 0) {
    const options = (job.options ?? {}) as unknown as JobOptions;
    const [catalog, profile] = await Promise.all([
      loadCategoryCatalog(supabase),
      resolveListingProfile(supabase, job.workspace_id, options.platform ?? "generic", options.templateId ?? null).catch(() =>
        // Si la plantilla se borró tras crear el trabajo, se usa el perfil base de la plataforma.
        resolveListingProfile(supabase, job.workspace_id, options.platform ?? "generic", null),
      ),
    ]);
    const ctx: ItemContext = { job, catalog, profile, options: resolveOptions(profile.profile, options) };
    await runPool(items, JOB_CONCURRENCY, (item) => processItem(supabase, item, ctx));
  }

  const refreshed = await supabase.from("generation_jobs").select("*").eq("id", jobId).single();
  if (refreshed.error) throw fromDbError(refreshed.error);
  return refreshed.data;
}

// --- Consulta, reintento y exportación --------------------------------------
export async function listJobs(context: SessionContext, page: number, pageSize: number): Promise<Paginated<Row<"generation_jobs">>> {
  const from = (page - 1) * pageSize;
  const { data, error, count } = await context.supabase
    .from("generation_jobs")
    .select("*", { count: "exact" })
    .eq("workspace_id", context.workspace.id)
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) {
    if (error.code === "PGRST103") return { items: [], total: count ?? 0, page, pageSize, pageCount: 0 };
    throw fromDbError(error);
  }
  const total = count ?? 0;
  return { items: data, total, page, pageSize, pageCount: Math.ceil(total / pageSize) };
}

export async function getJob(context: SessionContext, id: string) {
  const { data, error } = await context.supabase.from("generation_jobs").select("*").eq("id", id).eq("workspace_id", context.workspace.id).maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw notFound("El trabajo");
  const failed = await context.supabase
    .from("generation_job_items")
    .select("id, row_number, error_message, system_error, input")
    .eq("job_id", id)
    .eq("status", "failed")
    .order("row_number")
    .limit(100);
  return {
    job: data,
    failedItems: (failed.data ?? []).map((item) => ({
      id: item.id,
      row: item.row_number,
      name: String((item.input as Record<string, Json>)?.name ?? ""),
      error: item.error_message ?? "Error desconocido",
      systemError: item.system_error,
    })),
  };
}

export async function retryJob(context: SessionContext, id: string) {
  assertCanEdit(context);
  const { data, error } = await context.supabase.rpc("retry_failed_job_items", { p_job: id });
  if (error) throw error.code === "42501" ? notFound("El trabajo") : fromDbError(error);
  const result = (data ?? {}) as { allowed?: boolean; reason?: string; retried?: number };
  if (!result.allowed) {
    const reason = result.reason ?? "monthly_limit";
    throw new ApiError(["job_not_retryable", "nothing_to_retry"].includes(reason) ? "conflict" : "limit_reached", QUOTA_MESSAGES[reason] ?? "No se pudo reintentar.", { reason });
  }
  return { retried: result.retried ?? 0 };
}

const ITEM_STATUS: Record<string, string> = { pending: "pendiente", processing: "procesando", completed: "completado", failed: "fallido" };

/** Exporta en CSV el resultado completo de un trabajo (filas correctas y fallidas). */
export async function exportJob(context: SessionContext, id: string): Promise<{ body: string; filename: string }> {
  const { job } = await getJob(context, id);
  const rows: unknown[][] = [];
  const pageSize = 500;
  for (let offset = 0; offset < job.total_items; offset += pageSize) {
    const { data, error } = await context.supabase
      .from("generation_job_items")
      .select("row_number, status, error_message, input, listings(title, description, short_description, keywords, platform)")
      .eq("job_id", id)
      .order("row_number")
      .range(offset, offset + pageSize - 1);
    if (error) throw fromDbError(error);
    for (const item of data) {
      const input = (item.input ?? {}) as Record<string, Json>;
      const listing = item.listings;
      const description = listing?.description ?? "";
      rows.push([
        item.row_number,
        ITEM_STATUS[item.status] ?? item.status,
        input.sku ?? "",
        input.name ?? "",
        listing?.title ?? "",
        looksLikeHtml(description) ? htmlToPlain(description) : description,
        listing?.short_description ?? "",
        Array.isArray(listing?.keywords) ? listing.keywords.join(", ") : "",
        listing?.platform ?? "",
        item.error_message ?? "",
      ]);
    }
    if (data.length < pageSize) break;
  }
  await audit(context.supabase, { workspaceId: context.workspace.id, action: "job.exported", resourceType: "generation_job", resourceId: id });
  return {
    body: toCsv(["fila", "resultado", "sku", "producto", "titulo", "descripcion", "descripcion_breve", "palabras_clave", "plataforma", "error"], rows),
    filename: `anunciapro-lote-${id.slice(0, 8)}.csv`,
  };
}
