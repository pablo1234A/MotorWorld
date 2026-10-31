import { describe, expect, it } from "vitest";
import { vatBreakdown, formatEur } from "@/lib/money";
import { parseCsv, parseFlexibleDate, toCsv } from "@/lib/csv";
import { applySendWindow } from "@/server/modules/automation/schedule";
import { isValidEmail } from "@/lib/email";
import { PLANS } from "@/config/plans";

describe("IVA (precios con IVA incluido)", () => {
  it.each([
    [1500, 1240, 260],
    [3299, 2726, 573],
    [6997, 5783, 1214],
  ])("total %i → base %i + IVA %i", (gross, base, vat) => {
    const b = vatBreakdown(gross, 2100);
    expect(b.baseCents).toBe(base);
    expect(b.vatCents).toBe(vat);
    expect(b.baseCents + b.vatCents).toBe(gross);
  });
  it("planes comerciales con los precios y límites acordados", () => {
    expect(PLANS.map((p) => [p.code, p.priceCents, p.monthlyEmailLimit])).toEqual([
      ["STARTER", 1500, 30],
      ["PRO", 3299, 70],
      ["BUSINESS", 6997, 200],
    ]);
    expect(formatEur(3299).replace(/\s/g, " ")).toBe("32,99 €");
  });
});

describe("CSV", () => {
  it("detecta separador ; y comillas", () => {
    const rows = parseCsv('﻿nombre;email;servicio\n"Pérez; Ana";ana@x.es;"Corte ""premium"""\r\nLuis;luis@x.es;\n');
    expect(rows).toEqual([["nombre", "email", "servicio"], ["Pérez; Ana", "ana@x.es", 'Corte "premium"'], ["Luis", "luis@x.es", ""]]);
  });
  it("interpreta fechas españolas e ISO", () => {
    expect(parseFlexibleDate("31/10/2026")?.toISOString().slice(0, 10)).toBe("2026-10-31");
    expect(parseFlexibleDate("2026-02-30")).toBeNull();
    expect(parseFlexibleDate("ayer")).toBeNull();
  });
  it("neutraliza fórmulas al exportar", () => {
    expect(toCsv([["=HYPERLINK()"]])).toContain("'=HYPERLINK()");
  });
});

describe("validación de email", () => {
  it.each(["ana@empresa.es", "a.b+tag@sub.dominio.com"])("válido %s", (e) => expect(isValidEmail(e)).toBe(true));
  it.each(["ana@", "ana@x", "a..b@x.es", "ana@empresa.invalid", "sin arroba"])("no válido %s", (e) => expect(isValidEmail(e)).toBe(false));
});

describe("ventana horaria de envío (Europe/Madrid)", () => {
  it("dentro de la ventana no cambia", () => {
    const d = new Date("2026-10-31T10:00:00Z"); // 11:00 Madrid (CET)
    expect(applySendWindow(d, "Europe/Madrid", 9, 20).toISOString()).toBe(d.toISOString());
  });
  it("antes de la ventana → mismo día a la hora de inicio", () => {
    expect(applySendWindow(new Date("2026-10-31T05:00:00Z"), "Europe/Madrid", 9, 20).toISOString()).toBe("2026-10-31T08:00:00.000Z");
  });
  it("después de la ventana → día siguiente (incluido cambio de hora)", () => {
    expect(applySendWindow(new Date("2026-10-24T21:00:00Z"), "Europe/Madrid", 9, 20).toISOString()).toBe("2026-10-25T08:00:00.000Z");
  });
});
