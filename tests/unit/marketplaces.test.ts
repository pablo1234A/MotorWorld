import { describe, expect, it } from "vitest";
import { adaptListing, missingRequiredFields, type ListingContent } from "@/domain/marketplaces/adapt";
import { csvCell, exportListings, type ExportableListing } from "@/domain/marketplaces/export";
import { MARKETPLACE_PROFILES } from "@/domain/marketplaces/profiles";

const content: ListingContent = {
  title: "Bicicleta de montaña Orbea MX 40 29 pulgadas talla L en muy buen estado con extras",
  description: "Primer párrafo.\n\nSegundo párrafo con detalles.\n\n• Frenos de disco\n• Suspensión",
  shortDescription: "Bici",
  highlights: ["Frenos de disco"],
  sellingPoints: [],
  keywords: ["orbea", "bicicleta", "mtb", "29", "montaña", "orbea"],
  conditionInfo: "Muy buen estado",
  cta: "Escríbeme",
};

describe("adaptador de marketplaces", () => {
  it("recorta el título sin pasarse del límite y avisa", () => {
    const result = adaptListing(content, MARKETPLACE_PROFILES.wallapop);
    expect(result.content.title.length).toBeLessThanOrEqual(50);
    expect(result.warnings.join(" ")).toMatch(/título/);
  });

  it("convierte a HTML y elimina la CTA en eBay", () => {
    const result = adaptListing(content, MARKETPLACE_PROFILES.ebay);
    expect(result.content.description).toContain("<ul><li>Frenos de disco</li>");
    expect(result.content.cta).toBe("");
  });

  it("deduplica palabras clave y no duplica hashtags al readaptar", () => {
    const once = adaptListing(content, MARKETPLACE_PROFILES.vinted).content;
    const twice = adaptListing(once, MARKETPLACE_PROFILES.vinted).content;
    expect(once.keywords).toEqual(["orbea", "bicicleta", "mtb", "29", "montaña"]);
    expect((twice.description.match(/#orbea/g) ?? []).length).toBe(1);
  });

  it("vuelve a texto plano desde HTML", () => {
    const html = adaptListing(content, MARKETPLACE_PROFILES.shopify).content;
    const plain = adaptListing(html, MARKETPLACE_PROFILES.generic).content;
    expect(plain.description).not.toContain("<");
    expect(plain.description).toContain("• Frenos de disco");
  });

  it("indica los campos obligatorios ausentes", () => {
    const missing = missingRequiredFields(MARKETPLACE_PROFILES.vinted, { name: true, price: true, category: true, brand: false, condition: true, description: true, images: false, location: false });
    expect(missing).toEqual(["Marca", "Fotografías"]);
  });
});

describe("exportación", () => {
  const listing: ExportableListing = {
    id: "00000000-0000-4000-8000-000000000001",
    ...content,
    title: '=HYPERLINK("http://evil")',
    platform: "generic",
    status: "ready",
    language: "es",
    product: { name: "Bici, \"buena\"", sku: "B-1", brand: "Orbea", model: "MX 40", price: 420, currency: "EUR", condition: "very_good", category: "Bicicletas" },
  };

  it("neutraliza inyección de fórmulas y escapa comillas", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("@SUM")).toBe("'@SUM");
    expect(csvCell('a"b,c')).toBe('"a""b,c"');
    expect(csvCell(-5)).toBe("-5");
    const csv = exportListings([listing], "csv").body;
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(csv).toContain('"Bici, ""buena"""');
  });

  it("exporta JSON, TXT y CSV de Shopify", () => {
    expect(JSON.parse(exportListings([listing], "json").body)[0].id).toBe(listing.id);
    expect(exportListings([listing], "txt").body).toContain("Palabras clave:");
    const shopify = exportListings([listing], "shopify_csv").body;
    expect(shopify).toContain("Handle,Title,Body (HTML)");
    expect(shopify).toContain("<p>");
  });
});
