/** Paginación en servidor: página 1..N y tamaño fijo por listado. */
export const PAGE_SIZE = 25;
export const MAX_PAGE = 10_000;

export function parsePage(value: unknown): number {
  const n = typeof value === "string" ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_PAGE) : 1;
}

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function pageCount(p: Pick<Page<unknown>, "total" | "pageSize">): number {
  return Math.max(1, Math.ceil(p.total / p.pageSize));
}

/** Escapa los comodines de LIKE en un término de búsqueda escrito por el usuario. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Lee un parámetro de búsqueda de texto (primer valor, recortado y acotado). */
export function param(value: string | string[] | undefined, max = 100): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  const t = v?.trim();
  return t ? t.slice(0, max) : undefined;
}
