import type { Metadata } from "next";
import Link from "next/link";

import { ReadOnlyNotice } from "@/components/app/read-only-notice";
import { WorkOrderStatusBadge } from "@/components/pci/badges";
import { EmptyState, FilterBar, INPUT, PageHeader, uuidOrUndefined } from "@/components/pci/page-parts";
import { buttonClass } from "@/components/ui/button-styles";
import { Pagination } from "@/components/ui/pagination";
import { formatDate } from "@/lib/dates";
import { PAGE_SIZE, param, parsePage } from "@/lib/pagination";
import { SERVICE_TYPE_LABELS } from "@/lib/pci/labels";
import { capabilities } from "@/server/auth/capabilities";
import { requireOrgPage } from "@/server/auth/guards";
import { listTechnicians, myTechnicianId } from "@/server/modules/technicians/service";
import { listWorkOrders } from "@/server/modules/work-orders/service";

export const metadata: Metadata = { title: "Órdenes de trabajo · RevisaYa" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TABS = [
  ["abiertas", "Abiertas"],
  ["mias", "Mis órdenes"],
  ["cerradas", "Cerradas"],
  ["todas", "Todas"],
] as const;

export default async function WorkOrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireOrgPage("/app/ordenes-trabajo");
  const sp = await searchParams;
  const caps = capabilities(ctx);
  const tab = (TABS.map((t) => t[0]) as readonly string[]).includes(param(sp.estado) ?? "") ? (param(sp.estado) as (typeof TABS)[number][0]) : "abiertas";
  const installationId = uuidOrUndefined(param(sp.instalacion, 40));
  const techParam = uuidOrUndefined(param(sp.tecnico, 40));
  const page = parsePage(param(sp.pagina));
  const [mine, technicians] = await Promise.all([myTechnicianId(ctx), caps.seeAllWorkOrders ? listTechnicians(ctx) : Promise.resolve([])]);
  const technicianId = tab === "mias" ? (mine ?? "00000000-0000-0000-0000-000000000000") : techParam;
  const status = tab === "abiertas" || tab === "mias" ? "open" : tab === "cerradas" ? "closed" : undefined;
  const result = await listWorkOrders(ctx, { status, technicianId, installationId, page, pageSize: PAGE_SIZE });
  const tabHref = (t: string) => {
    const qs = new URLSearchParams({ estado: t });
    if (installationId) qs.set("instalacion", installationId);
    return `/app/ordenes-trabajo?${qs}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Órdenes de trabajo"
        subtitle={caps.seeAllWorkOrders ? "Planifica, asigna y sigue los trabajos de mantenimiento en las instalaciones." : "Las órdenes que tienes asignadas."}
        actions={
          caps.workOrdersManage ? (
            <Link href="/app/ordenes-trabajo/nueva" className={buttonClass("primary")}>
              Nueva orden
            </Link>
          ) : null
        }
      />
      {caps.readOnly ? <ReadOnlyNotice /> : null}

      <nav aria-label="Filtro de órdenes" className="flex flex-wrap gap-2">
        {TABS.filter(([t]) => t !== "mias" || mine).map(([t, label]) => (
          <Link key={t} href={tabHref(t)} aria-current={tab === t ? "page" : undefined} className={buttonClass(tab === t ? "primary" : "secondary", "!py-1.5")}>
            {label}
          </Link>
        ))}
      </nav>

      {caps.seeAllWorkOrders && technicians.length && tab !== "mias" ? (
        <FilterBar cols="sm:grid-cols-[1fr_auto]">
          <input type="hidden" name="estado" value={tab} />
          {installationId ? <input type="hidden" name="instalacion" value={installationId} /> : null}
          <select name="tecnico" defaultValue={techParam ?? ""} aria-label="Técnico" className={INPUT}>
            <option value="">Todos los técnicos</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName}
              </option>
            ))}
          </select>
          <button type="submit" className={buttonClass("secondary")}>
            Filtrar
          </button>
        </FilterBar>
      ) : null}

      {result.rows.length === 0 ? (
        <EmptyState title={tab === "mias" ? "No tienes órdenes abiertas asignadas." : "No hay órdenes en esta vista."}>
          {caps.workOrdersManage && tab === "abiertas" ? "Crea una desde la ficha de una instalación o con «Nueva orden»." : null}
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {result.rows.map((o) => (
            <li key={o.id}>
              <Link href={`/app/ordenes-trabajo/${o.id}`} className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--accent)] sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-semibold">{o.number}</span>
                    <WorkOrderStatusBadge status={o.status} />
                    <span className="text-xs text-[var(--muted)]">{SERVICE_TYPE_LABELS[o.serviceType as keyof typeof SERVICE_TYPE_LABELS] ?? o.serviceType}</span>
                  </span>
                  <span className="mt-1 block font-medium">
                    {o.installationName} <span className="font-normal text-[var(--muted)]">· {o.customerName}</span>
                  </span>
                  <span className="block truncate text-sm text-[var(--muted)]">{o.installationAddress}</span>
                </span>
                <span className="flex shrink-0 flex-wrap gap-x-4 text-sm sm:flex-col sm:items-end">
                  <span className="font-medium">{o.scheduledFor ? `${formatDate(o.scheduledFor)}${o.scheduledTime ? ` · ${o.scheduledTime}` : ""}` : "Sin fecha"}</span>
                  <span className="text-[var(--muted)]">{o.technicianName ?? "Sin técnico"}</span>
                  <span className="tabular-nums text-[var(--muted)]">
                    {o.itemsDone}/{o.items} equipos
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={result} basePath="/app/ordenes-trabajo" params={{ estado: tab, instalacion: installationId, tecnico: techParam }} />
    </div>
  );
}
