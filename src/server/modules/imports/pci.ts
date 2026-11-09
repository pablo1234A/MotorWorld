import "server-only";

import { createHash } from "node:crypto";

import ExcelJS from "exceljs";
import { sql } from "kysely";
import type { z } from "zod";

import {
  cellText,
  matchAgent,
  matchCategory,
  matchEstablishment,
  PCI_COLUMNS,
  PCI_EXAMPLE_MARK,
  PCI_IMPORT_LABELS,
  type PciImportKind,
  type PciIssue,
  pciColumnFor,
} from "@/lib/imports/pci";
import { MAX_IMPORT_ROWS } from "@/lib/imports/columns";
import type { RawValue } from "@/lib/imports/validate";
import { normalizeTaxId } from "@/lib/tax-id";
import {
  type CreateEquipmentInput,
  createEquipmentSchema,
  type CreateInstallationInput,
  createInstallationSchema,
} from "@/lib/validation/pci";
import { createCustomerSchema } from "@/lib/validation/workshop";
import { type Tx, withRls } from "@/server/db/client";
import { DomainError, mapDatabaseError } from "@/server/db/errors";
import { enforceRateLimits, RATE_LIMITS } from "@/server/security/rate-limit";

import type { ServiceCtx } from "../branches/service";
import { insertEquipment } from "../equipment/service";
import { insertInstallation } from "../installations/service";
import { CSV_MIME, toCsv, XLSX_MIME } from "./files";
import { ImportParseError, readGrid } from "./parse";

/**
 * Importación PCI en dos fases, como la de vehículos (docs/IMPORTACION.md):
 *  1. Staging: se lee el archivo y cada fila se valida con las MISMAS reglas
 *     del panel (esquemas Zod) y contra lo que ya existe. No se crea nada.
 *  2. Confirmación: todas las filas válidas se crean en UNA transacción con
 *     la RLS del usuario (límites del plan, códigos y vencimientos los pone
 *     la BD); si algo falla, no se crea ninguna.
 * Las filas con errores se pueden omitir; las duplicadas se omiten siempre.
 */

export interface PciBatchSummary {
  importKind: PciImportKind;
  fileKind: "xlsx" | "csv";
  unknownHeaders: string[];
  toCreate: number;
  duplicates: number;
  errorRows: number;
  repeatedFile: boolean;
  committed?: { created: number; skipped: number };
}

export interface PciStagedRow {
  rowNumber: number;
  values: Record<string, string>;
  action: string | null;
  errors: PciIssue[];
  warnings: PciIssue[];
}

type Lookups = {
  customersByTax: Map<string, string>;
  customersByEmail: Map<string, string>;
  customersByName: Map<string, string[]>;
  installationsByName: Map<string, Array<{ id: string; customerId: string }>>;
  installationKeys: Set<string>;
  codes: Set<string>;
  types: Array<{ id: string; category: string; name: string; code: string }>;
  customerNames: Map<string, string>;
};

const key = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

async function lookups(
  tx: Tx,
  orgId: string,
  branchId: string,
): Promise<Lookups> {
  const [customers, installations, codes, types] = await Promise.all([
    tx
      .selectFrom("customers")
      .select([
        "id",
        "tax_id",
        sql<string | null>`email::text`.as("email"),
        "first_name",
        "last_name",
      ])
      .where("organization_id", "=", orgId)
      .where("branch_id", "=", branchId)
      .where("deleted_at", "is", null)
      .execute(),
    tx
      .selectFrom("installations")
      .select(["id", "name", "customer_id"])
      .where("organization_id", "=", orgId)
      .where("branch_id", "=", branchId)
      .where("deleted_at", "is", null)
      .execute(),
    tx
      .selectFrom("equipment")
      .select(sql<string>`upper(code)`.as("code"))
      .where("organization_id", "=", orgId)
      .where("deleted_at", "is", null)
      .execute(),
    tx
      .selectFrom("equipment_types")
      .select(["id", "category_code", "name", "code"])
      .where((eb) =>
        eb.or([
          eb("organization_id", "is", null),
          eb("organization_id", "=", orgId),
        ]),
      )
      .execute(),
  ]);
  const l: Lookups = {
    customersByTax: new Map(),
    customersByEmail: new Map(),
    customersByName: new Map(),
    installationsByName: new Map(),
    installationKeys: new Set(),
    codes: new Set(codes.map((c) => c.code)),
    customerNames: new Map(),
    types: types.map((t) => ({
      id: t.id,
      category: t.category_code,
      name: t.name,
      code: t.code,
    })),
  };
  for (const c of customers) {
    const name = `${c.first_name} ${c.last_name}`.trim();
    l.customerNames.set(c.id, name);
    if (c.tax_id) l.customersByTax.set(c.tax_id, c.id);
    if (c.email) l.customersByEmail.set(c.email.toLowerCase(), c.id);
    l.customersByName.set(key(name), [
      ...(l.customersByName.get(key(name)) ?? []),
      c.id,
    ]);
  }
  for (const i of installations) {
    l.installationsByName.set(key(i.name), [
      ...(l.installationsByName.get(key(i.name)) ?? []),
      { id: i.id, customerId: i.customer_id },
    ]);
    l.installationKeys.add(`${i.customer_id}|${key(i.name)}`);
  }
  return l;
}

function zodIssues(
  err: z.ZodError,
  rename: Record<string, string> = {},
): PciIssue[] {
  return err.issues.map((i) => {
    const k = String(i.path[0] ?? "");
    return { column: rename[k] ?? k, message: i.message };
  });
}

function findCustomer(
  l: Lookups,
  ref: string,
): { id?: string; error?: string } {
  if (!ref) return { error: "Indica el cliente" };
  const tax = normalizeTaxId(ref);
  if (tax && l.customersByTax.has(tax))
    return { id: l.customersByTax.get(tax) };
  if (ref.includes("@") && l.customersByEmail.has(ref.toLowerCase()))
    return { id: l.customersByEmail.get(ref.toLowerCase()) };
  const byName = l.customersByName.get(key(ref)) ?? [];
  if (byName.length === 1) return { id: byName[0] };
  if (byName.length > 1)
    return {
      error: "Hay varios clientes con ese nombre: usa su CIF/NIF o su correo",
    };
  return {
    error:
      "No hay ningún cliente con ese CIF/NIF, correo o nombre (impórtalo o créalo antes)",
  };
}

/** Valida una fila y devuelve lo que se creará (o por qué no). */
function validate(
  kind: PciImportKind,
  v: Record<string, string>,
  l: Lookups,
  seen: Set<string>,
): Omit<PciStagedRow, "rowNumber" | "values"> & {
  normalized: Record<string, unknown> | null;
} {
  const errors: PciIssue[] = [];
  const warnings: PciIssue[] = [];
  if (kind === "customers") {
    const k = key(v.kind ?? "");
    const customerKind = !k
      ? v.legalName || /^[A-Z]/i.test(normalizeTaxId(v.taxId ?? ""))
        ? "company"
        : "individual"
      : /^part/.test(k)
        ? "individual"
        : /^(empr|soc|com|org|ent)/.test(k)
          ? "company"
          : null;
    if (!customerKind)
      errors.push({
        column: "kind",
        message: "Escribe «empresa» o «particular»",
      });
    const r = createCustomerSchema.safeParse({
      ...v,
      customerKind: customerKind ?? "company",
      branchId: "00000000-0000-4000-8000-000000000000",
      source: "manual", // validación con las reglas del panel; al crear se guarda «import»
    });
    if (!r.success)
      errors.push(...zodIssues(r.error).filter((i) => i.column !== "branchId"));
    if (errors.length || !r.success)
      return { action: null, errors, warnings, normalized: null };
    const d = r.data;
    const dup =
      (d.taxId &&
        (l.customersByTax.has(d.taxId) || seen.has(`tax:${d.taxId}`))) ||
      (d.email &&
        (l.customersByEmail.has(String(d.email)) ||
          seen.has(`mail:${d.email}`)));
    if (dup)
      return {
        action: "skip_duplicate",
        errors,
        warnings: [
          {
            column: d.taxId ? "taxId" : "email",
            message: "Ya existe un cliente con ese CIF/NIF o correo: se omite",
          },
        ],
        normalized: null,
      };
    if (d.taxId) seen.add(`tax:${d.taxId}`);
    if (d.email) seen.add(`mail:${d.email}`);
    if (!d.email)
      warnings.push({
        column: "email",
        message: "Sin correo: no recibirá avisos",
      });
    return {
      action: "create_customer",
      errors,
      warnings,
      normalized: d as unknown as Record<string, unknown>,
    };
  }
  if (kind === "installations") {
    const c = findCustomer(l, v.customer ?? "");
    if (c.error) errors.push({ column: "customer", message: c.error });
    const type = matchEstablishment(v.establishmentType ?? "");
    if (!type)
      errors.push({
        column: "establishmentType",
        message:
          "Tipo de establecimiento no reconocido (usa uno de la lista de la plantilla)",
      });
    const r = createInstallationSchema.safeParse({
      ...v,
      establishmentType: type ?? "other",
      customerId: c.id ?? "00000000-0000-4000-8000-000000000000",
    });
    if (!r.success)
      errors.push(
        ...zodIssues(r.error, { customerId: "customer" }).filter(
          (i) => !(c.error && i.column === "customer"),
        ),
      );
    if (errors.length || !r.success)
      return { action: null, errors, warnings, normalized: null };
    const dupKey = `${c.id}|${key(r.data.name)}`;
    if (l.installationKeys.has(dupKey) || seen.has(dupKey))
      return {
        action: "skip_duplicate",
        errors,
        warnings: [
          {
            column: "name",
            message:
              "Ese cliente ya tiene una instalación con ese nombre: se omite",
          },
        ],
        normalized: null,
      };
    seen.add(dupKey);
    return {
      action: "create_installation",
      errors,
      warnings,
      normalized: r.data as unknown as Record<string, unknown>,
    };
  }
  // equipos
  let installationId: string | undefined;
  const candidates = l.installationsByName.get(key(v.installation ?? "")) ?? [];
  if (!v.installation)
    errors.push({ column: "installation", message: "Indica la instalación" });
  else if (!candidates.length)
    errors.push({
      column: "installation",
      message:
        "No hay ninguna instalación con ese nombre (impórtala o créala antes)",
    });
  else if (candidates.length === 1) installationId = candidates[0].id;
  else {
    const c = v.customer
      ? findCustomer(l, v.customer)
      : {
          error:
            "Hay varias instalaciones con ese nombre: indica también el cliente",
        };
    const match = c.id ? candidates.filter((x) => x.customerId === c.id) : [];
    if (match.length === 1) installationId = match[0].id;
    else
      errors.push({
        column: v.customer ? "customer" : "installation",
        message:
          c.error ?? "Ese cliente no tiene una instalación con ese nombre",
      });
  }
  const category = matchCategory(v.category ?? "");
  if (!category)
    errors.push({
      column: "category",
      message:
        "Categoría no reconocida (extintor, BIE, hidrante, columna seca, detección, extinción automática…)",
    });
  let typeId = "";
  if (v.type && category) {
    const t = l.types.find(
      (x) =>
        x.category === category &&
        (key(x.name) === key(v.type) || x.code === v.type.toLowerCase()),
    );
    if (t) typeId = t.id;
    else
      warnings.push({
        column: "type",
        message: "Tipo no reconocido: se deja sin tipo",
      });
  }
  let agent = "";
  if (category === "extinguisher" && v.agent) {
    agent = matchAgent(v.agent) ?? "";
    if (!agent)
      errors.push({
        column: "agent",
        message:
          "Agente extintor no reconocido (polvo ABC, CO2, agua, espuma…)",
      });
  }
  const unit = key(v.chargeUnit ?? "");
  const r = createEquipmentSchema.safeParse({
    ...v,
    categoryCode: category ?? "other",
    installationId: installationId ?? "00000000-0000-4000-8000-000000000000",
    typeId,
    agent,
    chargeUnit: !v.chargeValue
      ? ""
      : !unit || /^k/.test(unit)
        ? "kg"
        : /^l/.test(unit)
          ? "l"
          : unit,
    chargeValue: (v.chargeValue ?? "").replace(",", "."),
    retimbradosBefore: v.retimbradosBefore || "0",
    mobility: "portable",
  });
  if (!r.success) {
    const skip = new Set([
      ...(installationId ? [] : ["installation"]),
      ...(category ? [] : ["category"]),
      ...errors.map((e) => e.column),
    ]);
    errors.push(
      ...zodIssues(r.error, {
        installationId: "installation",
        categoryCode: "category",
      }).filter((i) => !skip.has(i.column)),
    );
  }
  if (errors.length || !r.success)
    return { action: null, errors, warnings, normalized: null };
  if (r.data.code) {
    const code = r.data.code.toUpperCase();
    if (l.codes.has(code) || seen.has(`code:${code}`))
      return {
        action: null,
        errors: [
          { column: "code", message: "Ya hay otro equipo con ese código" },
        ],
        warnings,
        normalized: null,
      };
    seen.add(`code:${code}`);
  }
  return {
    action: "create_equipment",
    errors,
    warnings,
    normalized: r.data as unknown as Record<string, unknown>,
  };
}

// ------------------------------------------------------------------- subida

export async function uploadPciImport(
  ctx: ServiceCtx,
  input: {
    kind: PciImportKind;
    branchId: string;
    fileName: string;
    data: Buffer;
  },
): Promise<string> {
  const orgId = ctx.membership.organizationId;
  await enforceRateLimits([
    [`import:org:${orgId}`, RATE_LIMITS.importUploadsPerOrg],
  ]);
  let parsed;
  try {
    parsed = await readGrid(input.data);
  } catch (err) {
    if (err instanceof ImportParseError)
      throw new DomainError("import_file_invalid", err.code);
    throw err;
  }
  const { grid } = parsed;
  // Cabecera: la primera de las 10 primeras filas con al menos 2 columnas reconocidas.
  let header = -1;
  let mapping: Array<string | undefined> = [];
  for (let i = 0; i < Math.min(grid.length, 10); i++) {
    const m = grid[i].map((h) => pciColumnFor(input.kind, h));
    if (m.filter(Boolean).length >= 2) {
      header = i;
      mapping = m;
      break;
    }
  }
  if (header < 0) throw new DomainError("import_file_invalid", "no_header");
  const columns = PCI_COLUMNS[input.kind];
  const missing = columns.filter((c) => c.required && !mapping.includes(c.key));
  if (missing.length)
    throw new DomainError("import_file_invalid", "missing_columns_pci");
  const unknownHeaders = grid[header]
    .map((h, i) => (mapping[i] ? null : String(h ?? "").trim()))
    .filter((h): h is string => Boolean(h));

  const dates = new Set(columns.filter((c) => c.date).map((c) => c.key));
  const rows: Array<{
    rowNumber: number;
    values: Record<string, string>;
    badDates: string[];
  }> = [];
  for (let i = header + 1; i < grid.length; i++) {
    const values: Record<string, string> = {};
    const badDates: string[] = [];
    grid[i].forEach((cell: RawValue, col) => {
      const k = mapping[col];
      if (!k || values[k] !== undefined) return;
      const t = cellText(cell, dates.has(k));
      if (t.ok) values[k] = t.value;
      else {
        values[k] = String(cell ?? "");
        badDates.push(k);
      }
    });
    if (Object.values(values).every((x) => !x)) continue;
    if (Object.values(values).some((x) => x.includes(PCI_EXAMPLE_MARK)))
      continue; // fila de ejemplo de la plantilla
    rows.push({ rowNumber: i + 1, values, badDates });
  }
  if (!rows.length) throw new DomainError("import_file_invalid", "no_rows");
  if (rows.length > MAX_IMPORT_ROWS)
    throw new DomainError("import_file_invalid", "too_many_rows");

  const sha = createHash("sha256").update(input.data).digest();
  const fileName =
    input.fileName.replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 255) ||
    "archivo";
  return withRls(ctx.auth, async (tx) => {
    const l = await lookups(tx, orgId, input.branchId);
    const seen = new Set<string>();
    const staged = rows.map((r) => {
      const out = validate(input.kind, r.values, l, seen);
      if (r.badDates.length)
        out.errors.unshift(
          ...r.badDates.map((c) => ({
            column: c,
            message: "Fecha no válida (usa DD/MM/AAAA)",
          })),
        );
      if (r.badDates.length) out.action = null;
      return { ...r, ...out };
    });
    const repeated = await tx
      .selectFrom("import_batches")
      .select("id")
      .where("branch_id", "=", input.branchId)
      .where("file_sha256", "=", sha)
      .where("status", "=", "committed")
      .executeTakeFirst();
    const summary: PciBatchSummary = {
      importKind: input.kind,
      fileKind: parsed.kind,
      unknownHeaders: unknownHeaders.slice(0, 20),
      toCreate: staged.filter((s) => s.action?.startsWith("create_")).length,
      duplicates: staged.filter((s) => s.action === "skip_duplicate").length,
      errorRows: staged.filter((s) => s.errors.length).length,
      repeatedFile: Boolean(repeated),
    };
    const batch = await tx
      .insertInto("import_batches")
      .values({
        organization_id: orgId,
        branch_id: input.branchId,
        uploaded_by: ctx.auth.userId,
        kind: input.kind,
        file_name: fileName,
        file_sha256: sha,
        row_count: staged.length,
        status:
          summary.errorRows || !summary.toCreate ? "has_errors" : "validated",
        summary: JSON.stringify(summary),
        error_count: summary.errorRows,
        warning_count: staged.filter((s) => s.warnings.length).length,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    for (let i = 0; i < staged.length; i += 500) {
      await tx
        .insertInto("import_rows")
        .values(
          staged.slice(i, i + 500).map((s) => ({
            batch_id: batch.id,
            organization_id: orgId,
            branch_id: input.branchId,
            row_number: s.rowNumber,
            raw: JSON.stringify(s.values),
            normalized: s.normalized ? JSON.stringify(s.normalized) : null,
            errors: JSON.stringify(s.errors),
            warnings: JSON.stringify(s.warnings),
            action: s.action,
          })),
        )
        .execute();
    }
    return batch.id;
  });
}

// ---------------------------------------------------------------- consultas

export async function pciRows(
  ctx: ServiceCtx,
  batchId: string,
): Promise<PciStagedRow[]> {
  const rows = await withRls(ctx.auth, (tx) =>
    tx
      .selectFrom("import_rows")
      .select(["row_number", "raw", "action", "errors", "warnings"])
      .where("batch_id", "=", batchId)
      .where("organization_id", "=", ctx.membership.organizationId)
      .orderBy("row_number")
      .execute(),
  );
  return rows.map((r) => ({
    rowNumber: r.row_number,
    values: r.raw as unknown as Record<string, string>,
    action: r.action,
    errors: r.errors as unknown as PciIssue[],
    warnings: r.warnings as unknown as PciIssue[],
  }));
}

// ------------------------------------------------------------- confirmación

/**
 * Crea todas las filas válidas en una transacción. Con filas con errores,
 * solo si se pide expresamente omitirlas (`skipErrors`).
 */
export async function commitPciImport(
  ctx: ServiceCtx,
  batchId: string,
  opts: { skipErrors: boolean; allowRepeat: boolean },
): Promise<{ created: number; skipped: number }> {
  const orgId = ctx.membership.organizationId;
  try {
    return await withRls(ctx.auth, async (tx) => {
      const {
        rows: [batch],
      } = await sql<{
        id: string;
        status: string;
        kind: string;
        branch_id: string;
        summary: PciBatchSummary;
        expires_at: Date;
      }>`
        select id, status, kind, branch_id, summary, expires_at from import_batches where id = ${batchId} and organization_id = ${orgId} for update`.execute(
        tx,
      );
      if (!batch || batch.kind === "vehicles")
        throw new DomainError("not_found");
      if (batch.status === "committed")
        throw new DomainError("import_invalid", "already_committed");
      if (!["validated", "has_errors"].includes(batch.status))
        throw new DomainError("import_invalid", "not_editable");
      if (batch.expires_at < new Date())
        throw new DomainError("import_invalid", "expired");
      if (batch.summary.repeatedFile && !opts.allowRepeat)
        throw new DomainError("import_invalid", "repeated_file");
      if (batch.summary.errorRows && !opts.skipErrors)
        throw new DomainError("import_invalid", "has_errors");
      const rows = await tx
        .selectFrom("import_rows")
        .select(["row_number", "normalized", "action"])
        .where("batch_id", "=", batchId)
        .where("action", "like", "create_%")
        .orderBy("row_number")
        .execute();
      if (!rows.length)
        throw new DomainError("import_invalid", "nothing_to_import");
      for (const r of rows) {
        const n = r.normalized as Record<string, unknown>;
        if (r.action === "create_customer") {
          await tx
            .insertInto("customers")
            .values({
              organization_id: orgId,
              branch_id: batch.branch_id,
              first_name: n.firstName as string,
              last_name: (n.lastName as string) ?? "",
              email: (n.email as string) ?? null,
              phone: (n.phone as string) ?? null,
              source: "import",
              notes: (n.notes as string) ?? null,
              reminders_opt_out: false,
              created_by: ctx.auth.userId,
              import_batch_id: batchId,
              customer_kind: (n.customerKind as string) ?? "company",
              legal_name: (n.legalName as string) ?? null,
              tax_id: (n.taxId as string) ?? null,
              address_line1: (n.addressLine1 as string) ?? null,
              postal_code: (n.postalCode as string) ?? null,
              city: (n.city as string) ?? null,
              province: (n.province as string) ?? null,
              contact_name: (n.contactName as string) ?? null,
              contact_role: (n.contactRole as string) ?? null,
            })
            .execute();
        } else if (r.action === "create_installation") {
          // `normalized` es la salida del mismo esquema Zod guardada al subir el archivo.
          await insertInstallation(tx, ctx, n as unknown as CreateInstallationInput, {
            importBatchId: batchId,
          });
        } else {
          await insertEquipment(tx, ctx, n as unknown as CreateEquipmentInput, {
            importBatchId: batchId,
          });
        }
      }
      const result = {
        created: rows.length,
        skipped:
          Number(
            (
              await tx
                .selectFrom("import_rows")
                .select((eb) => eb.fn.countAll<string>().as("n"))
                .where("batch_id", "=", batchId)
                .executeTakeFirstOrThrow()
            ).n,
          ) - rows.length,
      };
      await tx
        .updateTable("import_batches")
        .set({
          status: "committed",
          committed_at: new Date(),
          error_count: 0,
          summary: JSON.stringify({
            ...batch.summary,
            committed: {
              created: result.created,
              skipped: Number(result.skipped),
            },
          }),
        })
        .where("id", "=", batchId)
        .execute();
      return { created: result.created, skipped: Number(result.skipped) };
    });
  } catch (err) {
    throw err instanceof DomainError ? err : mapDatabaseError(err);
  }
}

// ---------------------------------------------------------- plantillas e informe

export async function pciTemplateXlsx(kind: PciImportKind): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Datos");
  const cols = PCI_COLUMNS[kind];
  ws.addRow(cols.map((c) => c.label));
  ws.addRow(
    cols.map((c, i) =>
      i === 0 ? `${c.example} ${PCI_EXAMPLE_MARK}`.trim() : c.example,
    ),
  );
  ws.getRow(1).font = { bold: true };
  ws.columns.forEach((c) => (c.width = 24));
  const help = wb.addWorksheet("Instrucciones");
  help.addRow([
    `Importación de ${PCI_IMPORT_LABELS[kind].title.toLowerCase()} · RevisaYa`,
  ]);
  help.addRow([PCI_IMPORT_LABELS[kind].hint]);
  help.addRow([
    "La fila marcada como «(ejemplo)» se ignora: bórrala o déjala. Fechas en formato DD/MM/AAAA. Máximo 2.000 filas por archivo.",
  ]);
  help.addRow([
    "Orden recomendado: primero clientes, luego instalaciones y por último equipos.",
  ]);
  help.addRow([]);
  help.addRow(["Columna", "Obligatoria"]);
  for (const c of cols) help.addRow([c.label, c.required ? "Sí" : "No"]);
  help.getColumn(1).width = 50;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function pciTemplateCsv(kind: PciImportKind): Buffer {
  const cols = PCI_COLUMNS[kind];
  return toCsv([
    cols.map((c) => c.label),
    cols.map((c, i) =>
      i === 0 ? `${c.example} ${PCI_EXAMPLE_MARK}`.trim() : c.example,
    ),
  ]);
}

const ACTION_LABELS: Record<string, string> = {
  create_customer: "Se crea",
  create_installation: "Se crea",
  create_equipment: "Se crea",
  skip_duplicate: "Se omite (ya existe)",
};

export function pciReportCsv(
  kind: PciImportKind,
  rows: PciStagedRow[],
): Buffer {
  const cols = PCI_COLUMNS[kind];
  const label = (k: string) => cols.find((c) => c.key === k)?.label ?? k;
  return toCsv([
    ["Fila", "Resultado", "Errores", "Avisos", ...cols.map((c) => c.label)],
    ...rows.map((r) => [
      r.rowNumber,
      r.errors.length ? "Con errores" : (ACTION_LABELS[r.action ?? ""] ?? "—"),
      r.errors.map((e) => `${label(e.column)}: ${e.message}`).join(" · "),
      r.warnings.map((e) => `${label(e.column)}: ${e.message}`).join(" · "),
      ...cols.map((c) => r.values[c.key] ?? ""),
    ]),
  ]);
}

export { CSV_MIME, XLSX_MIME };
