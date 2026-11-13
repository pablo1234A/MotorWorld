import { describe, expect, it } from "vitest";
import { buildTitle, composeListing } from "@/domain/generation/template-provider";
import type { GenerationOptions, GenerationProduct } from "@/domain/generation/types";
import { MARKETPLACE_PROFILES, resolveProfile } from "@/domain/marketplaces/profiles";

const phone: GenerationProduct = {
  name: "iPhone 13",
  category: "Móviles y telefonía",
  subcategory: "Smartphones",
  categorySlug: "moviles",
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
    expect(listing.description).toMatch(/roce en una esquina/i);
    expect(listing.conditionInfo).toMatch(/roce en una esquina/i);
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
    expect(listing.description).toMatch(/128 GB of storage/);
    expect(listing.description).toMatch(/very good condition/);
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

  it("redacta los atributos en lenguaje natural, sin repetir lo dicho en la apertura", () => {
    const listing = composeListing(
      { ...phone, attributes: [...phone.attributes, { key: "estado_bateria", label: "Estado de la batería", value: "89 %", showInTitle: false, isBoolean: false }, { key: "libre", label: "Libre de operador", value: "Sí", showInTitle: false, isBoolean: true }] },
      options(),
    );
    expect(listing.description).toContain("128 GB de almacenamiento y color azul");
    expect(listing.description).toContain("La batería conserva el 89 % de su capacidad.");
    expect(listing.description).toContain("Libre de operador.");
    expect((listing.description.match(/128 GB/g) ?? []).length).toBe(1);
    expect(listing.description).not.toMatch(/Almacenamiento: 128 GB/);
  });

  it("coloca la marca según el tipo de producto y respeta nombres como iPhone", () => {
    expect(buildTitle({ ...phone, name: "iPhone 13" }, 4, 120, "es")).toMatch(/^Apple iPhone 13/);
    const coat = { ...phone, name: "abrigo de lana", brand: "Mango", categorySlug: "ropa", attributes: [] };
    expect(buildTitle(coat, 4, 120, "es")).toBe("Abrigo de lana Mango");
    const drill = { ...phone, name: "Taladro percutor", brand: "Bosch", model: "GSB 18V-55", categorySlug: "herramientas", attributes: [] };
    expect(buildTitle(drill, 4, 120, "es")).toBe("Taladro percutor Bosch GSB 18V-55");
    expect(composeListing(coat, options({ tone: "friendly" })).description).toMatch(/[Vv]endo abrigo de lana Mango/);
  });

  it("«Volver a generar» ofrece otra redacción con los mismos datos y es determinista", () => {
    const first = composeListing(phone, options({ variation: 0 }));
    const again = composeListing(phone, options({ variation: 0 }));
    const texts = new Set([0, 1, 2, 3].map((variation) => composeListing(phone, options({ variation })).description));
    expect(again.description).toBe(first.description);
    expect(texts.size).toBeGreaterThanOrEqual(3);
    // Los datos no cambian entre variaciones.
    for (const text of texts) {
      expect(text).toContain("128 GB");
      expect(text).toMatch(/[Rr]oce en una esquina/);
    }
  });

  it("pule el texto del usuario sin cambiar sus palabras", () => {
    const listing = composeListing({ ...phone, description: "  funciona perfecto .  lo vendo con   funda", defects: "" }, options());
    expect(listing.description).toContain("Funciona perfecto. Lo vendo con funda.");
  });

  it("no repite como característica algo que ya está en la descripción", () => {
    const listing = composeListing({ ...phone, attributes: [], description: "Sofá con fundas de los cojines desenfundables.", features: ["Fundas desenfundables", "Patas de madera"] }, options());
    expect(listing.description).not.toMatch(/fundas desenfundables\./i);
    expect(listing.description).toMatch(/patas de madera/i);
    expect(listing.highlights).toContain("Fundas desenfundables");
  });

  it("NUNCA inventa datos: ningún tono, extensión, variación ni plataforma añade hechos", () => {
    // Producto sin marca, descripción, atributos, precio ni ubicación.
    const bare: GenerationProduct = { ...phone, name: "Lámpara de pie", brand: null, categorySlug: null, category: null, subcategory: null, description: "", attributes: [], features: [], defects: "", price: null, location: null, imageCount: 0, condition: "good" };
    const forbidden = ["garantía", "garantia", "factura", "envío", "envio", "original", "auténtic", "certificad", "devoluci", "regalo", "urge", "mudanza", "ya no", "oferta", "descuento", "ganga", "único dueño", "nuevo", "perfect", "impecable", "sin defectos", "sin arañazos", "funciona", "mejor precio", "€", "gb", "batería"];
    let checked = 0;
    for (const tone of ["professional", "friendly", "persuasive", "minimal"] as const) {
      for (const length of ["short", "medium", "long"] as const) {
        for (const profile of Object.values(MARKETPLACE_PROFILES)) {
          for (let variation = 0; variation < 6; variation += 1) {
            const conditions = ["very_good", "good", "acceptable", "refurbished", "for_parts"] as const;
            const listing = composeListing({ ...bare, condition: conditions[variation % conditions.length]! }, { tone, length, language: "es", titleVariant: variation, variation, profile });
            const text = [listing.title, listing.description, listing.shortDescription, listing.cta, ...listing.sellingPoints, ...listing.highlights].join(" ").toLowerCase();
            for (const term of forbidden) expect(text, `«${term}» en ${tone}/${length}/${profile.id}/v${variation}`).not.toContain(term);
            expect(listing.title.length).toBeLessThanOrEqual(profile.titleMaxLength);
            expect(listing.description.length).toBeLessThanOrEqual(profile.descriptionMaxLength);
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBe(4 * 3 * 6 * 6);
  });
});
