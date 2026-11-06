import Decimal from "decimal.js";

/**
 * Importes de presupuestos con decimal.js (sin coma flotante). Mismas reglas
 * que la base de datos, que las vuelve a verificar al guardar:
 *   subtotal de línea = round(cantidad × precio, 2)
 *   IVA de línea      = round(subtotal × tipo / 100, 2)
 *   total de línea    = subtotal + IVA
 * Redondeo: mitad hacia arriba (como round() de PostgreSQL con importes positivos).
 */

const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export const TAX_RATES = [21, 10, 4, 0] as const;
export type TaxRate = (typeof TAX_RATES)[number];

export interface LineInput {
  quantity: string;
  unitPrice: string;
  taxRate: number;
}

export interface LineAmounts {
  subtotal: string;
  tax: string;
  total: string;
}

/** "4,5" → "4.5"; "1.234,56" → "1234.56". Devuelve null si no es un número. */
export function parseDecimalInput(input: string, maxDecimals: number): string | null {
  let v = input.trim().replace(/\s|€/g, "");
  if (!v) return null;
  if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(v)) return null;
  const decimals = v.split(".")[1]?.length ?? 0;
  if (decimals > maxDecimals) return null;
  return new D(v).toFixed();
}

export function lineAmounts(line: LineInput): LineAmounts {
  const subtotal = new D(line.quantity).times(line.unitPrice).toDecimalPlaces(2);
  const tax = subtotal.times(line.taxRate).dividedBy(100).toDecimalPlaces(2);
  return { subtotal: subtotal.toFixed(2), tax: tax.toFixed(2), total: subtotal.plus(tax).toFixed(2) };
}

export interface QuoteTotals {
  subtotal: string;
  taxTotal: string;
  total: string;
  /** Base e IVA por tipo (desglose obligatorio cuando hay varios tipos). */
  byRate: Array<{ rate: number; base: string; tax: string }>;
}

export function quoteTotals(lines: LineInput[]): QuoteTotals {
  let subtotal = new D(0);
  let tax = new D(0);
  const byRate = new Map<number, { base: Decimal; tax: Decimal }>();
  for (const l of lines) {
    const a = lineAmounts(l);
    subtotal = subtotal.plus(a.subtotal);
    tax = tax.plus(a.tax);
    const r = byRate.get(l.taxRate) ?? { base: new D(0), tax: new D(0) };
    byRate.set(l.taxRate, { base: r.base.plus(a.subtotal), tax: r.tax.plus(a.tax) });
  }
  return {
    subtotal: subtotal.toFixed(2),
    taxTotal: tax.toFixed(2),
    total: subtotal.plus(tax).toFixed(2),
    byRate: [...byRate.entries()].sort((a, b) => b[0] - a[0]).map(([rate, v]) => ({ rate, base: v.base.toFixed(2), tax: v.tax.toFixed(2) })),
  };
}

const EUR = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

/** "1234.5" → "1234,50 €" (formato español). */
export function formatEuro(amount: string | number): string {
  return EUR.format(Number(amount));
}

export function formatQuantity(q: string | number): string {
  return Number(q).toLocaleString("es-ES", { maximumFractionDigits: 3 });
}
