import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Column<T> = { header: string; cell: (row: T) => ReactNode; className?: string };

/** Tabla sencilla de solo lectura para el panel de administración. */
export function AdminTable<T>({ rows, columns, rowKey, empty }: { rows: T[]; columns: Column<T>[]; rowKey: (row: T) => string; empty: string }) {
  if (rows.length === 0) return <p className="rounded-card border border-line bg-surface px-5 py-10 text-center text-sm text-muted shadow-card">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-card">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-line bg-paper text-[12px] uppercase tracking-wider text-faint">
          <tr>
            {columns.map((column) => (
              <th key={column.header} className={cn("px-4 py-3 font-semibold", column.className)}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="align-top hover:bg-paper/60">
              {columns.map((column) => (
                <td key={column.header} className={cn("px-4 py-3", column.className)}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function pageParams(params: { page?: string; q?: string }, pageSize = 25) {
  const page = Math.max(1, Math.min(100000, Number.parseInt(params.page ?? "1", 10) || 1));
  const q = params.q?.trim().slice(0, 120) || undefined;
  return { page, pageSize, q };
}
