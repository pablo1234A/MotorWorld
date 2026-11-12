import { formatNumber } from "@/lib/utils";

/** Gráficos ligeros en SVG/CSS renderizados en servidor (sin librerías de cliente). */

export function ActivityChart({ data }: { data: { day: string; listings: number; products: number }[] }) {
  const max = Math.max(1, ...data.map((point) => point.listings + point.products));
  const formatter = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <div>
      <div className="flex h-40 items-end gap-[3px]" role="img" aria-label="Actividad de los últimos 30 días">
        {data.map((point) => {
          const total = point.listings + point.products;
          return (
            <div key={point.day} className="group relative flex h-full flex-1 flex-col justify-end">
              <div className="flex flex-col overflow-hidden rounded-t-[4px]" style={{ height: `${Math.max((total / max) * 100, total > 0 ? 4 : 1.5)}%` }}>
                {total === 0 ? <div className="h-full bg-line" /> : null}
                {point.listings > 0 ? <div className="bg-brand" style={{ flex: point.listings }} /> : null}
                {point.products > 0 ? <div className="bg-ink" style={{ flex: point.products }} /> : null}
              </div>
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs text-white shadow-raised group-hover:block">
                <p className="font-medium">{formatter.format(new Date(`${point.day}T00:00:00Z`))}</p>
                <p className="text-white/70">
                  {point.listings} anuncios · {point.products} productos
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-faint">
        <span>{data[0] ? formatter.format(new Date(`${data[0].day}T00:00:00Z`)) : ""}</span>
        <span>Hoy</span>
      </div>
      <div className="mt-3 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-brand" /> Anuncios
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-ink" /> Productos
        </span>
      </div>
    </div>
  );
}

export function BarList({ items, emptyLabel }: { items: { label: string; total: number }[]; emptyLabel: string }) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-muted">{emptyLabel}</p>;
  const max = Math.max(...items.map((item) => item.total), 1);
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{item.label}</span>
            <span className="tabular-nums text-muted">{formatNumber(item.total)}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-ink" style={{ width: `${(item.total / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
