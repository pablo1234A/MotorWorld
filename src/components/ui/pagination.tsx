import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn, formatNumber } from "@/lib/utils";

type Props = { page: number; pageCount: number; total: number; pageSize: number; basePath: string; params: Record<string, string | undefined>; noun?: string };

/** Paginación con enlaces reales (funciona sin JavaScript y conserva los filtros en la URL). */
export function Pagination({ page, pageCount, total, pageSize, basePath, params, noun = "resultados" }: Props) {
  if (total === 0) return null;
  const href = (target: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
    if (target > 1) search.set("page", String(target));
    else search.delete("page");
    const query = search.toString();
    return query ? `${basePath}?${query}` : basePath;
  };
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const link = "inline-flex h-9 items-center gap-1 rounded-[10px] border border-line-strong bg-surface px-3 text-sm font-medium shadow-card hover:bg-sunken/60";
  const disabled = "pointer-events-none opacity-45";
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 px-1 pt-4" aria-label="Paginación">
      <p className="text-[13px] text-muted">
        {formatNumber(first)}–{formatNumber(last)} de {formatNumber(total)} {noun}
      </p>
      <div className="flex items-center gap-2">
        <Link href={href(page - 1)} aria-disabled={page <= 1} tabIndex={page <= 1 ? -1 : undefined} className={cn(link, page <= 1 && disabled)} rel="prev">
          <ChevronLeft className="size-4" aria-hidden /> Anterior
        </Link>
        <span className="px-1 text-[13px] tabular-nums text-muted">
          {page} / {Math.max(pageCount, 1)}
        </span>
        <Link href={href(page + 1)} aria-disabled={page >= pageCount} tabIndex={page >= pageCount ? -1 : undefined} className={cn(link, page >= pageCount && disabled)} rel="next">
          Siguiente <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>
    </nav>
  );
}
