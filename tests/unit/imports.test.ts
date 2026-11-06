import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { columnForHeader } from "@/lib/imports/columns";
import { parseDate, parseKm, type RawRow, validateRows, type ValidationContext } from "@/lib/imports/validate";
import { csvSafe, reportCsv, templateCsv, templateXlsx } from "@/server/modules/imports/files";
import { ImportParseError, parseImportFile } from "@/server/modules/imports/parse";

const ctx = (over: Partial<ValidationContext> = {}): ValidationContext => ({
  today: "2026-11-05",
  existingCustomersByEmail: new Map(),
  existingPlates: new Map(),
  allowNoEmail: false,
  ...over,
});

const row = (n: number, raw: RawRow) => ({ rowNumber: n, raw });
const ok: RawRow = { name: "Pedro Gil", email: "pedro@correo.test", plate: "1234 BCD", lastService: "15/03/2026", km: "82.000" };

describe("fechas y kilómetros del archivo", () => {
  it.each([
    ["15/03/2026", "2026-03-15"],
    ["5/3/2026", "2026-03-05"],
    ["15-03-2026", "2026-03-15"],
    ["15.03.2026", "2026-03-15"],
    ["2026-03-15", "2026-03-15"],
    ["46096", "2026-03-15"],
  ])("%s → %s", (input, expected) => {
    expect(parseDate(input)).toEqual({ ok: true, value: expected });
  });
  it("Date nativa de Excel y número de serie", () => {
    expect(parseDate(new Date(Date.UTC(2026, 2, 15)))).toEqual({ ok: true, value: "2026-03-15" });
    expect(parseDate(46096)).toEqual({ ok: true, value: "2026-03-15" });
  });
  it("rechaza fechas imposibles, mm/dd y años de dos cifras", () => {
    expect(parseDate("31/02/2026").ok).toBe(false);
    expect(parseDate("03/15/2026").ok).toBe(false); // nunca se interpreta mm/dd
    expect(parseDate("15/03/26")).toEqual({ ok: false, code: "date_two_digit_year" });
    expect(parseDate("mañana").ok).toBe(false);
  });
  it.each([
    ["82000", 82000],
    ["82.000", 82000],
    ["82 000", 82000],
    ["1.234.567", 1234567],
    ["82000 km", 82000],
  ])("km %s → %s", (input, expected) => {
    expect(parseKm(input)).toEqual({ ok: true, value: expected });
  });
  it("km negativos o con decimales", () => {
    expect(parseKm("-5")).toEqual({ ok: false, code: "km_negative" });
    expect(parseKm(-5)).toEqual({ ok: false, code: "km_negative" });
    expect(parseKm("82000,5").ok).toBe(false);
    expect(parseKm(82000.5).ok).toBe(false);
    expect(parseKm("muchos").ok).toBe(false);
  });
});

describe("validación de filas", () => {
  it("una fila correcta: cliente y vehículo nuevos, nombre separado, km y fecha normalizados", () => {
    const { rows, summary } = validateRows([row(2, ok)], ctx());
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].action).toBe("create_customer_and_vehicle");
    expect(rows[0].normalized).toMatchObject({ firstName: "Pedro", lastName: "Gil", plate: "1234 BCD", plateNormalized: "1234BCD", km: 82000, lastService: "2026-03-15" });
    expect(summary).toMatchObject({ newCustomers: 1, newVehicles: 1, withErrors: 0 });
  });

  it("detecta campos obligatorios vacíos, emails, matrículas, fechas y km inválidos", () => {
    const { rows } = validateRows(
      [row(2, { name: "", email: "no-es-email", plate: "12/34", lastService: "31/02/2026", km: "-1", phone: "123" })],
      ctx(),
    );
    expect(rows[0].errors.map((e) => e.code).sort()).toEqual(["date_invalid", "email_invalid", "km_negative", "name_missing", "phone_invalid", "plate_invalid"]);
  });

  it("última revisión obligatoria, no futura; próxima posterior a la última", () => {
    const codes = (raw: RawRow) => validateRows([row(2, { ...ok, ...raw })], ctx()).rows[0].errors.map((e) => e.code);
    expect(codes({ lastService: "" })).toEqual(["last_service_missing"]);
    expect(codes({ lastService: "01/01/2030" })).toEqual(["last_service_future"]);
    expect(codes({ nextService: "01/01/2026" })).toEqual(["next_before_last"]);
    expect(codes({ nextService: "15/03/2027" })).toEqual([]);
  });

  it("correo vacío: error, salvo que el taller acepte importar sin correo (aviso)", () => {
    const raw = { ...ok, email: "" };
    expect(validateRows([row(2, raw)], ctx()).rows[0].errors.map((e) => e.code)).toEqual(["email_missing"]);
    const lenient = validateRows([row(2, raw)], ctx({ allowNoEmail: true })).rows[0];
    expect(lenient.errors).toEqual([]);
    expect(lenient.warnings.map((w) => w.code)).toContain("email_missing_no_reminders");
  });

  it("filas vacías y la fila de ejemplo de la plantilla se ignoran", () => {
    const { rows, summary } = validateRows(
      [row(2, {}), row(3, { name: "Laura Martín", email: "laura@correo.com", plate: "1234 ABC", lastService: "15/03/2026" }), row(4, ok)],
      ctx(),
    );
    expect(rows.map((r) => r.action)).toEqual(["skip_empty", "skip_empty", "create_customer_and_vehicle"]);
    expect(rows[1].warnings[0].code).toBe("example_row");
    expect(summary).toMatchObject({ empty: 2, newVehicles: 1, withErrors: 0 });
  });

  it("vehículo duplicado en el archivo: error en la segunda aparición (con referencia a la primera)", () => {
    const { rows } = validateRows([row(2, ok), row(3, { ...ok, plate: "1234-bcd", email: "otro@correo.test", name: "Otro" })], ctx());
    expect(rows[0].errors).toEqual([]);
    expect(rows[1].errors).toEqual([{ code: "plate_repeated_in_file", column: "plate", ref: 2 }]);
  });

  it("R7: con «actualizar existentes», la fila completa el vehículo registrado (y sí se valida)", () => {
    const plates = new Map([["1234BCD", "veh-1"]]);
    const { rows, summary } = validateRows([row(2, ok)], ctx({ existingPlates: plates, updateExisting: true, existingCustomersByEmail: new Map([["pedro@correo.test", "cli-1"]]) }));
    expect(rows[0]).toMatchObject({ action: "update_existing_vehicle", matchedVehicleId: "veh-1", matchedCustomerId: null });
    expect(rows[0].warnings.map((w) => w.code)).toContain("plate_exists_update");
    expect(summary).toMatchObject({ updatedVehicles: 1, newVehicles: 0, duplicatesSkipped: 0 });
    const bad = validateRows([row(2, { ...ok, km: "-5" })], ctx({ existingPlates: plates, updateExisting: true }));
    expect(bad.rows[0].errors.map((e) => e.code)).toContain("km_negative");
  });

  it("vehículo que ya existe en el taller: se omite sin bloquear", () => {
    const { rows, summary } = validateRows([row(2, { ...ok, email: "" })], ctx({ existingPlates: new Map([["1234BCD", "veh-1"]]) }));
    expect(rows[0].action).toBe("skip_duplicate");
    expect(rows[0].errors).toEqual([]);
    expect(summary).toMatchObject({ duplicatesSkipped: 1, newVehicles: 0 });
  });

  it("clientes duplicados: mismo correo en varias filas = un cliente; si ya existe en el taller, se vincula", () => {
    const rows = [
      row(2, ok),
      row(3, { ...ok, plate: "5678 FGH" }),
      row(4, { ...ok, plate: "9999 JKL", name: "Pedro G." }),
      row(5, { name: "Ana", email: "ana@correo.test", plate: "1111 BBB", lastService: "01/01/2026" }),
    ];
    const r = validateRows(rows, ctx({ existingCustomersByEmail: new Map([["ana@correo.test", "id-ana"]]) }));
    expect(r.summary).toMatchObject({ newCustomers: 1, existingCustomers: 1, newVehicles: 4 });
    expect(r.rows[2].warnings.map((w) => w.code)).toContain("email_names_differ");
    expect(r.rows[3]).toMatchObject({ action: "attach_to_existing_customer", matchedCustomerId: "id-ana" });
  });

  it("una fila excluida no bloquea ni se importa", () => {
    const { rows, summary } = validateRows([row(2, { ...ok, name: "", __excluded: true }), row(3, { ...ok, plate: "2222 CCC" })], ctx());
    expect(rows[0]).toMatchObject({ action: "skip_excluded", errors: [] });
    expect(summary).toMatchObject({ excluded: 1, withErrors: 0, newVehicles: 1 });
  });
});

describe("lectura de archivos", () => {
  it("cabeceras propias del taller con alias", () => {
    expect(columnForHeader("E-mail")).toBe("email");
    expect(columnForHeader("PLACA")).toBe("plate");
    expect(columnForHeader("Kms")).toBe("km");
    expect(columnForHeader(" Próxima revisión (opcional) ")).toBe("nextService");
    expect(columnForHeader("Observaciones")).toBeUndefined();
  });

  it("lee la plantilla .xlsx generada (fecha nativa de Excel)", async () => {
    const parsed = await parseImportFile(await templateXlsx());
    expect(parsed.kind).toBe("xlsx");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].raw.lastService).toBeInstanceOf(Date);
    expect(validateRows(parsed.rows, ctx()).rows[0].action).toBe("skip_empty"); // fila de ejemplo
  });

  it("lee un .xlsx propio con hoja de instrucciones, fórmulas y texto enriquecido", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Instrucciones").addRow(["Lee esto"]);
    const ws = wb.addWorksheet("Mis clientes");
    ws.addRow(["Listado del taller"]);
    ws.addRow(["Cliente", "Correo", "Placa", "Fecha revisión", "Km"]);
    ws.addRow([{ richText: [{ text: "Pedro " }, { text: "Gil" }] }, "pedro@correo.test", "1234 BCD", new Date(Date.UTC(2026, 2, 15)), { formula: "80000+2000", result: 82000 }]);
    const parsed = await parseImportFile(Buffer.from(await wb.xlsx.writeBuffer()));
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({ rowNumber: 3, raw: { name: "Pedro Gil", plate: "1234 BCD", km: 82000 } });
  });

  it("CSV con punto y coma en Windows-1252 (Excel en España)", async () => {
    const text = "Nombre del cliente;Correo electrónico;Matrícula;Última revisión\r\nJosé Núñez;jose@correo.test;1234 BCD;15/03/2026\r\n";
    const latin1 = Buffer.from(text, "latin1");
    const parsed = await parseImportFile(latin1);
    expect(parsed.kind).toBe("csv");
    expect(parsed.rows[0].raw).toMatchObject({ name: "José Núñez", email: "jose@correo.test", lastService: "15/03/2026" });
  });

  it("CSV UTF-8 con BOM y comas; la plantilla CSV se puede volver a leer", async () => {
    const parsed = await parseImportFile(Buffer.from("﻿nombre,email,matricula,ultima revision\nAna,ana@correo.test,5678FGH,01/02/2026\n", "utf8"));
    expect(parsed.rows[0].raw).toMatchObject({ name: "Ana", plate: "5678FGH" });
    expect((await parseImportFile(templateCsv())).rows).toHaveLength(1);
  });

  it("rechaza .xls antiguos, binarios, columnas obligatorias ausentes y más de 2.000 filas", async () => {
    const xls = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
    await expect(parseImportFile(xls)).rejects.toMatchObject({ code: "file_xls" });
    await expect(parseImportFile(Buffer.from([1, 2, 0, 4]))).rejects.toMatchObject({ code: "file_type" });
    await expect(parseImportFile(Buffer.from("nombre;correo\nAna;a@b.es\n"))).rejects.toMatchObject({ code: "missing_columns", detail: "plate,lastService" });
    await expect(parseImportFile(Buffer.alloc(0))).rejects.toBeInstanceOf(ImportParseError);
    const many = ["nombre;matricula;ultima revision", ...Array.from({ length: 2001 }, (_, i) => `C${i};${1000 + i}BCD;01/01/2026`)].join("\n");
    await expect(parseImportFile(Buffer.from(many))).rejects.toMatchObject({ code: "too_many_rows" });
  });

  it("detecta un ZIP manipulado antes de abrirlo", async () => {
    const buf = Buffer.from(await templateXlsx());
    // Corrompe el directorio central: debe fallar de forma controlada.
    const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    buf.writeUInt32LE(buf.length + 10, eocd + 16);
    await expect(parseImportFile(buf)).rejects.toMatchObject({ code: "file_corrupt" });
  });
});

describe("separador de CSV", () => {
  it("elige el separador más frecuente de la cabecera, ignorando el texto entre comillas", async () => {
    const { detectDelimiter } = await import("@/server/modules/imports/parse");
    expect(detectDelimiter("a;b;c\n1;2;3\n")).toBe(";");
    expect(detectDelimiter("\n\na,b,c\n")).toBe(",");
    expect(detectDelimiter("a\tb\tc")).toBe("\t");
    expect(detectDelimiter('"Apellidos, nombre";correo;matricula')).toBe(";");
  });
});

describe("informe de errores", () => {
  it("neutraliza la inyección de fórmulas en el CSV", () => {
    expect(csvSafe("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csvSafe("+34600")).toBe("'+34600");
    expect(csvSafe("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvSafe("Normal; con punto y coma")).toBe('"Normal; con punto y coma"');
  });
  it("incluye fila, datos originales, errores y avisos", () => {
    const csv = reportCsv([{ rowNumber: 7, raw: { name: "=cmd", plate: "12/34" }, errors: [{ code: "plate_invalid", column: "plate" }], warnings: [], action: "create_customer_and_vehicle" }]).toString("utf8");
    expect(csv.startsWith("﻿Fila;Nombre del cliente")).toBe(true);
    expect(csv).toContain("7;'=cmd;");
    expect(csv).toContain("Matrícula: Matrícula no válida");
  });
});
