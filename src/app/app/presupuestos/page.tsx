import type { Metadata } from "next";
import Link from "next/link";

import { buttonClass } from "@/components/ui/button-styles";
import { Alert } from "@/components/ui/feedback";
import { Pagination } from "@/components/ui/pagination";
import { formatDate } from "@/lib/dates";
import { PAGE_SIZE, param, parsePage } from "@/lib/pagination";
import { formatEuro } from "@/lib/quotes/money";
import { QUOTE_FILTERS, QUOTE_STATUS_LABELS } from "@/lib/validation/quotes";
import { can } from "@/server/auth/context";
import { requireOrgPage } from "@/server/auth/guards";
import { listQuotes } from "@/server/modules/quotes/service";

export const metadata: Metadata = { title: "Presupuestos · RevisaYa" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function QuotesPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireOrgPage("/app/presupuestos");
  if (!can(ctx, "quotes.manage")) {
    return <Alert tone="error" title="Sin permiso">No tienes permiso para gestionar presupuestos. Pídeselo a un administrador del taller.</Alert>;
  }
  const sp = await searchParams;
  const estado = param(sp.estado, 20);
  const status = (QUOTE_FILTERS as readonly string[]).includes(estado ?? "") ? estado : undefined;
  const q = param(sp.q);
  const page = parsePage(param(sp.pagina));
  const result = await listQuotes(ctx, { status, q, page, pageSize: PAGE_SIZE });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Presupuestos</h1>
          <p className="text-sm text-[var(--muted)]">Presupuestos en PDF con IVA para tus clientes.</p>
        </div>
        {ctx.subscription.active ? (
          <Link href="/app/presupuestos/nuevo" className={buttonClass("primary")}>
            Nuevo presupuesto
          </Link>
        ) : null}
      </div>
      {param(sp.borrado) ? <Alert tone="success">Borrador eliminado.</Alert> : null}

      <form method="get" className="flex flex-wrap gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <input name="q" type="search" aria-label="Buscar" defaultValue={q} placeholder="Número, cliente o matrícula" className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" />
        <select name="estado" defaultValue={status ?? ""} aria-label="Estado" className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-sm">
          <option value="">Todos</option>
          {QUOTE_FILTERS.map((s) => (
            <option key={s} value={s}>
              {QUOTE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <button type="submit" className={buttonClass("secondary")}>
          Filtrar
        </button>
      </form>

      {result.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-10 text-center">
          <p className="font-medium">{q || status ? "No hay presupuestos que coincidan." : "Todavía no hay presupuestos."}</p>
        </div>
      ) : (
        <div className="relative overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Número</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {result.rows.map((r) => (
                <tr key={r.id} className="hover:bg-[var(--surface-2)]">
                  <td className="px-4 py-3">
                    <Link href={`/app/presupuestos/${r.id}`} className="font-mono font-semibold text-[var(--accent)]">
                      {r.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{formatDate(r.issueDate)}</td>
                  <td className="px-4 py-3">
                    {r.customerName}
                    {r.plate ? <span className="text-[var(--muted)]"> · {r.plate}</span> : null}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatEuro(r.total)}</td>
                  <td className="px-4 py-3">{QUOTE_STATUS_LABELS[r.status] ?? r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={result} basePath="/app/presupuestos" params={{ q, estado: status }} />
    </div>
  );
}
