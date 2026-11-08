import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PCI_COLUMNS, type PciImportKind } from "@/lib/imports/pci";
import { closePool } from "@/server/db/client";
import { commitPciImport, pciRows, pciTemplateXlsx, uploadPciImport } from "@/server/modules/imports/pci";
import { getBatch } from "@/server/modules/imports/service";

import { createOrg, ownerMemberId, query, type TestOrg } from "./support/db";

/** PCI · caso 15: importación de clientes, instalaciones y equipos desde Excel (staging + confirmación atómica). */

let org: TestOrg;
let other: TestOrg;
let ctx: Parameters<typeof uploadPciImport>[0];
let otherCtx: Parameters<typeof uploadPciImport>[0];

/** Excel con las cabeceras de la plantilla y las filas dadas (por clave de columna). */
async function xlsx(kind: PciImportKind, rows: Array<Record<string, string | Date>>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Datos");
  const cols = PCI_COLUMNS[kind];
  ws.addRow(cols.map((c) => c.label));
  for (const r of rows) ws.addRow(cols.map((c) => r[c.key] ?? null));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

beforeAll(async () => {
  await query("delete from private.rate_limit_buckets where key like 'import:%'");
  org = await createOrg("pro");
  other = await createOrg("pro");
  ctx = { auth: { userId: org.ownerId }, membership: { organizationId: org.orgId, memberId: await ownerMemberId(org), role: "admin", permissions: [] } };
  otherCtx = { auth: { userId: other.ownerId }, membership: { organizationId: other.orgId, memberId: await ownerMemberId(other), role: "admin", permissions: [] } };
});
afterAll(closePool);

describe("PCI: importación por plantillas", () => {
  it("la plantilla tiene las columnas y una fila de ejemplo que se ignora al subirla", async () => {
    const tpl = await pciTemplateXlsx("customers");
    await expect(uploadPciImport(ctx, { kind: "customers", branchId: org.branchId, fileName: "plantilla.xlsx", data: tpl })).rejects.toMatchObject({ code: "import_file_invalid", detail: "no_rows" });
  });

  it("clientes: valida con las reglas del panel, omite duplicados y crea todo en una transacción", async () => {
    const file = await xlsx("customers", [
      { kind: "empresa", firstName: "Comunidad Las Encinas", legalName: "CP Las Encinas 12", email: "encinas@cliente.test", city: "Madrid" },
      { kind: "particular", firstName: "Laura", lastName: "Martín", email: "laura@cliente.test", phone: "600 123 456" },
      { kind: "empresa", firstName: "Repetida", email: "encinas@cliente.test" },
      { kind: "empresa", firstName: "CIF malo", taxId: "B1234" },
      { kind: "otra cosa", firstName: "Tipo raro" },
    ]);
    const id = await uploadPciImport(ctx, { kind: "customers", branchId: org.branchId, fileName: "clientes.xlsx", data: file });
    const b = await getBatch(ctx, id);
    expect(b?.kind).toBe("customers");
    expect(b?.summary).toMatchObject({ toCreate: 2, duplicates: 1, errorRows: 2 });
    const rows = await pciRows(ctx, id);
    expect(rows.find((r) => r.rowNumber === 5)?.errors[0]).toMatchObject({ column: "taxId", message: "NIF/CIF no válido" });
    expect(rows.find((r) => r.rowNumber === 6)?.errors[0].column).toBe("kind");

    await expect(commitPciImport(ctx, id, { skipErrors: false, allowRepeat: false })).rejects.toMatchObject({ detail: "has_errors" });
    expect(await commitPciImport(ctx, id, { skipErrors: true, allowRepeat: false })).toEqual({ created: 2, skipped: 3 });
    const created = await query<{ first_name: string; customer_kind: string; source: string; import_batch_id: string }>(
      "select first_name, customer_kind, source, import_batch_id from customers where organization_id = $1 order by first_name",
      [org.orgId],
    );
    expect(created).toEqual([
      { first_name: "Comunidad Las Encinas", customer_kind: "company", source: "import", import_batch_id: id },
      { first_name: "Laura", customer_kind: "individual", source: "import", import_batch_id: id },
    ]);
    await expect(commitPciImport(ctx, id, { skipErrors: true, allowRepeat: false })).rejects.toMatchObject({ detail: "already_committed" });
  });

  it("instalaciones: se enlazan con su cliente por correo, CIF o nombre", async () => {
    const file = await xlsx("installations", [
      { customer: "encinas@cliente.test", name: "Garaje comunitario", establishmentType: "Aparcamiento", addressLine1: "Calle Encina 12", postalCode: "28001" },
      { customer: "Laura Martín", name: "Vivienda", establishmentType: "", addressLine1: "Calle Sol 3" },
      { customer: "nadie@cliente.test", name: "Huérfana", addressLine1: "Calle X" },
      { customer: "Laura Martín", name: "Sin dirección" },
    ]);
    const id = await uploadPciImport(ctx, { kind: "installations", branchId: org.branchId, fileName: "instalaciones.xlsx", data: file });
    const rows = await pciRows(ctx, id);
    expect(rows.map((r) => r.action)).toEqual(["create_installation", "create_installation", null, null]);
    expect(rows[2].errors[0].column).toBe("customer");
    expect(rows[3].errors[0]).toMatchObject({ column: "addressLine1" });
    expect(await commitPciImport(ctx, id, { skipErrors: true, allowRepeat: false })).toMatchObject({ created: 2 });
    // Volver a subir lo mismo: las ya existentes se omiten.
    const again = await uploadPciImport(ctx, { kind: "installations", branchId: org.branchId, fileName: "instalaciones.xlsx", data: file });
    expect((await getBatch(ctx, again))?.summary).toMatchObject({ toCreate: 0, duplicates: 2, repeatedFile: true });
  });

  it("equipos: categoría y agente en texto libre, fechas de Excel, código duplicado y vencimientos calculados", async () => {
    const file = await xlsx("equipment", [
      { installation: "Garaje comunitario", category: "Extintor", agent: "Polvo ABC", chargeValue: "6", chargeUnit: "kg", putInServiceOn: new Date(Date.UTC(2025, 0, 10)), location: "Planta -1", code: "EXT-A1" },
      { installation: "Garaje comunitario", category: "BIE", type: "BIE 25 mm", location: "Rampa" },
      { installation: "Garaje comunitario", category: "extintor", location: "Sin agente" },
      { installation: "Garaje comunitario", category: "Extintor", agent: "CO2", code: "ext-a1" },
      { installation: "No existe", category: "Hidrante" },
      { installation: "Garaje comunitario", category: "Cosa rara" },
    ]);
    const id = await uploadPciImport(ctx, { kind: "equipment", branchId: org.branchId, fileName: "equipos.xlsx", data: file });
    const rows = await pciRows(ctx, id);
    expect(rows.map((r) => r.action)).toEqual(["create_equipment", "create_equipment", null, null, null, null]);
    expect(rows[2].errors[0].column).toBe("agent");
    expect(rows[3].errors[0]).toMatchObject({ column: "code", message: "Ya hay otro equipo con ese código" });
    expect(rows[4].errors[0].column).toBe("installation");
    expect(rows[5].errors[0].column).toBe("category");
    expect(await commitPciImport(ctx, id, { skipErrors: true, allowRepeat: false })).toMatchObject({ created: 2 });
    const eq = await query<{ code: string; category_code: string; next_action_on: string | null; import_batch_id: string }>(
      "select code, category_code, next_action_on::text, import_batch_id from equipment where organization_id = $1 order by code",
      [org.orgId],
    );
    expect(eq).toEqual([
      { code: "BIE-000001", category_code: "bie", next_action_on: null, import_batch_id: id },
      { code: "EXT-A1", category_code: "extinguisher", next_action_on: "2026-01-10", import_batch_id: id },
    ]);
  });

  it("aislamiento: otra empresa no ve ni confirma el lote, y sus referencias no encuentran mis datos", async () => {
    const file = await xlsx("installations", [{ customer: "encinas@cliente.test", name: "Intento", addressLine1: "Calle Y" }]);
    const id = await uploadPciImport(otherCtx, { kind: "installations", branchId: other.branchId, fileName: "x.xlsx", data: file });
    expect((await pciRows(otherCtx, id))[0].errors[0].column).toBe("customer");
    expect(await getBatch(otherCtx, id)).not.toBeNull();
    expect(await getBatch(ctx, id)).toBeNull();
    await expect(commitPciImport(ctx, id, { skipErrors: true, allowRepeat: false })).rejects.toMatchObject({ code: "not_found" });
  });
});
