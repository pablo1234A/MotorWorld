import { describe, expect, it } from "vitest";

import { checkPlate, normalizePlate } from "@/lib/plate";

describe("normalizePlate", () => {
  it("quita espacios, guiones y puntos y pasa a mayúsculas", () => {
    expect(normalizePlate(" 1234 abc ")).toBe("1234ABC");
    expect(normalizePlate("m-1234-ab")).toBe("M1234AB");
    expect(normalizePlate("1234.BCD")).toBe("1234BCD");
  });
});

describe("checkPlate", () => {
  it.each([
    ["1234 BCD", "es_current"],
    ["1234-bcd", "es_current"],
    ["C1234BCD", "es_moped"],
    ["M-1234-AB", "es_provincial"],
    ["B-1234-A", "es_provincial"],
    ["SE-123456", "es_provincial"],
  ] as const)("%s se reconoce como %s", (plate, format) => {
    const r = checkPlate(plate);
    expect(r.valid).toBe(true);
    expect(r.warning).toBe(false);
    expect(r.format).toBe(format);
  });

  it("las matrículas actuales no admiten vocales", () => {
    // "1234ABC" (ejemplo del PDF) tiene vocal: se acepta con aviso, no como formato actual.
    const r = checkPlate("1234 ABC");
    expect(r.format).toBe("other");
    expect(r.valid).toBe(true);
    expect(r.warning).toBe(true);
  });

  it("acepta formatos no reconocidos con aviso (extranjeras, históricas)", () => {
    expect(checkPlate("AB12CDE")).toMatchObject({ valid: true, warning: true, format: "other" });
  });

  it("rechaza caracteres no válidos y longitudes imposibles", () => {
    expect(checkPlate("1234/BCD").valid).toBe(false);
    expect(checkPlate("12").valid).toBe(false);
    expect(checkPlate("").valid).toBe(false);
    expect(checkPlate("ABCDEFGHIJK1").valid).toBe(false);
  });
});
