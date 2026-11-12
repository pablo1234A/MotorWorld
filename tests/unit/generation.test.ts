import { describe, expect, it } from "vitest";
import { buildTitle, composeListing } from "@/domain/generation/template-provider";
import type { GenerationOptions, GenerationProduct } from "@/domain/generation/types";
import { MARKETPLACE_PROFILES, resolveProfile } from "@/domain/marketplaces/profiles";

const phone: GenerationProduct = {
  name: "iPhone 13",
  category: "Móviles y telefonía",
  subcategory: "Smartphones",
  brand: "Apple",
  model: null,
  price: 420,
  currency: "EUR",
  condition: "very_good",
  conditionCustom: null,
  description: "Siempre con funda.",
  features: [],
  defects: "Roce en una esquina",
  location: "Valencia",
  attributes: [
    { key: "almacenamiento", label: "Almacenamiento", value: "128 GB", showInTitle: true, isBoolean: false },
    { key: "color", label: "Color", value: "Azul", showInTitle: true, isBoolean: false },
  ],
  missingAttributes: [],
  imageCount: 2,
};

const options = (overrides: Partial<GenerationOptions> = {}): GenerationOptions => ({
  tone: "professional",
  length: "medium",
  language: "es",
  titleVariant: 0,
  profile: MARKETPLACE_PROFILES.generic,
  ...overrides,
});

describe("generador por plantillas", () => {
  it("genera todos los bloques del anuncio", () => {
    const listing = composeListing(phone, options());
    expect(listing.title).toContain("Apple iPhone 13");
    expect(listing.title).toContain("128 GB");
    expect(listing.description).toContain("Siempre con funda.");
    expect(listing.shortDescription).toContain("420");
    expect(listing.highlights).toContain("Almacenamiento: 128 GB");
    expect(listing.keywords).toContain("apple");
    expect(listing.conditionInfo).toContain("Muy buen estado");
    expect(listing.method).toBe("template");
  });

  it("incluye siempre los defectos indicados", () => {
    const listing = composeListing(phone, options({ length: "short" }));
    expect(listing.description).toContain("Roce en una esquina");
    expect(listing.conditionInfo).toContain("Roce en una esquina");
  });

  it("no inventa especificaciones que no se han proporcionado", () => {
    const minimal: GenerationProduct = { ...phone, brand: null, description: "", attributes: [], features: [], defects: "", price: null, location: null, imageCount: 0 };
    const listing = composeListing(minimal, options({ length: "long" }));
    const text = `${listing.title} ${listing.description} ${listing.shortDescription}`.toLowerCase();
    for (const invented of ["garantía", "gb", "batería", "envío", "original", "apple", "factura", "certificad"]) {
      expect(text).not.toContain(invented);
    }
    expect(listing.missingInfo.join(" ")).toMatch(/precio/i);
    expect(listing.missingInfo.join(" ")).toMatch(/fotograf/i);
    expect(listing.missingInfo.join(" ")).toMatch(/descripción/i);
  });

  it("pide los atributos obligatorios ausentes", () => {
    const listing = composeListing({ ...phone, missingAttributes: ["Almacenamiento"] }, options());
    expect(listing.missingInfo).toContain("Falta indicar: Almacenamiento.");
  });

  it("respeta los límites del perfil de Wallapop", () => {
    const longName = { ...phone, name: "Teléfono móvil inteligente de gama alta con pantalla grande", description: "x ".repeat(2000) };
    const listing = composeListing(longName, options({ profile: MARKETPLACE_PROFILES.wallapop }));
    expect(listing.title.length).toBeLessThanOrEqual(MARKETPLACE_PROFILES.wallapop.titleMaxLength);
    expect(listing.description.length).toBeLessThanOrEqual(MARKETPLACE_PROFILES.wallapop.descriptionMaxLength);
  });

  it("produce HTML seguro para perfiles HTML", () => {
    const listing = composeListing({ ...phone, description: "<script>alert(1)</script>Texto <b>limpio</b>" }, options({ profile: MARKETPLACE_PROFILES.ebay }));
    expect(listing.description).toContain("<p>");
    expect(listing.description).not.toMatch(/<script/i);
    expect(listing.description).not.toContain("alert(1)");
    expect(listing.description).not.toContain("<b>");
  });

  it("añade hashtags en Vinted", () => {
    const listing = composeListing(phone, options({ profile: MARKETPLACE_PROFILES.vinted }));
    expect(listing.description).toMatch(/#apple/);
  });

  it("cambia el texto según el tono", () => {
    const pro = composeListing(phone, options({ tone: "professional" }));
    const friendly = composeListing(phone, options({ tone: "friendly" }));
    expect(pro.description).not.toBe(friendly.description);
  });

  it("genera en inglés", () => {
    const listing = composeListing(phone, options({ language: "en" }));
    expect(listing.description).toContain("Condition");
    expect(listing.conditionInfo).toContain("Very good condition");
  });

  it("las variantes de título producen estructuras distintas y respetan el límite", () => {
    const titles = new Set([0, 1, 2, 3, 4].map((variant) => buildTitle(phone, variant, 80, "es")));
    expect(titles.size).toBeGreaterThan(2);
    for (const title of titles) expect(title.length).toBeLessThanOrEqual(80);
  });

  it("no duplica la marca si ya está en el nombre", () => {
    expect(buildTitle({ ...phone, name: "Apple iPhone 13" }, 0, 120, "es")).not.toMatch(/Apple Apple/);
  });

  it("aplica la configuración de una plantilla personalizada", () => {
    const profile = resolveProfile("wallapop", { includePrice: true, customCta: "Envío en mano en Valencia.", titleMaxLength: 1000 }, "Mi plantilla");
    expect(profile.titleMaxLength).toBe(300); // acotado al máximo permitido
    const listing = composeListing(phone, options({ profile }));
    expect(listing.description).toContain("420");
    expect(listing.cta).toBe("Envío en mano en Valencia.");
  });
});
