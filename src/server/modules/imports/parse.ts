import "server-only";

import ExcelJS from "exceljs";
import Papa from "papaparse";

import { columnForHeader, type ImportColumn, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, REQUIRED_COLUMNS } from "@/lib/imports/columns";
import type { RawRow, RawValue } from "@/lib/imports/validate";

/**
 * Lectura de archivos de importación (.xlsx y .csv) en el servidor.
 *  - El tipo se decide por el contenido (magic bytes), no por la extensión.
 *  - .xlsx: se comprueba el tamaño descomprimido declarado en el ZIP antes de
 *    abrirlo (protección contra "zip bombs") y no se evalúan fórmulas (se lee
 *    el resultado guardado).
 *  - .csv: UTF-8 (con o sin BOM) o Windows-1252 (Excel en España), separador
 *    detectado automáticamente (; , tabulador).
 */

export type ParseErrorCode =
  | "file_empty"
  | "file_too_large"
  | "file_type"
  | "file_xls"
  | "file_corrupt"
  | "file_too_big_uncompressed"
  | "no_header"
  | "missing_columns"
  | "too_many_rows"
  | "no_rows";

export class ImportParseError extends Error {
  constructor(
    readonly code: ParseErrorCode,
    readonly detail?: string,
  ) {
    super(code);
  }
}

export interface ParsedFile {
  kind: "xlsx" | "csv";
  columns: ImportColumn[];
  unknownHeaders: string[];
  rows: Array<{ rowNumber: number; raw: RawRow }>;
}

const MAX_UNCOMPRESSED = 60 * 1024 * 1024;

function isZip(buf: Buffer): boolean {
  return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}

function isOleXls(buf: Buffer): boolean {
  return buf.length > 8 && buf.readUInt32BE(0) === 0xd0cf11e0 && buf.readUInt32BE(4) === 0xa1b11ae1;
}

/** Suma de tamaños descomprimidos declarados en el directorio central del ZIP. */
function zipUncompressedSize(buf: Buffer): number {
  // Registro "End of central directory" (firma 0x06054b50) en los últimos 64 KB.
  const min = Math.max(0, buf.length - 65_557);
  let eocd = -1;
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ImportParseError("file_corrupt");
  const entries = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  let total = 0;
  for (let n = 0; n < entries; n++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== 0x02014b50) throw new ImportParseError("file_corrupt");
    total += buf.readUInt32LE(offset + 24);
    offset += 46 + buf.readUInt16LE(offset + 28) + buf.readUInt16LE(offset + 30) + buf.readUInt16LE(offset + 32);
    if (total > MAX_UNCOMPRESSED) break;
  }
  return total;
}

function cellValue(value: ExcelJS.CellValue): RawValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((t) => t.text).join("");
    if ("result" in value) return cellValue(value.result as ExcelJS.CellValue);
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("error" in value) return null;
  }
  return null;
}

async function readXlsx(buf: Buffer): Promise<RawValue[][]> {
  if (zipUncompressedSize(buf) > MAX_UNCOMPRESSED) throw new ImportParseError("file_too_big_uncompressed");
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    throw new ImportParseError("file_corrupt");
  }
  // Hoja "Clientes" de la plantilla, o la primera con datos (se ignora "Instrucciones").
  const sheet =
    wb.worksheets.find((w) => w.name.toLowerCase() === "clientes") ??
    wb.worksheets.find((w) => w.actualRowCount > 0 && !/instrucc/i.test(w.name)) ??
    wb.worksheets[0];
  if (!sheet) throw new ImportParseError("no_header");
  if (sheet.actualRowCount > MAX_IMPORT_ROWS + 25) throw new ImportParseError("too_many_rows", String(MAX_IMPORT_ROWS));

  const out: RawValue[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const values: RawValue[] = [];
    const max = Math.min(row.cellCount, 40);
    for (let c = 1; c <= max; c++) values.push(cellValue(row.getCell(c).value));
    out[rowNumber - 1] = values;
  });
  return Array.from(out, (r) => r ?? []);
}

function decodeText(buf: Buffer): string {
  if (buf.includes(0)) throw new ImportParseError("file_type");
  const bytes = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? buf.subarray(3) : buf;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // Exportaciones de Excel en España: Windows-1252.
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/**
 * Separador: el más frecuente en la primera línea no vacía (fuera de comillas).
 * La detección automática de PapaParse falla con pocas columnas y líneas vacías.
 */
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  const unquoted = firstLine.replace(/"[^"]*"/g, "");
  const candidates = [";", ",", "\t", "|"];
  const counts = candidates.map((d) => unquoted.split(d).length - 1);
  const max = Math.max(...counts);
  return max > 0 ? candidates[counts.indexOf(max)] : ";";
}

function readCsv(buf: Buffer): RawValue[][] {
  const text = decodeText(buf);
  const result = Papa.parse<string[]>(text, { delimiter: detectDelimiter(text), skipEmptyLines: false });
  if (result.data.length > MAX_IMPORT_ROWS + 25) throw new ImportParseError("too_many_rows", String(MAX_IMPORT_ROWS));
  return result.data.map((r) => r.slice(0, 40).map((v) => (v === "" ? null : v)));
}

export async function parseImportFile(buf: Buffer): Promise<ParsedFile> {
  if (buf.length === 0) throw new ImportParseError("file_empty");
  if (buf.length > MAX_IMPORT_BYTES) throw new ImportParseError("file_too_large");
  if (isOleXls(buf)) throw new ImportParseError("file_xls");

  const kind: ParsedFile["kind"] = isZip(buf) ? "xlsx" : "csv";
  const grid = kind === "xlsx" ? await readXlsx(buf) : readCsv(buf);

  // Cabecera: la primera de las 10 primeras filas con al menos 2 columnas reconocidas.
  let headerIndex = -1;
  let mapping: Array<ImportColumn | undefined> = [];
  for (let i = 0; i < Math.min(grid.length, 10); i++) {
    const m = grid[i].map((h) => columnForHeader(h));
    if (m.filter(Boolean).length >= 2) {
      headerIndex = i;
      mapping = m;
      break;
    }
  }
  if (headerIndex < 0) throw new ImportParseError("no_header");

  const columns = [...new Set(mapping.filter((c): c is ImportColumn => Boolean(c)))];
  const missing = REQUIRED_COLUMNS.filter((c) => !columns.includes(c));
  if (missing.length) throw new ImportParseError("missing_columns", missing.join(","));
  const unknownHeaders = grid[headerIndex]
    .map((h, i) => (mapping[i] ? null : String(h ?? "").trim()))
    .filter((h): h is string => Boolean(h));

  const rows: ParsedFile["rows"] = [];
  for (let i = headerIndex + 1; i < grid.length; i++) {
    const raw: RawRow = {};
    grid[i].forEach((value, col) => {
      const key = mapping[col];
      // Si una columna aparece dos veces, vale la primera.
      if (key && raw[key] === undefined) raw[key] = typeof value === "string" ? value.trim() || null : value;
    });
    rows.push({ rowNumber: i + 1, raw });
  }
  // Las filas vacías del final no cuentan.
  while (rows.length && Object.values(rows[rows.length - 1].raw).every((v) => v === null || v === undefined || v === "")) rows.pop();
  if (rows.length === 0) throw new ImportParseError("no_rows");
  if (rows.length > MAX_IMPORT_ROWS) throw new ImportParseError("too_many_rows", String(MAX_IMPORT_ROWS));
  return { kind, columns, unknownHeaders, rows };
}

export const PARSE_ERROR_MESSAGES: Record<ParseErrorCode, string> = {
  file_empty: "El archivo está vacío.",
  file_too_large: "El archivo supera los 5 MB.",
  file_type: "El archivo no es un Excel (.xlsx) ni un CSV.",
  file_xls: "Es un Excel antiguo (.xls). Ábrelo y guárdalo como .xlsx o CSV.",
  file_corrupt: "No se ha podido leer el archivo. Comprueba que no esté dañado.",
  file_too_big_uncompressed: "El archivo es demasiado grande una vez descomprimido.",
  no_header: "No se encuentra la fila de cabeceras. Usa la plantilla o pon los nombres de las columnas en la primera fila.",
  missing_columns: "Faltan columnas obligatorias.",
  too_many_rows: `El archivo tiene más de ${MAX_IMPORT_ROWS.toLocaleString("es-ES")} filas. Divídelo en varios archivos.`,
  no_rows: "El archivo no tiene filas de datos.",
};
