import type { Metadata } from "next";
import Link from "next/link";

import { ReadOnlyNotice } from "@/components/app/read-only-notice";
import { IncidentStatusBadge, SeverityBadge } from "@/components/pci/badges";
import { DataTable, EmptyState, FilterBar, INPUT, PageHeader, Td, uuidOrUndefined } from "@/components/pci/page-parts";
import { buttonClass } from "@/components/ui/button-styles";
import { Pagination } from "@/components/ui/pagination";
import { formatDate } from "@/lib/dates";
import { PAGE_SIZE, param, parsePage } from "@/lib/pagination";
import { SEVERITIES, SEVERITY_LABELS } from "@/lib/pci/labels";
import { capabilities } from "@/server/auth/capabilities";
import { requireOrgPage } from "@/server/auth/guards";
import { listIncidents } from "@/server/modules/incidents/service";

export const metadata: Metadata = { title: "Incidencias · RevisaYa" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function IncidentsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireOrgPage("/app/incidencias");
  const sp = await searchParams;
  const est = param(sp.estado);
  const status = est === "cerradas" ? "closed" : est === "todas" ? "all" : "open";
  const sev = param(sp.gravedad, 20);
  const severity = (SEVERITIES as readonly string[]).includes(sev ?? "") ? sev : undefined;
  const installationId = uuidOrUndefined(param(sp.instalacion, 40));
  const page = parsePage(param(sp.pagina));
  const result = await listIncidents(ctx, { status, severity, installationId, page, pageSize: PAGE_SIZE });
  const caps = capabilities(ctx);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Incidencias"
        subtitle="Anomalías detectadas en equipos e instalaciones y su resolución."
        actions={
          caps.incidentsWrite ? (
            <Link href="/app/incidencias/nueva" className={buttonClass("primary")}>
              Nueva incidencia
            </Link>
          ) : null
        }
      />
      {caps.readOnly ? <ReadOnlyNotice /> : null}
      <FilterBar>
        <select name="estado" defaultValue={est ?? ""} aria-label="Estado" className={INPUT}>
          <option value="">Abiertas y en curso</option>
          <option value="cerradas">Resueltas y descartadas</option>
          <option value="todas">Todas</option>
        </select>
        {installationId ? <input type="hidden" name="instalacion" value={installationId} /> : null}
        <select name="gravedad" defaultValue={severity ?? ""} aria-label="Gravedad" className={INPUT}>
          <option value="">Cualquier gravedad</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {SEVERITY_LABELS[s]}
            </option>
          ))}
        </select>
        <span />
        <button type="submit" className={buttonClass("secondary")}>
          Filtrar
        </button>
      </FilterBar>
      {result.rows.length === 0 ? (
        <EmptyState title={status === "open" ? "No hay incidencias abiertas." : "No hay incidencias en esta vista."} />
      ) : (
        <DataTable head={["Incidencia", "Instalación", "Equipo", "Detectada", "Gravedad", "Estado"]}>
          {result.rows.map((i) => (
            <tr key={i.id} className="hover:bg-[var(--surface-2)]">
              <Td>
                <Link href={`/app/incidencias/${i.id}`} className="font-medium text-[var(--accent)]">
                  {i.title}
                </Link>
                {i.workOrderNumber ? <div className="font-mono text-xs text-[var(--muted)]">{i.workOrderNumber}</div> : null}
              </Td>
              <Td>
                <Link href={`/app/instalaciones/${i.installationId}`} className="hover:underline">
                  {i.installationName}
                </Link>
                <div className="text-xs text-[var(--muted)]">{i.customerName}</div>
              </Td>
              <Td>
                {i.equipmentId ? (
                  <Link href={`/app/equipos/${i.equipmentId}`} className="font-mono hover:underline">
                    {i.equipmentCode}
                  </Link>
                ) : (
                  "—"
                )}
              </Td>
              <Td>{formatDate(i.detectedOn)}</Td>
              <Td>
                <SeverityBadge severity={i.severity} />
              </Td>
              <Td>
                <IncidentStatusBadge status={i.status} />
              </Td>
            </tr>
          ))}
        </DataTable>
      )}
      <Pagination page={result} basePath="/app/incidencias" params={{ estado: est, gravedad: severity, instalacion: installationId }} />
    </div>
  );
}
