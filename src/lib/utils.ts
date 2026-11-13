import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(amount: number | null | undefined, currency = "EUR", locale = "es-ES"): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  try {
    // Los importes redondos se muestran sin decimales (0 €, 420 €); el resto, con dos (5,99 €).
    return new Intl.NumberFormat(locale, { style: "currency", currency, useGrouping: "always", minimumFractionDigits: Number.isInteger(amount) ? 0 : 2 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export function formatNumber(value: number, locale = "es-ES"): string {
  // «always»: en español los números de cuatro cifras también llevan separador (2.000), como 50.000.
  return new Intl.NumberFormat(locale, { useGrouping: "always" }).format(value);
}

export function formatDate(value: string | Date | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", options ?? { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  return formatDate(value, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatRelative(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return "ahora mismo";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Margen estimado sobre el precio de venta. Devuelve null si faltan datos. */
export function estimateMargin(price: number | null | undefined, cost: number | null | undefined) {
  if (price === null || price === undefined || cost === null || cost === undefined) return null;
  const amount = Math.round((price - cost) * 100) / 100;
  const percent = price > 0 ? Math.round((amount / price) * 1000) / 10 : null;
  return { amount, percent };
}

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
