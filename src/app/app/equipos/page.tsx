import type { Metadata } from "next";
import Link from "next/link";

import { ReadOnlyNotice } from "@/components/app/read-only-notice";
import { DueBadge, EquipmentStatusBadge } from "@/components/pci/badges";
import { FindEquipmentForm } from "@/components/pci/forms";
import { DataTable, EmptyState, FilterBar, INPUT, PageHeader, Td, uuidOrUndefined } from "@/components/pci/page-parts";
import { buttonClass } from "@/components/ui/button-styles";
import { Alert } from "@/components/ui/feedback";
import { Pagination } from "@/components/ui/pagination";
import { formatDate, todayIn } from "@/lib/dates";
import { PAGE_SIZE, param, parsePage } from "@/lib/pagination";
import { CATEGORY_CODES, CATEGORY_LABELS, CATEGORY_SINGULAR, type CategoryCode, EQUIPMENT_STATUS_LABELS, EQUIPMENT_STATUSES } from "@/lib/pci/labels";
import { capabilities } from "@/server/auth/capabilities";
import { requireOrgPage } from "@/server/auth/guards";
import { listEquipment } from "@/server/modules/equipment/service";

export const metadata: Metadata = { title: "Equipos PCI · RevisaYa" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function EquipmentListPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireOrgPage("/app/equipos");
  const sp = await searchParams;
  const q = param(sp.q);
  const cat = param(sp.categoria, 40);
  const categoryCode = (CATEGORY_CODES as readonly string[]).includes(cat ?? "") ? (cat as CategoryCode) : undefined;
  const est = param(sp.estado, 40);
  const status = (EQUIPMENT_STATUSES as readonly string[]).includes(est ?? "") ? est : undefined;
  const venc = param(sp.vencimiento);
  const due = venc === "vencidas" ? "overdue" : venc === "30" ? "30" : venc === "sin-fecha" ? "none" : undefined;
  const installationId = uuidOrUndefined(param(sp.instalacion, 40));
  const page = parsePage(param(sp.pagina));
  const result = await listEquipment(ctx, { q, categoryCode, status, due, installationId, page, pageSize: PAGE_SIZE });
  const caps = capabilities(ctx);
  const today = todayIn();
  const hasFilters = Boolean(q || categoryCode || status || due || installationId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Equipos PCI"
        subtitle="Extintores, BIE, detección, extinción automática y demás equipos de las instalaciones."
        actions={
          caps.equipmentWrite ? (
            <Link href="/app/equipos/nuevo" className={buttonClass("primary")}>
              Nuevo equipo
            </Link>
          ) : null
        }
      />
      {caps.readOnly ? <ReadOnlyNotice /> : null}
      {param(sp.no_encontrado) ? <Alert tone="warning">No hay ningún equipo con ese código o QR en tu empresa.</Alert> : null}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <FindEquipmentForm />
      </div>

      <FilterBar cols="sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto]">
        <input name="q" type="search" defaultValue={q} placeholder="Código, ubicación, nº de serie o instalación" aria-label="Buscar" className={INPUT} />
        {installationId ? <input type="hidden" name="instalacion" value={installationId} /> : null}
        <select name="categoria" defaultValue={categoryCode ?? ""} aria-label="Tipo de equipo" className={INPUT}>
          <option value="">Todos los tipos</option>
          {CATEGORY_CODES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <select name="estado" defaultValue={status ?? ""} aria-label="Estado" className={INPUT}>
          <option value="">En servicio y fuera de servicio</option>
          {EQUIPMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {EQUIPMENT_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select name="vencimiento" defaultValue={venc ?? ""} aria-label="Vencimiento" className={INPUT}>
          <option value="">Cualquier vencimiento</option>
          <option value="vencidas">Vencidas</option>
          <option value="30">Vencen en 30 días</option>
          <option value="sin-fecha">Sin próxima actuación</option>
        </select>
        <button type="submit" className={buttonClass("secondary")}>
          Filtrar
        </button>
      </FilterBar>

      {result.rows.length === 0 ? (
        <EmptyState title={hasFilters ? "Ningún equipo coincide con los filtros." : "Todavía no hay equipos."}>
          {hasFilters ? (
            <Link className="text-[var(--accent)]" href="/app/equipos">
              Quitar filtros
            </Link>
          ) : caps.equipmentWrite ? (
            "Añade los equipos desde la ficha de cada instalación o con «Nuevo equipo»."
          ) : null}
        </EmptyState>
      ) : (
        <DataTable head={["Código", "Equipo", "Instalación", "Ubicación", "Última", "Próxima", "Estado"]} minWidth="min-w-[900px]">
          {result.rows.map((e) => (
            <tr key={e.id} className="hover:bg-[var(--surface-2)]">
              <Td>
                <Link href={`/app/equipos/${e.id}`} className="font-mono font-medium text-[var(--accent)]">
                  {e.code}
                </Link>
              </Td>
              <Td>
                {CATEGORY_SINGULAR[e.categoryCode]}
                {e.typeName ? <div className="text-xs text-[var(--muted)]">{e.typeName}</div> : null}
              </Td>
              <Td>
                <Link href={`/app/instalaciones/${e.installationId}`} className="hover:underline">
                  {e.installationName}
                </Link>
                <div className="text-xs text-[var(--muted)]">{e.customerName}</div>
              </Td>
              <Td>{e.location ?? "—"}</Td>
              <Td>{formatDate(e.lastActionOn)}</Td>
              <Td>{e.status === "in_service" ? <DueBadge date={e.nextActionOn} today={today} /> : "—"}</Td>
              <Td>
                <EquipmentStatusBadge status={e.status} />
              </Td>
            </tr>
          ))}
        </DataTable>
      )}
      <Pagination page={result} basePath="/app/equipos" params={{ q, categoria: categoryCode, estado: status, vencimiento: venc, instalacion: installationId }} />
    </div>
  );
}
