import { describe, expect, it } from "vitest";
import { buildCsvTemplate, isValidMappingTarget, parseCondition, suggestMapping, validateImportRows } from "@/domain/csv/import";
import type { CategoryCatalog } from "@/domain/categories";

const catalog: CategoryCatalog = {
  categories: [
    { id: "m", name: "Muebles", slug: "muebles", parentId: null, isCustom: false },
    { id: "s", name: "Sofás y sillones", slug: "sofas", parentId: "m", isCustom: false },
  ],
  attributes: [],
};
const defaults = { condition: "good" as const, currency: "EUR" };

describe("importación CSV", () => {
  it("sugiere el mapeo por sinónimos", () => {
    expect(suggestMapping(["Nombre", "PRECIO", "Categoría", "Ref", "Otra"])).toEqual({ Nombre: "name", PRECIO: "price", Categoría: "category", Ref: "sku", Otra: "" });
  });

  it("valida destinos de mapeo", () => {
    expect(isValidMappingTarget("name")).toBe(true);
    expect(isValidMappingTarget("attr:color")).toBe(true);
    expect(isValidMappingTarget("attr:DROP TABLE")).toBe(false);
    expect(isValidMappingTarget("workspace_id")).toBe(false);
  });

  it("interpreta estados", () => {
    expect(parseCondition("Como nuevo")).toEqual({ condition: "like_new", custom: null });
    expect(parseCondition("PARA PIEZAS")).toEqual({ condition: "for_parts", custom: null });
    expect(parseCondition("Restaurado a mano")).toEqual({ condition: "custom", custom: "Restaurado a mano" });
    expect(parseCondition("")).toBeNull();
  });

  it("convierte filas válidas y reporta errores por fila", () => {
    const rows = [
      { nombre: "Sofá gris", precio: "180,50", categoria: "Muebles", sub: "Sofás y sillones", estado: "Muy buen estado", sku: "S1", caracteristicas: "Desenfundable; Tela", color: "Gris" },
      { nombre: "", precio: "10", categoria: "", sub: "", estado: "", sku: "", caracteristicas: "", color: "" },
      { nombre: "Mesa", precio: "gratis", categoria: "", sub: "", estado: "", sku: "", caracteristicas: "", color: "" },
      { nombre: "Otro sofá", precio: "50", categoria: "Inventada", sub: "", estado: "", sku: "S1", caracteristicas: "", color: "" },
      { nombre: "Silla", precio: "", categoria: "", sub: "", estado: "", sku: "", caracteristicas: "", color: "" },
      { nombre: "Silla", precio: "", categoria: "", sub: "", estado: "", sku: "", caracteristicas: "", color: "" },
      { nombre: "", precio: "", categoria: "", sub: "", estado: "", sku: "", caracteristicas: "", color: "" },
    ];
    const mapping = { nombre: "name", precio: "price", categoria: "category", sub: "subcategory", estado: "condition", sku: "sku", caracteristicas: "features", color: "attr:color" };
    const result = validateImportRows(rows, mapping, catalog, defaults);

    expect(result.valid).toHaveLength(2);
    const sofa = result.valid[0]!;
    expect(sofa.row).toBe(2);
    expect(sofa.product).toMatchObject({ name: "Sofá gris", price: 180.5, categoryId: "s", condition: "very_good", sku: "S1", features: ["Desenfundable", "Tela"], attributes: { color: "Gris" } });
    expect(result.valid[1]!.product.condition).toBe("good");

    expect(result.errors.find((issue) => issue.row === 3)?.field).toBe("name");
    expect(result.errors.find((issue) => issue.row === 4)?.field).toBe("price");
    expect(result.errors.find((issue) => issue.row === 5)?.message).toMatch(/Duplicado de la fila 2/);
    expect(result.errors.find((issue) => issue.row === 7)?.message).toMatch(/Duplicado de la fila 6/);
    expect(result.warnings.some((issue) => issue.row === 5 && issue.field === "category")).toBe(true);
    expect(result.duplicateRows).toBe(2);
    expect(result.invalidRows).toBe(2);
  });

  it("sanea el contenido de las celdas", () => {
    const result = validateImportRows([{ n: "<img src=x onerror=alert(1)>Lámpara", d: "<script>robo()</script>Bonita" }], { n: "name", d: "description" }, catalog, defaults);
    expect(result.valid[0]!.product.name).toBe("Lámpara");
    expect(result.valid[0]!.product.description).toBe("Bonita");
  });

  it("rechaza monedas no admitidas", () => {
    const result = validateImportRows([{ n: "A", c: "BTC" }], { n: "name", c: "currency" }, catalog, defaults);
    expect(result.valid).toHaveLength(0);
    expect(result.errors[0]!.field).toBe("currency");
  });

  it("la plantilla descargable es reconocida por el mapeo automático", () => {
    const header = buildCsvTemplate().replace(/^\uFEFF/, "").split("\r\n")[0]!.split(",");
    const mapping = suggestMapping(header);
    expect(Object.values(mapping).filter(Boolean)).toHaveLength(header.length);
  });
});
