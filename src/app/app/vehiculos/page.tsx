import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ReadOnlyNotice } from "@/components/app/read-only-notice";
import { buttonClass } from "@/components/ui/button-styles";
import { Pagination } from "@/components/ui/pagination";
import { NextServiceBadge, VehicleStatusBadge } from "@/components/workshop/badges";
import { formatDate, formatKm, todayIn } from "@/lib/dates";
import { PAGE_SIZE, param, parsePage } from "@/lib/pagination";
import { VEHICLE_STATUS_LABELS, VEHICLE_STATUSES } from "@/lib/validation/workshop";
import { capabilities } from "@/server/auth/capabilities";
import { requireOrgPage } from "@/server/auth/guards";
import { listAccessibleBranches } from "@/server/modules/branches/service";
import { type DueFilter, legacyVehicleCounts, listVehicles } from "@/server/modules/vehicles/service";

export const metadata: Metadata = { title: "Vehículos · RevisaYa" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const DUE_OPTIONS: Record<string, { value: DueFilter; label: string }> = {
  vencidas: { value: "overdue", label: "Revisión vencida" },
  "30": { value: "30", label: "Revisión en 30 días" },
  "90": { value: "90", label: "Revisión en 90 días" },
  "sin-fecha": { value: "none", label: "Sin próxima revisión" },
};

export default async function VehiclesPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireOrgPage("/app/vehiculos");
  const sp = await searchParams;
  const q = param(sp.q);
  const branchId = param(sp.taller, 40);
  const statusParam = param(sp.estado);
  const status = statusParam && (VEHICLE_STATUSES as readonly string[]).includes(statusParam) ? statusParam : statusParam === "todos" ? undefined : statusParam ? undefined : "active";
  const dueKey = param(sp.revision);
  const due = dueKey ? DUE_OPTIONS[dueKey]?.value : undefined;
  const page = parsePage(param(sp.pagina));
  const today = todayIn();
  // Módulo heredado: sin vehículos en la cuenta, la sección es la de equipos PCI.
  if ((await legacyVehicleCounts(ctx)).vehicles === 0) redirect("/app/equipos");

  const [result, branches] = await Promise.all([
    listVehicles(ctx, { q, branchId: branchId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(branchId) ? branchId : undefined, status, due, page, pageSize: PAGE_SIZE }, today),
    listAccessibleBranches(ctx),
  ]);
  const caps = capabilities(ctx);
  const hasFilters = Boolean(q || branchId || due || statusParam);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vehículos (etapa anterior)</h1>
          <p className="text-sm text-[var(--muted)]">Datos conservados de cuando RevisaYa gestionaba talleres. Se mantienen con su historial; no se convierten en equipos PCI.</p>
        </div>
        <Link href="/app/equipos" className={buttonClass("primary")}>
          Ir a Equipos PCI
        </Link>
      </div>
      {caps.readOnly ? <ReadOnlyNotice /> : null}

      <form method="get" className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-[1fr_auto_auto_auto_auto]">
        <input
          name="q"
          type="search"
          aria-label="Buscar"
          defaultValue={q}
          placeholder="Matrícula, marca, modelo, bastidor o propietario"
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
        />
        <select name="revision" defaultValue={dueKey ?? ""} aria-label="Próxima revisión" className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-sm">
          <option value="">Cualquier fecha de revisión</option>
          {Object.entries(DUE_OPTIONS).map(([k, o]) => (
            <option key={k} value={k}>
              {o.label}
            </option>
          ))}
        </select>
        <select name="estado" defaultValue={statusParam ?? ""} aria-label="Estado" className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-sm">
          <option value="">Activos</option>
          <option value="todos">Todos los estados</option>
          {VEHICLE_STATUSES.filter((s) => s !== "active").map((s) => (
            <option key={s} value={s}>
              {VEHICLE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
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
          <p className="font-medium">{hasFilters ? "Ningún vehículo coincide con los filtros." : "Todavía no hay vehículos."}</p>
          {hasFilters ? (
            <Link className="mt-1 inline-block text-sm text-[var(--accent)]" href="/app/vehiculos">
              Quitar filtros
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Matrícula</th>
                <th className="px-4 py-3 font-medium">Vehículo</th>
                <th className="px-4 py-3 font-medium">Propietario</th>
                <th className="px-4 py-3 font-medium">Km</th>
                <th className="px-4 py-3 font-medium">Última revisión</th>
                <th className="px-4 py-3 font-medium">Próxima revisión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {result.rows.map((v) => (
                <tr key={v.id} className="hover:bg-[var(--surface-2)]">
                  <td className="px-4 py-3">
                    <Link href={`/app/vehiculos/${v.id}`} className="font-mono font-semibold text-[var(--accent)]">
                      {v.plate}
                    </Link>
                    {v.status !== "active" ? (
                      <span className="ml-2">
                        <VehicleStatusBadge status={v.status} />
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{[v.make, v.model].filter(Boolean).join(" ") || <span className="text-[var(--muted)]">—</span>}</td>
                  <td className="px-4 py-3">
                    <Link href={`/app/clientes/${v.customerId}`} className="hover:text-[var(--accent)]">
                      {v.customerName}
                    </Link>
                    {branches.length > 1 ? <div className="text-xs text-[var(--muted)]">{v.branchName}</div> : null}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{formatKm(v.currentKm)}</td>
                  <td className="px-4 py-3 tabular-nums">{formatDate(v.lastServiceDate) || <span className="text-[var(--muted)]">—</span>}</td>
                  <td className="px-4 py-3">
                    <NextServiceBadge date={v.nextServiceDate} today={today} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={result} basePath="/app/vehiculos" params={{ q, taller: branchId, estado: statusParam, revision: dueKey }} />
    </div>
  );
}
