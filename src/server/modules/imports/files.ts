import "server-only";

import ExcelJS from "exceljs";

import { COLUMN_LABELS, EXAMPLE_ROW, IMPORT_COLUMNS, MAX_IMPORT_ROWS } from "@/lib/imports/columns";
import { issueWithColumn } from "@/lib/imports/messages";

import type { StagedRow } from "./service";

/**
 * Archivos que genera RevisaYa: plantilla de importación e informe de errores.
 */

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const CSV_MIME = "text/csv; charset=utf-8";

/**
 * Inyección de fórmulas: un valor que empieza por = + - @ tab o retorno se
 * interpreta como fórmula al abrir el CSV en Excel. Se neutraliza con un apóstrofo.
 */
export function csvSafe(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  const guarded = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[";\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

function toCsv(rows: unknown[][]): Buffer {
  // BOM + punto y coma: es lo que espera Excel con configuración regional española.
  return Buffer.from("﻿" + rows.map((r) => r.map(csvSafe).join(";")).join("\r\n") + "\r\n", "utf8");
}

const HEADERS = IMPORT_COLUMNS.map((c) => COLUMN_LABELS[c]);

export async function templateXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "RevisaYa";
  const ws = wb.addWorksheet("Clientes", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = IMPORT_COLUMNS.map((c) => ({
    header: COLUMN_LABELS[c],
    key: c,
    width: c === "name" || c === "email" ? 28 : 18,
    style: c === "lastService" || c === "nextService" ? { numFmt: "dd/mm/yyyy" } : c === "plate" || c === "phone" ? { numFmt: "@" } : {},
  }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF0FF" } };
  ws.addRow({ ...EXAMPLE_ROW, lastService: new Date(Date.UTC(2026, 2, 15)), km: Number(EXAMPLE_ROW.km), nextService: null });

  const help = wb.addWorksheet("Instrucciones");
  help.getColumn(1).width = 110;
  [
    "Cómo usar esta plantilla",
    "",
    "1. Escribe una fila por vehículo. Si un cliente tiene varios coches, repite sus datos en cada fila (se agrupan por el correo).",
    "2. Obligatorias: Nombre del cliente, Matrícula y Última revisión. El correo es obligatorio para que el cliente reciba avisos.",
    "3. Fechas en formato dd/mm/aaaa (por ejemplo 15/03/2026). La próxima revisión es opcional: si la dejas vacía se calcula sola.",
    "4. Kilómetros sin decimales (82000 o 82.000).",
    "5. Puedes borrar la fila de ejemplo; si la dejas, se ignora.",
    `6. Máximo ${MAX_IMPORT_ROWS.toLocaleString("es-ES")} filas por archivo. Si tienes más, divídelo en varios.`,
    "7. Antes de guardar nada te enseñaremos los errores para que los corrijas. No se guarda nada a medias.",
  ].forEach((line, i) => {
    const row = help.addRow([line]);
    if (i === 0) row.font = { bold: true, size: 14 };
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function templateCsv(): Buffer {
  return toCsv([HEADERS, IMPORT_COLUMNS.map((c) => EXAMPLE_ROW[c])]);
}

function reportMatrix(rows: StagedRow[]): unknown[][] {
  return [
    ["Fila", ...HEADERS, "Errores", "Avisos"],
    ...rows.map((r) => [
      r.rowNumber,
      ...IMPORT_COLUMNS.map((c) => r.raw[c] ?? ""),
      r.errors.map(issueWithColumn).join(" | "),
      r.warnings.map(issueWithColumn).join(" | "),
    ]),
  ];
}

export function reportCsv(rows: StagedRow[]): Buffer {
  return toCsv(reportMatrix(rows));
}

export async function reportXlsx(rows: StagedRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Errores", { views: [{ state: "frozen", ySplit: 1 }] });
  const matrix = reportMatrix(rows);
  matrix.forEach((r) => ws.addRow(r.map((v) => (v === null || v === undefined ? "" : typeof v === "number" ? v : String(v)))));
  ws.getRow(1).font = { bold: true };
  ws.columns.forEach((col, i) => {
    col.width = i === 0 ? 6 : i > HEADERS.length ? 60 : 18;
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
