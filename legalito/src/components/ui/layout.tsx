import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[15px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ children, className, title, description, actions }: { children: ReactNode; className?: string; title?: string; description?: string; actions?: ReactNode }) {
  return (
    <section className={cn("rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-soft)]", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div>
            {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}

export function DataTable({ headers, children, empty, label = "Tabla de datos" }: { headers: string[]; children: ReactNode; empty?: ReactNode; label?: string }) {
  return (
    // Región enfocable: permite desplazar la tabla con el teclado en pantallas estrechas.
    <div className="-mx-5 overflow-x-auto sm:-mx-6" tabIndex={0} role="region" aria-label={label}>
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-[13px] text-subtle">
            {headers.map((h) => (
              <th key={h} scope="col" className="px-5 py-2.5 font-medium first:pl-5 sm:first:pl-6">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line [&_td]:px-5 [&_td]:py-3 [&_td:first-child]:sm:pl-6">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-white px-4 py-3.5">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-navy-950">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}
