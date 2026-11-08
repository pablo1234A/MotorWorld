import Link from "next/link";
import type { ReactNode } from "react";

/** Piezas comunes de las pantallas PCI (servidor: sin estado). */

export const INPUT = "rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm";
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const uuidOrUndefined = (v: string | undefined) => (v && UUID_RE.test(v) ? v : undefined);

export function PageHeader({ title, subtitle, back, actions, badge }: { title: ReactNode; subtitle?: ReactNode; back?: { href: string; label: string }; actions?: ReactNode; badge?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      {back ? (
        <Link href={back.href} className="text-sm text-[var(--accent)]">
          ← {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {badge}
          </div>
          {subtitle ? <p className="text-sm text-[var(--muted)]">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] p-10 text-center">
      <p className="font-medium">{title}</p>
      {children ? <div className="mt-1 text-sm text-[var(--muted)]">{children}</div> : null}
    </div>
  );
}

export function FilterBar({ children, cols = "sm:grid-cols-[1fr_auto_auto_auto]" }: { children: ReactNode; cols?: string }) {
  return (
    <form method="get" className={`grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 ${cols}`}>
      {children}
    </form>
  );
}

export function DataTable({ head, children, minWidth = "min-w-[720px]" }: { head: string[]; children: ReactNode; minWidth?: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <table className={`w-full ${minWidth} text-left text-sm`}>
        <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--muted)]">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}

/** Lista de pares etiqueta/valor para las fichas. */
export function Facts({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {items
        .filter(([, value]) => value !== null && value !== undefined && value !== "")
        .map(([label, value]) => (
          <div key={label}>
            <dt className="text-[var(--muted)]">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
    </dl>
  );
}
