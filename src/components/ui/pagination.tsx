import Link from "next/link";

import { type Page, pageCount } from "@/lib/pagination";

/** Paginación por enlaces (funciona sin JavaScript) conservando los filtros. */
export function Pagination({
  page,
  basePath,
  params,
}: {
  page: Pick<Page<unknown>, "page" | "pageSize" | "total">;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  const pages = pageCount(page);
  if (page.total === 0) return null;
  const href = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    if (p > 1) qs.set("pagina", String(p));
    const s = qs.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const from = (page.page - 1) * page.pageSize + 1;
  const to = Math.min(page.page * page.pageSize, page.total);
  return (
    <nav aria-label="Paginación" className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-[var(--muted)]">
        {from.toLocaleString("es-ES")}–{to.toLocaleString("es-ES")} de {page.total.toLocaleString("es-ES")}
      </p>
      <div className="flex gap-2">
        {page.page > 1 ? (
          <Link className="rounded-lg border border-[var(--border)] px-3 py-1.5 hover:bg-[var(--surface-2)]" href={href(page.page - 1)}>
            Anterior
          </Link>
        ) : null}
        <span className="px-2 py-1.5 text-[var(--muted)]">
          Página {page.page} de {pages}
        </span>
        {page.page < pages ? (
          <Link className="rounded-lg border border-[var(--border)] px-3 py-1.5 hover:bg-[var(--surface-2)]" href={href(page.page + 1)}>
            Siguiente
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
