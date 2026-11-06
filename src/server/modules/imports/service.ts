import "server-only";

import { createHash } from "node:crypto";

import { sql } from "kysely";

import { todayIn } from "@/lib/dates";
import { IMPORT_COLUMNS, type ImportColumn } from "@/lib/imports/columns";
import { type RawRow, summarize, type ValidatedRow, validateRows, type ValidationSummary } from "@/lib/imports/validate";
import { PLANS, type PlanCode } from "@/lib/plans";
import { type Tx, withRls } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";
import { enforceRateLimits, RATE_LIMITS } from "@/server/security/rate-limit";

import type { ServiceCtx } from "../branches/service";
import { ImportParseError, parseImportFile } from "./parse";

/**
 * Importación en dos fases (docs/IMPORTACION.md):
 *  1. Staging: el archivo se lee y valida; cada fila queda en `import_rows`
 *     con sus errores y avisos. No se crea ninguna ficha.
 *  2. Confirmación: `app.commit_import` crea todas las fichas en una única
 *     transacción, o ninguna.
 * Toda la información se guarda y consulta con RLS (`imports.run`).
 */

export interface ImportOptions {
  allowNoEmail: boolean;
  /** R7: actualizar los vehículos ya registrados en lugar de omitirlos. */
  updateExisting?: boolean;
}

export interface BatchSummary extends ValidationSummary {
  kind: "xlsx" | "csv";
  unknownHeaders: string[];
  repeatedFile: boolean;
  options: ImportOptions;
  committed?: { customers: number; attachedCustomers: number; vehicles: number; updatedVehicles?: number; maintenanceRecords: number };
}

export interface BatchInfo {
  id: string;
  branchId: string;
  branchName: string;
  fileName: string;
  status: string;
  rowCount: number;
  errorCount: number;
  warningCount: number;
  summary: BatchSummary;
  createdAt: Date;
  committedAt: Date | null;
  expiresAt: Date;
}

const EDITABLE = ["validated", "has_errors"] as const;

async function workshopContext(tx: Tx, orgId: string, branchId: string, allowNoEmail: boolean, updateExisting = false) {
  const [customers, plates, branch] = await Promise.all([
    tx
      .selectFrom("customers")
      .select(["id", "email"])
      .where("organization_id", "=", orgId)
      .where("branch_id", "=", branchId)
      .where("deleted_at", "is", null)
      .where("email", "is not", null)
      .orderBy("created_at")
      .execute(),
    tx.selectFrom("vehicles").select(["id", "plate_normalized"]).where("branch_id", "=", branchId).where("deleted_at", "is", null).execute(),
    tx
      .selectFrom("branches as b")
      .innerJoin("organizations as o", "o.id", "b.organization_id")
      .select(sql<string>`coalesce(b.timezone, o.timezone)`.as("tz"))
      .where("b.id", "=", branchId)
      .executeTakeFirst(),
  ]);
  const byEmail = new Map<string, string>();
  for (const c of customers) if (c.email && !byEmail.has(String(c.email))) byEmail.set(String(c.email), c.id);
  return {
    today: todayIn(branch?.tz ?? "Europe/Madrid"),
    existingCustomersByEmail: byEmail,
    existingPlates: new Map(plates.filter((p) => p.plate_normalized).map((p) => [p.plate_normalized as string, p.id])),
    allowNoEmail,
    updateExisting,
  };
}

/** Fila lista para guardar (objetos JSON sin serializar). */
function rowData(r: ValidatedRow) {
  return {
    row_number: r.rowNumber,
    raw: serializeRaw(r.raw),
    normalized: r.normalized,
    errors: r.errors,
    warnings: r.warnings,
    action: r.action,
    matched_customer_id: r.matchedCustomerId,
    matched_vehicle_id: r.matchedVehicleId,
  };
}

/** Para INSERT: las columnas jsonb se envían como texto JSON. */
function rowInsert(r: ValidatedRow) {
  const d = rowData(r);
  return {
    ...d,
    raw: JSON.stringify(d.raw),
    normalized: d.normalized ? JSON.stringify(d.normalized) : null,
    errors: JSON.stringify(d.errors),
    warnings: JSON.stringify(d.warnings),
  };
}

/** Las fechas nativas de Excel se guardan como AAAA-MM-DD para volver a validarlas igual. */
function serializeRaw(raw: RawRow): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = v instanceof Date ? (isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)) : (v as string | number | boolean | null);
  }
  return out;
}

function batchStatus(summary: ValidationSummary): "validated" | "has_errors" {
  return summary.errorCount > 0 || summary.newVehicles + summary.updatedVehicles === 0 ? "has_errors" : "validated";
}

// ------------------------------------------------------------------ subida
export async function uploadImport(ctx: ServiceCtx, input: { branchId: string; fileName: string; data: Buffer }): Promise<string> {
  const orgId = ctx.membership.organizationId;
  await enforceRateLimits([[`import:org:${orgId}`, RATE_LIMITS.importUploadsPerOrg]]);

  let parsed;
  try {
    parsed = await parseImportFile(input.data);
  } catch (err) {
    if (err instanceof ImportParseError) throw new DomainError("import_file_invalid", err.code);
    throw err;
  }
  const sha = createHash("sha256").update(input.data).digest();
  const fileName = input.fileName.replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 255) || "archivo";

  return withRls(ctx.auth, async (tx) => {
    const wctx = await workshopContext(tx, orgId, input.branchId, false);
    const { rows, summary } = validateRows(parsed.rows, wctx);
    const repeated = await tx
      .selectFrom("import_batches")
      .select("id")
      .where("branch_id", "=", input.branchId)
      .where("file_sha256", "=", sha)
      .where("status", "=", "committed")
      .executeTakeFirst();

    const batchSummary: BatchSummary = {
      ...summary,
      kind: parsed.kind,
      unknownHeaders: parsed.unknownHeaders.slice(0, 20),
      repeatedFile: Boolean(repeated),
      options: { allowNoEmail: false, updateExisting: false },
    };
    const batch = await tx
      .insertInto("import_batches")
      .values({
        organization_id: orgId,
        branch_id: input.branchId,
        uploaded_by: ctx.auth.userId,
        file_name: fileName,
        file_sha256: sha,
        row_count: rows.length,
        status: batchStatus(summary),
        summary: JSON.stringify(batchSummary),
        error_count: summary.errorCount,
        warning_count: summary.warningCount,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    for (let i = 0; i < rows.length; i += 500) {
      await tx
        .insertInto("import_rows")
        .values(rows.slice(i, i + 500).map((r) => ({ ...rowInsert(r), batch_id: batch.id, organization_id: orgId, branch_id: input.branchId })))
        .execute();
    }
    return batch.id;
  });
}

// --------------------------------------------------------------- consultas
export async function getBatch(ctx: ServiceCtx, batchId: string): Promise<BatchInfo | null> {
  const row = await withRls(ctx.auth, (tx) =>
    tx
      .selectFrom("import_batches as b")
      .innerJoin("branches as br", "br.id", "b.branch_id")
      .select([
        "b.id",
        "b.branch_id as branchId",
        "br.name as branchName",
        "b.file_name as fileName",
        "b.status",
        "b.row_count as rowCount",
        "b.error_count as errorCount",
        "b.warning_count as warningCount",
        "b.summary",
        "b.created_at as createdAt",
        "b.committed_at as committedAt",
        "b.expires_at as expiresAt",
      ])
      .where("b.id", "=", batchId)
      .where("b.organization_id", "=", ctx.membership.organizationId)
      .executeTakeFirst(),
  );
  return row ? { ...row, summary: row.summary as unknown as BatchSummary } : null;
}

export async function listBatches(ctx: ServiceCtx): Promise<BatchInfo[]> {
  const rows = await withRls(ctx.auth, (tx) =>
    tx
      .selectFrom("import_batches as b")
      .innerJoin("branches as br", "br.id", "b.branch_id")
      .select([
        "b.id",
        "b.branch_id as branchId",
        "br.name as branchName",
        "b.file_name as fileName",
        "b.status",
        "b.row_count as rowCount",
        "b.error_count as errorCount",
        "b.warning_count as warningCount",
        "b.summary",
        "b.created_at as createdAt",
        "b.committed_at as committedAt",
        "b.expires_at as expiresAt",
      ])
      .where("b.organization_id", "=", ctx.membership.organizationId)
      .where("b.status", "!=", "canceled")
      .orderBy("b.created_at", "desc")
      .limit(20)
      .execute(),
  );
  return rows.map((r) => ({ ...r, summary: r.summary as unknown as BatchSummary }));
}

export type RowFilter = "errors" | "warnings" | "all";

export interface StagedRow {
  rowNumber: number;
  raw: Record<string, string | number | boolean | null>;
  errors: ValidatedRow["errors"];
  warnings: ValidatedRow["warnings"];
  action: string;
}

export async function listRows(
  ctx: ServiceCtx,
  batchId: string,
  f: { filter: RowFilter; page: number; pageSize: number },
): Promise<{ rows: StagedRow[]; total: number; page: number; pageSize: number }> {
  return withRls(ctx.auth, async (tx) => {
    let q = tx.selectFrom("import_rows").where("batch_id", "=", batchId).where("organization_id", "=", ctx.membership.organizationId);
    if (f.filter === "errors") q = q.where(sql<boolean>`jsonb_array_length(errors) > 0`);
    if (f.filter === "warnings") q = q.where(sql<boolean>`jsonb_array_length(warnings) > 0`);
    const rows = await q
      .select(["row_number as rowNumber", "raw", "errors", "warnings", "action", sql<string>`count(*) over ()`.as("total")])
      .orderBy("row_number")
      .limit(f.pageSize)
      .offset((f.page - 1) * f.pageSize)
      .execute();
    return {
      rows: rows.map((r) => ({
        rowNumber: r.rowNumber,
        raw: r.raw as StagedRow["raw"],
        errors: r.errors as unknown as StagedRow["errors"],
        warnings: r.warnings as unknown as StagedRow["warnings"],
        action: r.action ?? "",
      })),
      total: rows.length ? Number(rows[0].total) : 0,
      page: f.page,
      pageSize: f.pageSize,
    };
  });
}

/** Filas con errores o avisos (para el informe descargable). */
export async function reportRows(ctx: ServiceCtx, batchId: string): Promise<StagedRow[]> {
  const page = await listRows(ctx, batchId, { filter: "all", page: 1, pageSize: 5000 });
  return page.rows.filter((r) => r.errors.length || r.warnings.length);
}

// --------------------------------------------------------- correcciones
/**
 * Vuelve a validar TODO el lote (los duplicados dependen del resto de filas)
 * tras aplicar un cambio, y guarda el resultado con una sola sentencia.
 */
async function revalidate(
  ctx: ServiceCtx,
  batchId: string,
  change: { rows?: (raw: Map<number, RawRow>) => void; options?: Partial<ImportOptions> },
): Promise<BatchSummary> {
  const orgId = ctx.membership.organizationId;
  return withRls(ctx.auth, async (tx) => {
    const batch = await tx
      .selectFrom("import_batches")
      .select(["branch_id", "status", "summary"])
      .where("id", "=", batchId)
      .where("organization_id", "=", orgId)
      .forUpdate()
      .executeTakeFirst();
    if (!batch) throw new DomainError("not_found");
    if (!(EDITABLE as readonly string[]).includes(batch.status)) throw new DomainError("import_invalid", "not_editable");

    const prev = batch.summary as unknown as BatchSummary;
    const options: ImportOptions = { ...prev.options, ...change.options };
    const stored = await tx.selectFrom("import_rows").select(["row_number", "raw"]).where("batch_id", "=", batchId).orderBy("row_number").execute();
    const raws = new Map<number, RawRow>(stored.map((r) => [r.row_number, r.raw as RawRow]));
    change.rows?.(raws);

    const wctx = await workshopContext(tx, orgId, batch.branch_id, options.allowNoEmail, options.updateExisting ?? false);
    const { rows, summary } = validateRows(
      [...raws.entries()].map(([rowNumber, raw]) => ({ rowNumber, raw })),
      wctx,
    );
    // Un único JSON con todas las filas (objetos, no texto) para jsonb_to_recordset.
    const payload = JSON.stringify(rows.map(rowData));
    await sql`
      update import_rows r
         set raw = x.raw, normalized = x.normalized, errors = x.errors, warnings = x.warnings,
             action = x.action, matched_customer_id = x.matched_customer_id, matched_vehicle_id = x.matched_vehicle_id,
             updated_at = now()
        from jsonb_to_recordset(${payload}::jsonb) as x(row_number int, raw jsonb, normalized jsonb, errors jsonb,
                                                        warnings jsonb, action text, matched_customer_id uuid,
                                                        matched_vehicle_id uuid)
       where r.batch_id = ${batchId} and r.row_number = x.row_number
    `.execute(tx);

    const next: BatchSummary = { ...prev, ...summary, options };
    await tx
      .updateTable("import_batches")
      .set({ status: batchStatus(summary), summary: JSON.stringify(next), error_count: summary.errorCount, warning_count: summary.warningCount })
      .where("id", "=", batchId)
      .execute();
    return next;
  });
}

export async function updateRow(ctx: ServiceCtx, batchId: string, rowNumber: number, values: Partial<Record<ImportColumn, string>>) {
  return revalidate(ctx, batchId, {
    rows: (raws) => {
      const current = raws.get(rowNumber);
      if (!current) throw new DomainError("not_found");
      const next: RawRow = { __excluded: current.__excluded };
      for (const col of IMPORT_COLUMNS) {
        const v = values[col];
        next[col] = v === undefined ? (current[col] ?? null) : v.trim() || null;
      }
      raws.set(rowNumber, next);
    },
  });
}

export async function setRowExcluded(ctx: ServiceCtx, batchId: string, rowNumber: number, excluded: boolean) {
  return revalidate(ctx, batchId, {
    rows: (raws) => {
      const current = raws.get(rowNumber);
      if (!current) throw new DomainError("not_found");
      raws.set(rowNumber, { ...current, __excluded: excluded || undefined });
    },
  });
}

export async function setOptions(ctx: ServiceCtx, batchId: string, options: Partial<ImportOptions>) {
  return revalidate(ctx, batchId, { options });
}

export async function cancelImport(ctx: ServiceCtx, batchId: string): Promise<void> {
  await withRls(ctx.auth, async (tx) => {
    const r = await tx
      .updateTable("import_batches")
      .set({ status: "canceled" })
      .where("id", "=", batchId)
      .where("organization_id", "=", ctx.membership.organizationId)
      .where("status", "in", ["uploaded", "validated", "has_errors"])
      .executeTakeFirst();
    if (Number(r.numUpdatedRows) === 0) throw new DomainError("import_invalid", "not_editable");
    // Sin la importación, sus datos personales en staging sobran.
    await tx.deleteFrom("import_rows").where("batch_id", "=", batchId).execute();
  });
}

// ------------------------------------------------------------ confirmación
export interface LimitCheck {
  customersNew: number;
  customersAvailable: number | null;
  vehiclesNew: number;
  vehiclesAvailable: number | null;
  ok: boolean;
}

/** Comprobación previa de límites del plan (la BD lo vuelve a comprobar al confirmar). */
export async function checkLimits(ctx: ServiceCtx, planCode: PlanCode | null, summary: ValidationSummary): Promise<LimitCheck> {
  const plan = planCode ? PLANS[planCode] : null;
  const orgId = ctx.membership.organizationId;
  const counts = await withRls(ctx.auth, async (tx) => {
    const { rows } = await sql<{ customers: string; vehicles: string }>`
      select (select count(*) from customers where organization_id = ${orgId} and deleted_at is null) as customers,
             (select count(*) from vehicles where organization_id = ${orgId} and deleted_at is null and status = 'active') as vehicles
    `.execute(tx);
    return rows[0];
  });
  const customersAvailable = plan?.maxCustomers == null ? null : Math.max(0, plan.maxCustomers - Number(counts.customers));
  const vehiclesAvailable = plan?.maxActiveVehicles == null ? null : Math.max(0, plan.maxActiveVehicles - Number(counts.vehicles));
  return {
    customersNew: summary.newCustomers,
    customersAvailable,
    vehiclesNew: summary.newVehicles,
    vehiclesAvailable,
    ok:
      (customersAvailable === null || summary.newCustomers <= customersAvailable) &&
      (vehiclesAvailable === null || summary.newVehicles <= vehiclesAvailable),
  };
}

export async function commitImport(
  ctx: ServiceCtx,
  batchId: string,
  allowRepeat: boolean,
): Promise<{ customers: number; attachedCustomers: number; vehicles: number; maintenanceRecords: number }> {
  return withRls(ctx.auth, async (tx) => {
    const { rows } = await sql<{ result: { customers: number; attachedCustomers: number; vehicles: number; maintenanceRecords: number } }>`
      select app.commit_import(${batchId}, ${allowRepeat}) as result
    `.execute(tx);
    return rows[0].result;
  });
}

export { summarize };
