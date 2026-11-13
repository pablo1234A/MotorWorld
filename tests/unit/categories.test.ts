import { describe, expect, it } from "vitest";
import { attributesForCategory, categoryPath, parseLocaleNumber, resolveAttributes, validateAttributes, type CategoryCatalog } from "@/domain/categories";

const catalog: CategoryCatalog = {
  categories: [
    { id: "c1", name: "Vehículos", slug: "vehiculos", parentId: null, isCustom: false },
    { id: "c2", name: "Coches", slug: "coches", parentId: "c1", isCustom: false },
  ],
  attributes: [
    { categoryId: "c1", key: "anio", name: "Año", type: "number", required: true, options: [], unit: null, showInTitle: true, order: 1 },
    { categoryId: "c1", key: "kilometros", name: "Kilómetros", type: "number", required: true, options: [], unit: "km", showInTitle: true, order: 2 },
    { categoryId: "c1", key: "combustible", name: "Combustible", type: "select", required: false, options: ["Gasolina", "Diésel"], unit: null, showInTitle: true, order: 3 },
    { categoryId: "c2", key: "puertas", name: "Puertas", type: "number", required: false, options: [], unit: null, showInTitle: false, order: 4 },
    { categoryId: "c2", key: "itv", name: "ITV", type: "boolean", required: false, options: [], unit: null, showInTitle: false, order: 5 },
  ],
};

describe("categorías y atributos", () => {
  it("hereda los atributos de la categoría padre", () => {
    const keys = attributesForCategory(catalog, "c2").map((attribute) => attribute.key);
    expect(keys).toEqual(["anio", "kilometros", "combustible", "puertas", "itv"]);
    expect(attributesForCategory(catalog, null)).toEqual([]);
  });

  it("resuelve la ruta categoría/subcategoría", () => {
    expect(categoryPath(catalog, "c2")).toEqual({ category: "Vehículos", subcategory: "Coches", slug: "vehiculos" });
    expect(categoryPath(catalog, "c1")).toEqual({ category: "Vehículos", subcategory: null, slug: "vehiculos" });
  });

  it("valida y normaliza tipos", () => {
    const result = validateAttributes(attributesForCategory(catalog, "c2"), { anio: "2019", kilometros: "85.000", combustible: "diésel", itv: "sí", extra_libre: "Techo solar" });
    expect(result.errors).toEqual({});
    expect(result.values).toEqual({ anio: 2019, kilometros: 85000, combustible: "Diésel", itv: true, extra_libre: "Techo solar" });
    expect(result.missingRequired).toEqual([]);
  });

  it("detecta errores y obligatorios ausentes", () => {
    const result = validateAttributes(attributesForCategory(catalog, "c2"), { anio: "hace mucho", combustible: "Hidrógeno" });
    expect(result.errors.anio).toBeDefined();
    expect(result.errors.combustible).toBeDefined();
    expect(result.missingRequired.map((attribute) => attribute.key)).toEqual(["kilometros"]);
  });

  it("ignora claves libres no válidas", () => {
    const result = validateAttributes([], { "<script>": "x", "Mayúsculas": "y", ok_key: "z" });
    expect(result.values).toEqual({ ok_key: "z" });
  });

  it("formatea con unidades sin separar los años", () => {
    const resolved = resolveAttributes(attributesForCategory(catalog, "c2"), { anio: 2019, kilometros: 85000, itv: true });
    expect(resolved.find((attribute) => attribute.key === "anio")?.value).toBe("2019");
    expect(resolved.find((attribute) => attribute.key === "kilometros")?.value).toBe("85.000 km");
    expect(resolved.find((attribute) => attribute.key === "itv")?.value).toBe("Sí");
  });

  it.each([
    ["1.234,56", 1234.56],
    ["1,234.56", 1234.56],
    ["12,5", 12.5],
    ["1.000", 1000],
    ["420 €", 420],
    ["0.99", 0.99],
    ["abc", null],
    ["", null],
  ])("interpreta el número %s", (input, expected) => {
    expect(parseLocaleNumber(input)).toBe(expected);
  });
});
