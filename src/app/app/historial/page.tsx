import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonClass } from "@/components/ui/button-styles";
import { Pagination } from "@/components/ui/pagination";
import { formatDate, formatKm, isValidIsoDate } from "@/lib/dates";
import { PAGE_SIZE, param, parsePage } from "@/lib/pagination";
import { requireOrgPage } from "@/server/auth/guards";
import { listAccessibleBranches } from "@/server/modules/branches/service";
import { listHistory } from "@/server/modules/maintenance/service";
import { legacyVehicleCounts } from "@/server/modules/vehicles/service";

export const metadata: Metadata = { title: "Historial · RevisaYa" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function HistoryPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireOrgPage("/app/historial");
  // El historial de actuaciones PCI está en /app/mantenimientos; este es el de vehículos (heredado).
  if ((await legacyVehicleCounts(ctx)).records === 0) redirect("/app/mantenimientos");
  const sp = await searchParams;
  const q = param(sp.q);
  const from = param(sp.desde, 10);
  const to = param(sp.hasta, 10);
  const branchId = param(sp.taller, 40);
  const page = parsePage(param(sp.pagina));
  const [result, branches] = await Promise.all([
    listHistory(ctx, {
      q,
      from: from && isValidIsoDate(from) ? from : undefined,
      to: to && isValidIsoDate(to) ? to : undefined,
      branchId: branchId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(branchId) ? branchId : undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    listAccessibleBranches(ctx),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Historial de vehículos (etapa anterior)</h1>
        <p className="text-sm text-[var(--muted)]">
          Revisiones de vehículos registradas antes del cambio a protección contra incendios. Las actuaciones sobre equipos PCI están en{" "}
          <Link href="/app/mantenimientos" className="text-[var(--accent)]">Mantenimientos</Link>.
        </p>
      </div>

      <form method="get" className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-[1fr_auto_auto_auto_auto]">
        <input
          name="q"
          type="search"
          aria-label="Buscar"
          defaultValue={q}
          placeholder="Matrícula, cliente o trabajo realizado"
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-sm">
          Desde
          <input type="date" name="desde" defaultValue={from} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-sm" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          Hasta
          <input type="date" name="hasta" defaultValue={to} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-sm" />
        </label>
        {branches.length > 1 ? (
          <select name="taller" defaultValue={branchId ?? ""} aria-label="Taller" className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-sm">
            <option value="">Todos los talleres</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        ) : null}
        <button type="submit" className={buttonClass("secondary")}>
          Filtrar
        </button>
      </form>

      {result.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-10 text-center">
          <p className="font-medium">No hay revisiones {q || from || to ? "que coincidan con los filtros" : "registradas todavía"}.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Vehículo</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Km</th>
                <th className="px-4 py-3 font-medium">Trabajos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {result.rows.map((r) => (
                <tr key={r.id} className="align-top hover:bg-[var(--surface-2)]">
                  <td className="px-4 py-3 tabular-nums">{formatDate(r.serviceDate)}</td>
                  <td className="px-4 py-3">
                    <Link href={`/app/vehiculos/${r.vehicleId}`} className="font-mono font-semibold text-[var(--accent)]">
                      {r.plate}
                    </Link>
                    <div className="text-xs text-[var(--muted)]">{r.vehicleName}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/app/clientes/${r.customerId}`} className="hover:text-[var(--accent)]">
                      {r.customerName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{formatKm(r.km)}</td>
                  <td className="px-4 py-3">
                    <p className="line-clamp-2">{r.workPerformed}</p>
                    {r.partsCount ? <p className="text-xs text-[var(--muted)]">{r.partsCount} piezas</p> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={result} basePath="/app/historial" params={{ q, desde: from, hasta: to, taller: branchId }} />
    </div>
  );
}
