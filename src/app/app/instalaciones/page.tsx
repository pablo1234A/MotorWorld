import type { Metadata } from "next";
import Link from "next/link";

import { ReadOnlyNotice } from "@/components/app/read-only-notice";
import { Badge, DueBadge } from "@/components/pci/badges";
import { DataTable, EmptyState, FilterBar, INPUT, PageHeader, Td, uuidOrUndefined } from "@/components/pci/page-parts";
import { buttonClass } from "@/components/ui/button-styles";
import { Alert } from "@/components/ui/feedback";
import { Pagination } from "@/components/ui/pagination";
import { todayIn } from "@/lib/dates";
import { PAGE_SIZE, param, parsePage } from "@/lib/pagination";
import { ESTABLISHMENT_LABELS } from "@/lib/pci/labels";
import { capabilities } from "@/server/auth/capabilities";
import { requireOrgPage } from "@/server/auth/guards";
import { listInstallations } from "@/server/modules/installations/service";

export const metadata: Metadata = { title: "Instalaciones · RevisaYa" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function InstallationsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireOrgPage("/app/instalaciones");
  const sp = await searchParams;
  const q = param(sp.q);
  const estado = param(sp.estado);
  const venc = param(sp.vencimiento);
  const customerId = uuidOrUndefined(param(sp.cliente, 40));
  const status = estado === "inactivas" ? "inactive" : estado === "todas" ? undefined : "active";
  const due = venc === "vencidas" ? "overdue" : venc === "30" ? "30" : undefined;
  const page = parsePage(param(sp.pagina));
  const result = await listInstallations(ctx, { q, customerId, status, due, page, pageSize: PAGE_SIZE });
  const caps = capabilities(ctx);
  const today = todayIn();
  const hasFilters = Boolean(q || customerId || estado || venc);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Instalaciones"
        subtitle="Edificios, naves y locales de tus clientes donde están los equipos de protección contra incendios."
        actions={
          caps.installationsWrite ? (
            <Link href="/app/instalaciones/nueva" className={buttonClass("primary")}>
              Nueva instalación
            </Link>
          ) : null
        }
      />
      {caps.readOnly ? <ReadOnlyNotice /> : null}
      {param(sp.borrada) ? <Alert tone="success">Instalación enviada a la papelera.</Alert> : null}

      <FilterBar>
        <input name="q" type="search" defaultValue={q} placeholder="Nombre, dirección, municipio o cliente" aria-label="Buscar" className={INPUT} />
        {customerId ? <input type="hidden" name="cliente" value={customerId} /> : null}
        <select name="estado" defaultValue={estado ?? ""} aria-label="Estado" className={INPUT}>
          <option value="">Activas</option>
          <option value="inactivas">Inactivas</option>
          <option value="todas">Todas</option>
        </select>
        <select name="vencimiento" defaultValue={venc ?? ""} aria-label="Vencimientos" className={INPUT}>
          <option value="">Cualquier vencimiento</option>
          <option value="vencidas">Con actuaciones vencidas</option>
          <option value="30">Vencen en 30 días</option>
        </select>
        <button type="submit" className={buttonClass("secondary")}>
          Buscar
        </button>
      </FilterBar>

      {result.rows.length === 0 ? (
        <EmptyState title={hasFilters ? "Ninguna instalación coincide con la búsqueda." : "Todavía no hay instalaciones."}>
          {hasFilters ? (
            <Link className="text-[var(--accent)]" href="/app/instalaciones">
              Quitar filtros
            </Link>
          ) : caps.installationsWrite ? (
            "Crea un cliente y añade su primera instalación."
          ) : null}
        </EmptyState>
      ) : (
        <DataTable head={["Instalación", "Cliente", "Equipos", "Próxima actuación", "Estado"]}>
          {result.rows.map((i) => (
            <tr key={i.id} className="hover:bg-[var(--surface-2)]">
              <Td>
                <Link href={`/app/instalaciones/${i.id}`} className="font-medium text-[var(--accent)]">
                  {i.name}
                </Link>
                <div className="text-xs text-[var(--muted)]">
                  {ESTABLISHMENT_LABELS[i.establishmentType as keyof typeof ESTABLISHMENT_LABELS] ?? i.establishmentType}
                  {i.city ? ` · ${i.city}` : ""}
                </div>
              </Td>
              <Td>
                <Link href={`/app/clientes/${i.customerId}`} className="hover:underline">
                  {i.customerName}
                </Link>
              </Td>
              <Td className="tabular-nums">
                {i.equipment}
                {i.overdue ? <span className="ml-2 text-xs font-medium text-[var(--danger)]">{i.overdue} vencidos</span> : null}
              </Td>
              <Td>
                <DueBadge date={i.nextActionOn} today={today} />
              </Td>
              <Td>{i.status === "active" ? <Badge tone="ok">Activa</Badge> : <Badge tone="neutral">Inactiva</Badge>}</Td>
            </tr>
          ))}
        </DataTable>
      )}
      <Pagination page={result} basePath="/app/instalaciones" params={{ q, cliente: customerId, estado, vencimiento: venc }} />
    </div>
  );
}
