import type { Metadata } from "next";
import Link from "next/link";

import { ResultBadge } from "@/components/pci/badges";
import { DataTable, EmptyState, FilterBar, INPUT, PageHeader, Td, uuidOrUndefined } from "@/components/pci/page-parts";
import { buttonClass } from "@/components/ui/button-styles";
import { Pagination } from "@/components/ui/pagination";
import { formatDate, isValidIsoDate } from "@/lib/dates";
import { PAGE_SIZE, param, parsePage } from "@/lib/pagination";
import { CATEGORY_SINGULAR, type CategoryCode, RESULT_LABELS, RESULTS } from "@/lib/pci/labels";
import { requireOrgPage } from "@/server/auth/guards";
import { listRecords } from "@/server/modules/maintenance/records";
import { legacyVehicleCounts } from "@/server/modules/vehicles/service";

export const metadata: Metadata = { title: "Mantenimientos · RevisaYa" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Historial de actuaciones sobre equipos PCI (todas las instalaciones visibles para el usuario). */
export default async function RecordsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireOrgPage("/app/mantenimientos");
  const sp = await searchParams;
  const from = param(sp.desde, 10);
  const to = param(sp.hasta, 10);
  const res = param(sp.resultado, 40);
  const result = (RESULTS as readonly string[]).includes(res ?? "") ? res : undefined;
  const installationId = uuidOrUndefined(param(sp.instalacion, 40));
  const includeVoided = param(sp.anuladas) === "1";
  const page = parsePage(param(sp.pagina));
  const [records, legacy] = await Promise.all([
    listRecords(ctx, {
      from: from && isValidIsoDate(from) ? from : undefined,
      to: to && isValidIsoDate(to) ? to : undefined,
      result,
      installationId,
      includeVoided,
      page,
      pageSize: PAGE_SIZE,
    }),
    legacyVehicleCounts(ctx),
  ]);
  const hasFilters = Boolean(from || to || result || installationId || includeVoided);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Mantenimientos"
        subtitle="Historial de actuaciones registradas sobre los equipos: revisiones, retimbrados, recargas, reparaciones y bajas. Las actuaciones no se borran: se corrigen o se anulan dejando constancia."
      />
      <FilterBar cols="sm:grid-cols-2 lg:grid-cols-[auto_auto_1fr_auto_auto]">
        <label className="flex items-center gap-2 text-sm">
          Desde
          <input type="date" name="desde" defaultValue={from} className={INPUT} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          Hasta
          <input type="date" name="hasta" defaultValue={to} className={INPUT} />
        </label>
        {installationId ? <input type="hidden" name="instalacion" value={installationId} /> : null}
        <select name="resultado" defaultValue={result ?? ""} aria-label="Resultado" className={INPUT}>
          <option value="">Cualquier resultado</option>
          {RESULTS.map((r) => (
            <option key={r} value={r}>
              {RESULT_LABELS[r]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="anuladas" value="1" defaultChecked={includeVoided} />
          Incluir anuladas
        </label>
        <button type="submit" className={buttonClass("secondary")}>
          Filtrar
        </button>
      </FilterBar>

      {records.rows.length === 0 ? (
        <EmptyState title={hasFilters ? "Ninguna actuación coincide con los filtros." : "Todavía no hay actuaciones registradas."}>
          {hasFilters ? (
            <Link href="/app/mantenimientos" className="text-[var(--accent)]">
              Quitar filtros
            </Link>
          ) : (
            "Se registran desde la ficha de cada equipo o al cerrar los equipos de una orden de trabajo."
          )}
        </EmptyState>
      ) : (
        <DataTable head={["Fecha", "Equipo", "Operación", "Instalación", "Técnico / orden", "Resultado"]} minWidth="min-w-[860px]">
          {records.rows.map((r) => (
            <tr key={r.id} className={r.voidedAt ? "opacity-60" : "hover:bg-[var(--surface-2)]"}>
              <Td className={r.voidedAt ? "line-through" : ""}>{formatDate(r.performedOn)}</Td>
              <Td>
                <Link href={`/app/equipos/${r.equipmentId}`} className="font-mono font-medium text-[var(--accent)]">
                  {r.equipmentCode}
                </Link>
                <div className="text-xs text-[var(--muted)]">{CATEGORY_SINGULAR[r.categoryCode as CategoryCode] ?? r.categoryCode}</div>
              </Td>
              <Td>
                {r.actionName}
                {r.amendedAt ? <div className="text-xs text-[var(--muted)]">Corregida</div> : null}
                {r.voidedAt ? <div className="text-xs font-medium text-[var(--danger)]">Anulada</div> : null}
              </Td>
              <Td>
                <Link href={`/app/instalaciones/${r.installationId}`} className="hover:underline">
                  {r.installationName}
                </Link>
              </Td>
              <Td>
                {r.technicianName ?? "—"}
                {r.workOrderId ? (
                  <div>
                    <Link href={`/app/ordenes-trabajo/${r.workOrderId}`} className="font-mono text-xs text-[var(--accent)]">
                      {r.workOrderNumber}
                    </Link>
                  </div>
                ) : null}
              </Td>
              <Td>
                <ResultBadge result={r.result} />
              </Td>
            </tr>
          ))}
        </DataTable>
      )}
      <Pagination page={records} basePath="/app/mantenimientos" params={{ desde: from, hasta: to, resultado: result, instalacion: installationId, anuladas: includeVoided ? "1" : undefined }} />
      {legacy.records ? (
        <p className="text-xs text-[var(--muted)]">
          La cuenta conserva {legacy.records.toLocaleString("es-ES")} revisiones de vehículos de la etapa anterior:{" "}
          <Link href="/app/historial" className="text-[var(--accent)]">
            ver el historial de vehículos
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
