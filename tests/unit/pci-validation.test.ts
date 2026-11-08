import { describe, expect, it } from "vitest";

import { createEquipmentSchema, createWorkOrderSchema, formWithMaterials, recordSchema, workOrderItemList } from "@/lib/validation/pci";
import { createCustomerSchema, updateCustomerSchema } from "@/lib/validation/workshop";

const A = "8f9d2b52-6b0e-4a4f-9b7e-3a0c4f0a1b2c";
const B = "1b2c3d4e-5f60-4a1b-8c2d-3e4f5a6b7c8d";

describe("órdenes de trabajo: lista de equipos del formulario", () => {
  it("acepta un único equipo marcado (llega como texto, no como lista)", () => {
    expect(workOrderItemList(1).parse(`${A}:${B}`)).toEqual([`${A}:${B}`]);
  });
  it("descarta los selectores «No incluir» (cadena vacía)", () => {
    expect(workOrderItemList(0).parse(["", `${A}:${B}`, ""])).toEqual([`${A}:${B}`]);
    expect(workOrderItemList(0).parse(undefined)).toEqual([]);
  });
  it("exige al menos uno al añadir y rechaza valores mal formados", () => {
    expect(() => workOrderItemList(1).parse(["", ""])).toThrow();
    expect(() => workOrderItemList(0).parse(["no-es-un-id"])).toThrow();
  });
  it("crear orden con un solo equipo marcado", () => {
    const r = createWorkOrderSchema.parse({ installationId: A, serviceType: "periodic_maintenance", items: `${A}:${B}` });
    expect(r.items).toHaveLength(1);
  });
});

describe("equipos: reglas del extintor", () => {
  const base = { installationId: A, categoryCode: "extinguisher" };
  it("un extintor necesita agente extintor", () => {
    const r = createEquipmentSchema.safeParse(base);
    expect(r.success).toBe(false);
    expect(r.error?.issues.some((i) => i.path[0] === "agent")).toBe(true);
  });
  it("capacidad y unidad van juntas", () => {
    expect(createEquipmentSchema.safeParse({ ...base, agent: "powder_abc", chargeValue: "6" }).success).toBe(false);
    expect(createEquipmentSchema.safeParse({ ...base, agent: "powder_abc", chargeValue: "6", chargeUnit: "kg" }).success).toBe(true);
  });
  it("no admite más de 3 retimbrados previos ni instalación anterior a la fabricación", () => {
    expect(createEquipmentSchema.safeParse({ ...base, agent: "co2", retimbradosBefore: "4" }).success).toBe(false);
    expect(createEquipmentSchema.safeParse({ ...base, agent: "co2", manufacturedOn: "2020-05-01", installedOn: "2019-01-01" }).success).toBe(false);
  });
  it("otros equipos no piden datos de extintor", () => {
    expect(createEquipmentSchema.safeParse({ installationId: A, categoryCode: "bie" }).success).toBe(true);
  });
});

describe("actuaciones: materiales del formulario", () => {
  it("convierte materials[i][campo] en una lista y descarta filas vacías", () => {
    const fd = new FormData();
    fd.set("equipmentId", A);
    fd.set("actionTypeId", B);
    fd.set("performedOn", "2026-01-10");
    fd.set("result", "compliant");
    fd.set("materials[0][description]", "Precinto");
    fd.set("materials[0][quantity]", "2");
    fd.set("materials[1][description]", "");
    fd.set("materials[1][quantity]", "1");
    const r = recordSchema.parse(formWithMaterials(fd));
    expect(r.materials).toEqual([expect.objectContaining({ description: "Precinto", quantity: 2 })]);
  });
});

describe("clientes: datos de empresa", () => {
  it("al crear, NIF/CIF se normaliza y se valida", () => {
    expect(createCustomerSchema.safeParse({ firstName: "Comunidad Sol", branchId: A, customerKind: "company", taxId: "b-12345678" }).success).toBe(false);
  });
  it("al editar, los datos de empresa que no llegan quedan sin tocar (no se ponen a null)", () => {
    const r = updateCustomerSchema.parse({ id: A, firstName: "Ana" });
    expect(r.customerKind).toBeUndefined();
    expect(r.legalName).toBeUndefined();
    expect(r.taxId).toBeUndefined();
    expect(r.city).toBeUndefined();
  });
  it("al editar, un campo vacío enviado sí se borra", () => {
    const r = updateCustomerSchema.parse({ id: A, firstName: "Ana", legalName: "", taxId: "" });
    expect(r.legalName).toBeNull();
    expect(r.taxId).toBeNull();
  });
});
