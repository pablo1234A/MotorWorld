import type { ExportFormat } from "../plans";
import { htmlToPlain, looksLikeHtml, plainToHtml } from "../text";
import { slugify } from "@/lib/utils";

export type ExportableListing = {
  id: string;
  title: string;
  description: string;
  shortDescription: string;
  highlights: string[];
  sellingPoints: string[];
  keywords: string[];
  conditionInfo: string;
  cta: string;
  platform: string;
  status: string;
  language: string;
  product: {
    name: string;
    sku: string | null;
    brand: string | null;
    model: string | null;
    price: number | null;
    currency: string;
    condition: string;
    category: string | null;
  };
};

/**
 * Escapa una celda CSV (RFC 4180) y neutraliza la inyección de fórmulas en hojas
 * de cálculo anteponiendo un apóstrofo a los valores que empiezan por = + - @.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = typeof value === "string" ? value : String(value);
  if (/^[=+\-@\t\r]/.test(text) && typeof value === "string") text = `'${text}`;
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(","))];
  // BOM para que Excel detecte UTF-8.
  return `﻿${lines.join("\r\n")}\r\n`;
}

const plain = (text: string) => (looksLikeHtml(text) ? htmlToPlain(text) : text);

function toTxt(listings: ExportableListing[]): string {
  return listings
    .map((listing) =>
      [
        listing.title,
        "",
        plain(listing.description),
        listing.keywords.length ? `\nPalabras clave: ${listing.keywords.join(", ")}` : "",
      ]
        .filter((part) => part !== "")
        .join("\n"),
    )
    .join("\n\n----------------------------------------\n\n");
}

function toGenericCsv(listings: ExportableListing[]): string {
  return toCsv(
    ["sku", "producto", "titulo", "descripcion", "descripcion_breve", "caracteristicas", "puntos_de_venta", "palabras_clave", "estado_producto", "precio", "moneda", "marca", "modelo", "categoria", "plataforma", "estado_anuncio", "idioma"],
    listings.map((l) => [
      l.product.sku ?? "",
      l.product.name,
      l.title,
      plain(l.description),
      l.shortDescription,
      l.highlights.join(" | "),
      l.sellingPoints.join(" | "),
      l.keywords.join(", "),
      l.conditionInfo,
      l.product.price ?? "",
      l.product.currency,
      l.product.brand ?? "",
      l.product.model ?? "",
      l.product.category ?? "",
      l.platform,
      l.status,
      l.language,
    ]),
  );
}

/**
 * CSV con las columnas principales del formato de importación de productos de Shopify.
 * No es una integración oficial: revisa el archivo en tu tienda antes de importarlo.
 */
function toShopifyCsv(listings: ExportableListing[]): string {
  return toCsv(
    ["Handle", "Title", "Body (HTML)", "Vendor", "Type", "Tags", "Published", "Variant SKU", "Variant Price", "Status"],
    listings.map((l) => [
      slugify(l.product.sku ? `${l.title}-${l.product.sku}` : `${l.title}-${l.id.slice(0, 8)}`),
      l.title,
      looksLikeHtml(l.description) ? l.description : plainToHtml(l.description),
      l.product.brand ?? "",
      l.product.category ?? "",
      l.keywords.join(", "),
      "FALSE",
      l.product.sku ?? "",
      l.product.price ?? "",
      "draft",
    ]),
  );
}

export type ExportFile = { body: string; contentType: string; extension: string };

export function exportListings(listings: ExportableListing[], format: ExportFormat): ExportFile {
  switch (format) {
    case "json":
      return { body: JSON.stringify(listings, null, 2), contentType: "application/json; charset=utf-8", extension: "json" };
    case "csv":
      return { body: toGenericCsv(listings), contentType: "text/csv; charset=utf-8", extension: "csv" };
    case "shopify_csv":
      return { body: toShopifyCsv(listings), contentType: "text/csv; charset=utf-8", extension: "csv" };
    default:
      return { body: toTxt(listings), contentType: "text/plain; charset=utf-8", extension: "txt" };
  }
}
