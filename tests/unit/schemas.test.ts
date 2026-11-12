import { describe, expect, it } from "vitest";
import { generateSchema, importValidateSchema, listingUpdateSchema, productBulkSchema, productSchema, registerSchema } from "@/validation/schemas";

describe("validación de productos", () => {
  it("normaliza importes y campos vacíos", () => {
    const result = productSchema.parse({ name: "  Sofá  ", price: "1.234,50", costPrice: "", brand: "", condition: "good" });
    expect(result).toMatchObject({ name: "Sofá", price: 1234.5, costPrice: null, brand: null, currency: "EUR", features: [], attributes: {} });
  });

  it("rechaza datos no válidos", () => {
    expect(productSchema.safeParse({ name: "" }).success).toBe(false);
    expect(productSchema.safeParse({ name: "A", price: "-3" }).success).toBe(false);
    expect(productSchema.safeParse({ name: "A", currency: "XXX" }).success).toBe(false);
    expect(productSchema.safeParse({ name: "A", categoryId: "1; DROP TABLE" }).success).toBe(false);
    expect(productSchema.safeParse({ name: "A", condition: "custom" }).success).toBe(false);
    expect(productSchema.safeParse({ name: "x".repeat(201) }).success).toBe(false);
  });

  it("no acepta campos de propiedad enviados por el cliente", () => {
    const parsed = productSchema.parse({ name: "A", workspace_id: "00000000-0000-4000-8000-000000000000", created_by: "otro" });
    expect(parsed).not.toHaveProperty("workspace_id");
    expect(parsed).not.toHaveProperty("created_by");
  });
});

describe("otros esquemas", () => {
  it("registro: contraseñas, términos y coincidencia", () => {
    const ok = { fullName: "Ana", email: "ANA@Correo.com ", password: "secreta123", confirmPassword: "secreta123", acceptTerms: true };
    expect(registerSchema.parse(ok).email).toBe("ana@correo.com");
    expect(registerSchema.safeParse({ ...ok, password: "corta1", confirmPassword: "corta1" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...ok, password: "sololetras", confirmPassword: "sololetras" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...ok, confirmPassword: "otra12345" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...ok, acceptTerms: false }).success).toBe(false);
  });

  it("generación: exige clave de idempotencia válida", () => {
    const base = { productId: "6f9619ff-8b86-4011-b42d-00c04fc964ff", idempotencyKey: "a".repeat(32) };
    expect(generateSchema.safeParse(base).success).toBe(true);
    expect(generateSchema.safeParse({ ...base, idempotencyKey: "corta" }).success).toBe(false);
    expect(generateSchema.safeParse({ ...base, operation: "borrar_todo" }).success).toBe(false);
  });

  it("lotes: máximo 200 elementos y acción conocida", () => {
    const ids = Array.from({ length: 201 }, () => "6f9619ff-8b86-4011-b42d-00c04fc964ff");
    expect(productBulkSchema.safeParse({ action: "archive", ids }).success).toBe(false);
    expect(productBulkSchema.safeParse({ action: "update", ids: ids.slice(0, 1), fields: {} }).success).toBe(false);
  });

  it("mapeo de importación: exige nombre y destinos válidos", () => {
    const base = { importId: "6f9619ff-8b86-4011-b42d-00c04fc964ff", defaults: {} };
    expect(importValidateSchema.safeParse({ ...base, mapping: { A: "price" } }).success).toBe(false);
    expect(importValidateSchema.safeParse({ ...base, mapping: { A: "name", B: "workspace_id" } }).success).toBe(false);
    expect(importValidateSchema.safeParse({ ...base, mapping: { A: "name", B: "attr:color" } }).success).toBe(true);
  });

  it("anuncios: título no vacío y estados válidos", () => {
    expect(listingUpdateSchema.safeParse({ title: "" }).success).toBe(false);
    expect(listingUpdateSchema.safeParse({ status: "published" }).success).toBe(false);
    expect(listingUpdateSchema.safeParse({ status: "ready" }).success).toBe(true);
  });
});
