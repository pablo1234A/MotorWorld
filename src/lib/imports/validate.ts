import { addDays, isValidIsoDate } from "@/lib/dates";
import { normalizePhone } from "@/lib/phone";
import { checkPlate } from "@/lib/plate";

import { EXAMPLE_ROW, IMPORT_COLUMNS, type ImportColumn } from "./columns";

/**
 * Validación fila a fila de una importación (docs/IMPORTACION.md §3).
 * Función pura: recibe las filas tal como vienen del archivo y el contexto
 * del taller (clientes y matrículas existentes) y devuelve, para cada fila,
 * sus datos normalizados, errores, avisos y la acción que se hará.
 */

export type RawValue = string | number | Date | null;
export type RawRow = Partial<Record<ImportColumn, RawValue>> & { __excluded?: boolean };

export type IssueCode =
  | "name_missing"
  | "name_too_long"
  | "email_missing"
  | "email_missing_no_reminders"
  | "email_invalid"
  | "phone_invalid"
  | "plate_missing"
  | "plate_invalid"
  | "plate_unrecognized"
  | "plate_repeated_in_file"
  | "plate_exists"
  | "last_service_missing"
  | "date_invalid"
  | "date_two_digit_year"
  | "last_service_future"
  | "date_too_old"
  | "next_before_last"
  | "km_invalid"
  | "km_negative"
  | "customer_exists"
  | "email_names_differ"
  | "text_too_long"
  | "example_row";

export interface Issue {
  code: IssueCode;
  column?: ImportColumn;
  /** Dato adicional (fila relacionada, valor…), sin datos personales. */
  ref?: string | number;
}

export interface NormalizedRow {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  plate: string;
  plateNormalized: string;
  make: string | null;
  model: string | null;
  lastService: string | null;
  km: number | null;
  nextService: string | null;
  /** Clave de agrupación: filas con la misma clave son el mismo cliente. */
  customerKey: string;
}

export type RowAction = "create_customer_and_vehicle" | "attach_to_existing_customer" | "skip_duplicate" | "skip_empty" | "skip_excluded";

export interface ValidatedRow {
  rowNumber: number;
  raw: RawRow;
  normalized: NormalizedRow | null;
  errors: Issue[];
  warnings: Issue[];
  action: RowAction;
  matchedCustomerId: string | null;
}

export interface ValidationContext {
  /** Hoy (AAAA-MM-DD) en la zona del taller. */
  today: string;
  /** Clientes activos de la sucursal por email normalizado. */
  existingCustomersByEmail: ReadonlyMap<string, string>;
  /** Matrículas normalizadas ya registradas en la sucursal. */
  existingPlates: ReadonlySet<string>;
  /** El taller acepta importar filas sin correo (no recibirán avisos). */
  allowNoEmail: boolean;
}

export interface ValidationSummary {
  rows: number;
  valid: number;
  withErrors: number;
  withWarnings: number;
  empty: number;
  excluded: number;
  duplicatesSkipped: number;
  newCustomers: number;
  existingCustomers: number;
  newVehicles: number;
  errorCount: number;
  warningCount: number;
}

// ---------------------------------------------------------------- utilidades
function text(value: RawValue | undefined): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  return String(value).replace(/\s+/g, " ").trim();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Número de serie de Excel (sistema 1900) → AAAA-MM-DD. */
function fromExcelSerial(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465 || Math.floor(serial) !== serial) return null;
  const ms = Date.UTC(1899, 11, 30) + serial * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Fechas: Date nativa de Excel, número de serie de Excel, dd/mm/aaaa (también
 * con - o .), d/m/aaaa o AAAA-MM-DD. Nunca se interpreta mm/dd. Los años de
 * dos cifras se rechazan por ambiguos.
 */
export function parseDate(value: RawValue | undefined): { ok: true; value: string | null } | { ok: false; code: IssueCode } {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return { ok: true, value: null };
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return { ok: false, code: "date_invalid" };
    return { ok: true, value: `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}` };
  }
  if (typeof value === "number") {
    const iso = fromExcelSerial(value);
    return iso ? { ok: true, value: iso } : { ok: false, code: "date_invalid" };
  }
  const s = value.trim();
  let m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (m) {
    if (m[3].length === 2) return { ok: false, code: "date_two_digit_year" };
    if (m[3].length !== 4) return { ok: false, code: "date_invalid" };
    const iso = `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
    return isValidIsoDate(iso) ? { ok: true, value: iso } : { ok: false, code: "date_invalid" };
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  if (m) {
    const iso = `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
    return isValidIsoDate(iso) ? { ok: true, value: iso } : { ok: false, code: "date_invalid" };
  }
  // Número de serie llegado como texto (CSV exportado sin formato de fecha).
  if (/^\d{5}$/.test(s)) {
    const iso = fromExcelSerial(Number(s));
    if (iso) return { ok: true, value: iso };
  }
  return { ok: false, code: "date_invalid" };
}

/** Kilómetros: 82000, 82.000, 82 000. Sin decimales ni negativos. */
export function parseKm(value: RawValue | undefined): { ok: true; value: number | null } | { ok: false; code: IssueCode } {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value === "number") {
    if (value < 0) return { ok: false, code: "km_negative" };
    if (!Number.isInteger(value) || value > 2_000_000) return { ok: false, code: "km_invalid" };
    return { ok: true, value };
  }
  if (value instanceof Date) return { ok: false, code: "km_invalid" };
  const s = value.trim().replace(/\s*km$/i, "");
  if (s === "") return { ok: true, value: null };
  if (/^-/.test(s)) return { ok: false, code: "km_negative" };
  if (!/^(\d{1,3}([.\s]\d{3})+|\d+)$/.test(s)) return { ok: false, code: "km_invalid" };
  const n = Number(s.replace(/[.\s]/g, ""));
  return n <= 2_000_000 ? { ok: true, value: n } : { ok: false, code: "km_invalid" };
}

function splitName(full: string): { firstName: string; lastName: string } {
  const i = full.indexOf(" ");
  return i === -1 ? { firstName: full, lastName: "" } : { firstName: full.slice(0, i), lastName: full.slice(i + 1) };
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function isEmptyRow(raw: RawRow): boolean {
  return IMPORT_COLUMNS.every((c) => text(raw[c]) === "");
}

function isExampleRow(raw: RawRow): boolean {
  return (
    text(raw.name) === EXAMPLE_ROW.name &&
    text(raw.email).toLowerCase() === EXAMPLE_ROW.email &&
    checkPlate(text(raw.plate)).normalized === checkPlate(EXAMPLE_ROW.plate).normalized
  );
}

// ---------------------------------------------------------------- validación
export function validateRows(rows: ReadonlyArray<{ rowNumber: number; raw: RawRow }>, ctx: ValidationContext): {
  rows: ValidatedRow[];
  summary: ValidationSummary;
} {
  const out: ValidatedRow[] = [];
  const firstRowForPlate = new Map<string, number>();
  const namesByEmail = new Map<string, string>();

  for (const { rowNumber, raw } of rows) {
    const errors: Issue[] = [];
    const warnings: Issue[] = [];

    if (isEmptyRow(raw)) {
      out.push({ rowNumber, raw, normalized: null, errors, warnings, action: "skip_empty", matchedCustomerId: null });
      continue;
    }
    if (isExampleRow(raw)) {
      warnings.push({ code: "example_row" });
      out.push({ rowNumber, raw, normalized: null, errors, warnings, action: "skip_empty", matchedCustomerId: null });
      continue;
    }

    // Nombre
    const name = text(raw.name);
    if (!name) errors.push({ code: "name_missing", column: "name" });
    else if (name.length > 120) errors.push({ code: "name_too_long", column: "name" });

    // Correo
    const email = text(raw.email).toLowerCase() || null;
    if (!email) {
      if (ctx.allowNoEmail) warnings.push({ code: "email_missing_no_reminders", column: "email" });
      else errors.push({ code: "email_missing", column: "email" });
    } else if (email.length > 254 || !EMAIL_RE.test(email)) {
      errors.push({ code: "email_invalid", column: "email" });
    }

    // Teléfono
    const phoneResult = normalizePhone(text(raw.phone));
    if (!phoneResult.ok) errors.push({ code: "phone_invalid", column: "phone" });

    // Matrícula
    const plateText = text(raw.plate);
    const plate = checkPlate(plateText);
    if (!plateText) errors.push({ code: "plate_missing", column: "plate" });
    else if (!plate.valid || plateText.length > 20) errors.push({ code: "plate_invalid", column: "plate" });
    else if (plate.warning) warnings.push({ code: "plate_unrecognized", column: "plate" });

    // Marca y modelo
    const make = text(raw.make) || null;
    const model = text(raw.model) || null;
    if (make && make.length > 60) errors.push({ code: "text_too_long", column: "make" });
    if (model && model.length > 60) errors.push({ code: "text_too_long", column: "model" });

    // Fechas
    const last = parseDate(raw.lastService ?? null);
    let lastService: string | null = null;
    if (!last.ok) errors.push({ code: last.code, column: "lastService" });
    else if (!last.value) errors.push({ code: "last_service_missing", column: "lastService" });
    else if (last.value > addDays(ctx.today, 1)) errors.push({ code: "last_service_future", column: "lastService" });
    else if (last.value < "1950-01-01") errors.push({ code: "date_too_old", column: "lastService" });
    else lastService = last.value;

    const next = parseDate(raw.nextService ?? null);
    let nextService: string | null = null;
    if (!next.ok) errors.push({ code: next.code, column: "nextService" });
    else if (next.value && lastService && next.value <= lastService) errors.push({ code: "next_before_last", column: "nextService" });
    else nextService = next.value;

    // Kilómetros
    const km = parseKm(raw.km ?? null);
    if (!km.ok) errors.push({ code: km.code, column: "km" });

    // Duplicados de matrícula: en el archivo y en el taller
    let action: RowAction = "create_customer_and_vehicle";
    let matchedCustomerId: string | null = null;
    if (plate.valid && !raw.__excluded) {
      const first = firstRowForPlate.get(plate.normalized);
      if (first !== undefined) errors.push({ code: "plate_repeated_in_file", column: "plate", ref: first });
      else firstRowForPlate.set(plate.normalized, rowNumber);
      if (ctx.existingPlates.has(plate.normalized)) {
        warnings.push({ code: "plate_exists", column: "plate" });
        action = "skip_duplicate";
      }
    }

    // Cliente existente (por correo) y coherencia de nombres con el mismo correo
    if (email && EMAIL_RE.test(email) && name) {
      const existing = ctx.existingCustomersByEmail.get(email);
      if (existing && action !== "skip_duplicate") {
        warnings.push({ code: "customer_exists", column: "email" });
        action = "attach_to_existing_customer";
        matchedCustomerId = existing;
      }
      const seen = namesByEmail.get(email);
      if (seen === undefined) namesByEmail.set(email, name);
      else if (seen.toLowerCase() !== name.toLowerCase()) warnings.push({ code: "email_names_differ", column: "name" });
    }

    if (raw.__excluded) action = "skip_excluded";

    const { firstName, lastName } = splitName(name);
    const phone = phoneResult.ok ? phoneResult.value : null;
    out.push({
      rowNumber,
      raw,
      normalized: {
        firstName,
        lastName,
        email,
        phone,
        plate: plateText.toUpperCase(),
        plateNormalized: plate.normalized,
        make,
        model,
        lastService,
        km: km.ok ? km.value : null,
        nextService,
        customerKey: email ? `email:${email}` : phone ? `tel:${phone}|${name.toLowerCase()}` : `nombre:${name.toLowerCase()}`,
      },
      // Una fila excluida o que se omite (vehículo ya existente) no se importa: no bloquea.
      errors: raw.__excluded || action === "skip_duplicate" ? [] : errors,
      warnings: raw.__excluded ? [] : warnings,
      action,
      matchedCustomerId,
    });
  }

  return { rows: out, summary: summarize(out) };
}

export function summarize(rows: readonly ValidatedRow[]): ValidationSummary {
  const importable = rows.filter((r) => r.action === "create_customer_and_vehicle" || r.action === "attach_to_existing_customer");
  const newCustomerKeys = new Set(
    importable.filter((r) => r.action === "create_customer_and_vehicle" && r.normalized).map((r) => r.normalized!.customerKey),
  );
  const existing = new Set(importable.filter((r) => r.matchedCustomerId).map((r) => r.matchedCustomerId));
  return {
    rows: rows.length,
    valid: importable.filter((r) => r.errors.length === 0).length,
    withErrors: rows.filter((r) => r.errors.length > 0).length,
    withWarnings: rows.filter((r) => r.warnings.length > 0).length,
    empty: rows.filter((r) => r.action === "skip_empty").length,
    excluded: rows.filter((r) => r.action === "skip_excluded").length,
    duplicatesSkipped: rows.filter((r) => r.action === "skip_duplicate").length,
    newCustomers: newCustomerKeys.size,
    existingCustomers: existing.size,
    newVehicles: importable.length,
    errorCount: rows.reduce((n, r) => n + r.errors.length, 0),
    warningCount: rows.reduce((n, r) => n + r.warnings.length, 0),
  };
}
