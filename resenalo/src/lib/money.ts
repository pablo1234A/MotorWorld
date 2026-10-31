/**
 * Desglose fiscal de un precio con IVA incluido.
 * base = round(total / (1 + tipo)); cuota = total - base (garantiza base + cuota = total exacto).
 */
export function vatBreakdown(grossCents: number, vatRateBps: number) {
  if (!Number.isInteger(grossCents) || grossCents < 0) throw new Error("importe inválido");
  const base = Math.round((grossCents * 10000) / (10000 + vatRateBps));
  return { baseCents: base, vatCents: grossCents - base, totalCents: grossCents, vatRatePercent: vatRateBps / 100 };
}

export function formatEur(cents: number, opts: { withSymbol?: boolean } = {}) {
  const s = new Intl.NumberFormat("es-ES", {
    style: opts.withSymbol === false ? "decimal" : "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
  return s;
}
