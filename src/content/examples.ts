import { composeListing } from "@/domain/generation/template-provider";
import type { GenerationProduct } from "@/domain/generation/types";
import { MARKETPLACE_PROFILES, type MarketplaceId } from "@/domain/marketplaces/profiles";

/**
 * Ejemplos de la web pública. No son textos escritos a mano: se generan en el
 * servidor con el mismo motor de plantillas que usa la aplicación, a partir de
 * los datos de muestra de abajo.
 */
const base = { currency: "EUR", conditionCustom: null, imageCount: 1, missingAttributes: [] as string[] };

const SAMPLES: { id: string; label: string; platform: MarketplaceId; input: { label: string; value: string }[]; product: GenerationProduct }[] = [
  {
    id: "movil",
    label: "Móvil de segunda mano",
    platform: "wallapop",
    input: [
      { label: "Producto", value: "iPhone 13" },
      { label: "Almacenamiento", value: "128 GB" },
      { label: "Color", value: "Azul" },
      { label: "Batería", value: "89 %" },
      { label: "Estado", value: "Muy buen estado" },
      { label: "Defectos", value: "Pequeño roce en una esquina" },
    ],
    product: {
      ...base,
      name: "iPhone 13",
      category: "Móviles y telefonía",
      subcategory: "Smartphones",
      brand: "Apple",
      model: null,
      price: 420,
      condition: "very_good",
      description: "Siempre con funda y protector de pantalla. Se entrega restaurado de fábrica.",
      features: [],
      defects: "Pequeño roce en una esquina del marco.",
      location: "Valencia",
      attributes: [
        { key: "almacenamiento", label: "Almacenamiento", value: "128 GB", showInTitle: true, isBoolean: false },
        { key: "color", label: "Color", value: "Azul", showInTitle: true, isBoolean: false },
        { key: "estado_bateria", label: "Estado de la batería", value: "89 %", showInTitle: false, isBoolean: false },
        { key: "libre", label: "Libre de operador", value: "Sí", showInTitle: false, isBoolean: true },
        { key: "accesorios", label: "Accesorios incluidos", value: "Caja y cable original", showInTitle: false, isBoolean: false },
      ],
    },
  },
  {
    id: "sofa",
    label: "Mueble para el hogar",
    platform: "facebook_marketplace",
    input: [
      { label: "Producto", value: "Sofá chaise longue" },
      { label: "Plazas", value: "3" },
      { label: "Material", value: "Tela" },
      { label: "Color", value: "Gris claro" },
      { label: "Dimensiones", value: "260 × 160 × 85 cm" },
      { label: "Estado", value: "Buen estado" },
    ],
    product: {
      ...base,
      name: "Sofá chaise longue",
      category: "Muebles",
      subcategory: "Sofás y sillones",
      brand: null,
      model: null,
      price: 280,
      condition: "good",
      description: "Sofá cómodo y amplio, con fundas de los cojines desenfundables. Procede de un hogar sin mascotas.",
      features: ["Fundas desenfundables"],
      defects: "",
      location: "Zaragoza",
      attributes: [
        { key: "plazas", label: "Número de plazas", value: "3 plazas", showInTitle: true, isBoolean: false },
        { key: "material", label: "Material", value: "Tela", showInTitle: true, isBoolean: false },
        { key: "color", label: "Color", value: "Gris claro", showInTitle: true, isBoolean: false },
        { key: "dimensiones", label: "Dimensiones", value: "260 × 160 × 85 cm", showInTitle: false, isBoolean: false },
      ],
    },
  },
  {
    id: "tienda",
    label: "Producto nuevo para tienda online",
    platform: "shopify",
    input: [
      { label: "Producto", value: "Mochila urbana 25 L" },
      { label: "Marca", value: "Norte" },
      { label: "Material", value: "Poliéster reciclado" },
      { label: "Color", value: "Verde bosque" },
      { label: "Estado", value: "Nuevo" },
    ],
    product: {
      ...base,
      name: "Mochila urbana 25 L",
      category: "Accesorios y complementos",
      subcategory: "Bolsos y mochilas",
      brand: "Norte",
      model: null,
      price: 59.9,
      condition: "new",
      description: "Mochila de uso diario con compartimento acolchado para portátil de hasta 15 pulgadas.",
      features: ["Compartimento acolchado para portátil", "Bolsillo lateral para botella", "Cierre con cremallera"],
      defects: "",
      location: null,
      attributes: [
        { key: "material", label: "Material", value: "Poliéster reciclado", showInTitle: false, isBoolean: false },
        { key: "color", label: "Color", value: "Verde bosque", showInTitle: true, isBoolean: false },
      ],
    },
  },
];

export function getLandingExamples() {
  return SAMPLES.map((sample) => {
    const profile = MARKETPLACE_PROFILES[sample.platform];
    const listing = composeListing(sample.product, { tone: profile.defaultTone ?? "professional", length: profile.defaultLength ?? "medium", language: "es", titleVariant: profile.titleVariant, profile });
    return { id: sample.id, label: sample.label, platform: profile.name, input: sample.input, title: listing.title, description: listing.description, keywords: listing.keywords, isHtml: profile.descriptionFormat === "html" };
  });
}
