import { describe, expect, it } from "vitest";

import { addDays, daysUntil, formatDate, isValidIsoDate, todayIn } from "@/lib/dates";
import { escapeLike, parsePage } from "@/lib/pagination";
import { formatPhone, normalizePhone } from "@/lib/phone";
import {
  createCustomerSchema,
  createVehicleSchema,
  maintenanceSchema,
  mileageSchema,
  partsFromForm,
  updateVehicleSchema,
} from "@/lib/validation/workshop";

const uuid = "8a6e0804-2bd0-4672-b79d-d97027f9071a";

describe("teléfonos", () => {
  it.each([
    ["600 123 456", "+34600123456"],
    ["600-12-34-56", "+34600123456"],
    ["(91) 123 45 67", "+34911234567"],
    ["0034 600123456", "+34600123456"],
    ["+34 600 123 456", "+34600123456"],
    ["34600123456", "+34600123456"],
    ["+33 6 12 34 56 78", "+33612345678"],
  ])("%s → %s", (input, expected) => {
    expect(normalizePhone(input)).toEqual({ ok: true, value: expected });
  });
  it("vacío es válido (opcional) y lo inválido se rechaza", () => {
    expect(normalizePhone("  ")).toEqual({ ok: true, value: null });
    expect(normalizePhone("12345").ok).toBe(false);
    expect(normalizePhone("600abc123").ok).toBe(false);
    expect(normalizePhone("500123456").ok).toBe(false);
  });
  it("formato de presentación", () => {
    expect(formatPhone("+34600123456")).toBe("600 123 456");
    expect(formatPhone("+33612345678")).toBe("+33612345678");
  });
});

describe("fechas de negocio", () => {
  it("valida fechas reales", () => {
    expect(isValidIsoDate("2026-03-15")).toBe(true);
    expect(isValidIsoDate("2026-02-31")).toBe(false);
    expect(isValidIsoDate("2024-02-29")).toBe(true);
    expect(isValidIsoDate("2025-02-29")).toBe(false);
    expect(isValidIsoDate("15/03/2026")).toBe(false);
  });
  it("aritmética y formato", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-29", -1)).toBe("2026-03-28");
    expect(formatDate("2026-03-15")).toBe("15/03/2026");
    expect(daysUntil("2026-11-10", "2026-11-05")).toBe(5);
    expect(daysUntil("2026-11-01", "2026-11-05")).toBe(-4);
  });
  it("hoy según la zona horaria (Canarias va una hora por detrás)", () => {
    const justAfterMidnightMadrid = new Date("2026-11-04T23:30:00Z"); // 00:30 en Madrid, 23:30 en Canarias
    expect(todayIn("Europe/Madrid", justAfterMidnightMadrid)).toBe("2026-11-05");
    expect(todayIn("Atlantic/Canary", justAfterMidnightMadrid)).toBe("2026-11-04");
  });
});

describe("paginación y búsqueda", () => {
  it("página segura", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage("-1")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("99999999")).toBe(10000);
  });
  it("escapa comodines de LIKE", () => {
    expect(escapeLike("50%_a\\b")).toBe("50\\%\\_a\\\\b");
  });
});

describe("validación de clientes", () => {
  it("normaliza email y teléfono", () => {
    const r = createCustomerSchema.parse({ branchId: uuid, firstName: " Laura ", email: " LAURA@Correo.com ", phone: "600 123 456" });
    expect(r).toMatchObject({ firstName: "Laura", lastName: "", email: "laura@correo.com", phone: "+34600123456", source: "manual", remindersOptOut: false });
  });
  it("correo y teléfono opcionales; inválidos rechazados", () => {
    expect(createCustomerSchema.parse({ branchId: uuid, firstName: "A", email: "", phone: "" })).toMatchObject({ email: null, phone: null });
    const bad = createCustomerSchema.safeParse({ branchId: uuid, firstName: "A", email: "no-es-correo", phone: "123" });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues.map((i) => i.path[0]).sort()).toEqual(["email", "phone"]);
  });
  it("no se puede elegir a mano un origen del sistema", () => {
    expect(createCustomerSchema.safeParse({ branchId: uuid, firstName: "A", source: "import" }).success).toBe(false);
  });
});

describe("validación de vehículos", () => {
  it("matrícula y bastidor", () => {
    const r = createVehicleSchema.parse({ customerId: uuid, plate: "1234 bcd", vin: "vf1 rfb000 1234 5678" });
    expect(r.vin).toBe("VF1RFB00012345678");
    expect(createVehicleSchema.safeParse({ customerId: uuid, plate: "12/34" }).success).toBe(false);
    expect(createVehicleSchema.safeParse({ customerId: uuid, plate: "1234BCD", vin: "VF1RFB0001234567O" }).success).toBe(false);
  });
  it("kilómetros negativos y próxima revisión anterior a la última", () => {
    expect(createVehicleSchema.safeParse({ customerId: uuid, plate: "1234BCD", currentKm: "-1" }).success).toBe(false);
    const r = createVehicleSchema.safeParse({ customerId: uuid, plate: "1234BCD", lastServiceDate: "2026-03-15", nextServiceDate: "2026-03-01" });
    expect(r.success).toBe(false);
    expect(createVehicleSchema.safeParse({ customerId: uuid, plate: "1234BCD", lastServiceKm: "1000" }).success).toBe(false);
  });
  it("estado válido", () => {
    expect(updateVehicleSchema.safeParse({ id: uuid, plate: "1234BCD", status: "robado" }).success).toBe(false);
  });
  it("lectura de km: entero, no negativo, fecha real", () => {
    expect(mileageSchema.safeParse({ id: uuid, km: "82000", readOn: "2026-11-05" }).success).toBe(true);
    expect(mileageSchema.safeParse({ id: uuid, km: "82000.5", readOn: "2026-11-05" }).success).toBe(false);
    expect(mileageSchema.safeParse({ id: uuid, km: "100", readOn: "2026-13-01" }).success).toBe(false);
  });
});

describe("validación del historial", () => {
  it("trabajos obligatorios y coherencia de próxima revisión", () => {
    expect(maintenanceSchema.safeParse({ serviceDate: "2026-03-15", workPerformed: " " }).success).toBe(false);
    expect(maintenanceSchema.safeParse({ serviceDate: "2026-03-15", workPerformed: "x", nextRecommendedDate: "2026-03-15" }).success).toBe(false);
    expect(maintenanceSchema.safeParse({ serviceDate: "2026-03-15", workPerformed: "x", km: "80000", nextRecommendedKm: "70000" }).success).toBe(false);
    const ok = maintenanceSchema.parse({ serviceDate: "2026-03-15", workPerformed: "Aceite", km: "82000", parts: [{ description: "Filtro", quantity: "1" }] });
    expect(ok).toMatchObject({ km: 82000, nextRecommendedDate: null, parts: [{ description: "Filtro", reference: null, quantity: 1 }] });
  });
  it("piezas desde columnas paralelas del formulario, ignorando filas vacías", () => {
    const fd = new FormData();
    for (const [d, r, q] of [
      ["Filtro de aceite", "OC-90", "1"],
      ["", "", "1"],
      ["Aceite 5W30", "", "4,5"],
    ]) {
      fd.append("partDescription", d);
      fd.append("partReference", r);
      fd.append("partQuantity", q);
    }
    expect(partsFromForm(fd)).toEqual([
      { description: "Filtro de aceite", reference: "OC-90", quantity: "1" },
      { description: "Aceite 5W30", reference: "", quantity: "4.5" },
    ]);
  });
});
