import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ReadOnlyNotice } from "@/components/app/read-only-notice";
import { ResultBadge, WorkOrderStatusBadge } from "@/components/pci/badges";
import {
  AddWorkOrderItemsForm,
  DocumentList,
  DocumentUploader,
  ItemResultForm,
  RemoveItemButton,
  Section,
  WorkOrderEditForm,
  WorkOrderNoteForm,
  WorkOrderStatusButtons,
} from "@/components/pci/forms";
import { Facts, PageHeader, UUID_RE } from "@/components/pci/page-parts";
import { buttonClass } from "@/components/ui/button-styles";
import { Alert } from "@/components/ui/feedback";
import { formatDate, formatDateTime, todayIn } from "@/lib/dates";
import { param } from "@/lib/pagination";
import { CATEGORY_SINGULAR, type CategoryCode, SERVICE_TYPE_LABELS, WORK_ORDER_STATUS_LABELS, type WorkOrderStatus } from "@/lib/pci/labels";
import { capabilities } from "@/server/auth/capabilities";
import { requireOrgPage } from "@/server/auth/guards";
import { listDocuments } from "@/server/modules/documents/service";
import { catalog, listEquipment } from "@/server/modules/equipment/service";
import { listTechnicians } from "@/server/modules/technicians/service";
import { getWorkOrder } from "@/server/modules/work-orders/service";

export const metadata: Metadata = { title: "Orden de trabajo · RevisaYa" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const EVENT_LABELS: Record<string, string> = {
  created: "Orden creada",
  status_changed: "Cambio de estado",
  technician_changed: "Cambio de técnico",
  rescheduled: "Cambio de fecha",
  note: "Nota",
  item_result: "Resultado de equipo",
};
const ITEM_STATUS: Record<string, string> = { pending: "Pendiente", done: "Hecho", not_done: "No realizado" };

export default async function WorkOrderPage({ params, searchParams }: Props) {
  const ctx = await requireOrgPage("/app/ordenes-trabajo");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!UUID_RE.test(id)) notFound();
  const o = await getWorkOrder(ctx, id);
  if (!o) notFound();
  const caps = capabilities(ctx);
  const today = todayIn();
  const closed = o.status === "completed" || o.status === "canceled";
  const canExecute = caps.workOrdersExecute && !closed;
  const canManage = caps.workOrdersManage && !closed;
  const pending = o.itemList.filter((i) => i.status === "pending").length;
  const [docs, technicians, cat, equipment] = await Promise.all([
    listDocuments(ctx, "work_order", id),
    canManage ? listTechnicians(ctx, { activeOnly: true }) : Promise.resolve([]),
    canManage ? catalog(ctx) : Promise.resolve(null),
    canManage ? listEquipment(ctx, { installationId: o.installationId, status: "in_service", page: 1, pageSize: 500 }) : Promise.resolve(null),
  ]);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.installationAddress)}`;
  const msg = param(sp.estado);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/app/ordenes-trabajo", label: "Órdenes de trabajo" }}
        title={<span className="font-mono">{o.number}</span>}
        badge={<WorkOrderStatusBadge status={o.status} />}
        subtitle={`${SERVICE_TYPE_LABELS[o.serviceType as keyof typeof SERVICE_TYPE_LABELS] ?? o.serviceType} · ${o.itemsDone}/${o.items} equipos con resultado`}
      />
      {caps.readOnly ? <ReadOnlyNotice /> : null}
      {param(sp.creada) ? <Alert tone="success">Orden creada{o.technicianName ? ` y asignada a ${o.technicianName}` : ""}.</Alert> : null}
      {param(sp.guardada) ? <Alert tone="success">Cambios guardados.</Alert> : null}
      {msg && msg in WORK_ORDER_STATUS_LABELS ? <Alert tone="success">Estado: {WORK_ORDER_STATUS_LABELS[msg as WorkOrderStatus]}.</Alert> : null}
      {param(sp.registrado) ? <Alert tone="success">Resultado guardado en el historial del equipo.</Alert> : null}

      <Section title="Visita">
        <Facts
          items={[
            ["Cliente", <Link key="c" href={`/app/clientes/${o.customerId}`} className="text-[var(--accent)]">{o.customerName}</Link>],
            ["Instalación", <Link key="i" href={`/app/instalaciones/${o.installationId}`} className="text-[var(--accent)]">{o.installationName}</Link>],
            ["Dirección", <a key="a" href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)]">{o.installationAddress} ↗</a>],
            ["Fecha", o.scheduledFor ? `${formatDate(o.scheduledFor)}${o.scheduledTime ? ` a las ${o.scheduledTime}` : ""}` : "Sin programar"],
            ["Técnico", o.technicianName ?? "Sin asignar"],
            ["Descripción", o.description],
            ["Notas internas", o.notes],
            ["Iniciada", o.startedAt ? formatDateTime(o.startedAt) : null],
            ["Finalizada", o.completedAt ? formatDateTime(o.completedAt) : null],
            ["Cancelada", o.canceledAt ? formatDateTime(o.canceledAt) : null],
            ["Notas de cierre", o.completionNotes],
          ]}
        />
        {!closed && (caps.workOrdersExecute || caps.workOrdersManage) ? (
          <div className="mt-5 border-t border-[var(--border)] pt-4">
            <WorkOrderStatusButtons id={o.id} status={o.status} canManage={caps.workOrdersManage} pendingItems={pending} />
            {o.status !== "in_progress" && pending > 0 ? <p className="mt-2 text-xs text-[var(--muted)]">Pulsa «Empezar el trabajo» al llegar a la instalación para poder registrar los resultados.</p> : null}
          </div>
        ) : null}
      </Section>

      <Section title={`Equipos (${o.items})`} id="equipos">
        {o.itemList.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">La orden no tiene equipos. {canManage ? "Añádelos abajo." : ""}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {o.itemList.map((it) => (
              <li key={it.id} className={`rounded-xl border p-3 ${it.status === "pending" ? "border-[var(--border)]" : "border-[var(--border)] bg-[var(--surface-2)]"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/app/equipos/${it.equipmentId}`} className="font-mono font-semibold text-[var(--accent)]">
                      {it.equipmentCode}
                    </Link>{" "}
                    <span className="text-sm">· {it.typeName ?? CATEGORY_SINGULAR[it.categoryCode as CategoryCode] ?? it.categoryCode}</span>
                    <p className="text-sm font-medium">{it.actionName}</p>
                    {it.location ? <p className="text-xs text-[var(--muted)]">{it.location}</p> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {it.status === "pending" ? <span className="text-xs text-[var(--muted)]">{ITEM_STATUS.pending}</span> : <ResultBadge result={it.result} />}
                    {canManage && it.status === "pending" ? <RemoveItemButton itemId={it.id} /> : null}
                  </div>
                </div>
                {it.observations ? <p className="mt-1 whitespace-pre-line text-sm">{it.observations}</p> : null}
                {it.status === "pending" && canExecute && o.status === "in_progress" ? (
                  <details className="mt-2" open={pending === 1}>
                    <summary className="cursor-pointer text-sm font-semibold text-[var(--accent)]">Registrar resultado</summary>
                    <div className="mt-3">
                      <ItemResultForm itemId={it.id} today={today} label={`${it.equipmentCode} · ${it.actionName}`} />
                    </div>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canManage && equipment && cat && equipment.rows.length ? (
          <details className="mt-4 rounded-xl border border-[var(--border)] p-3">
            <summary className="cursor-pointer text-sm font-medium">Añadir equipos de la instalación</summary>
            <div className="mt-3">
              <AddWorkOrderItemsForm
                id={o.id}
                equipment={equipment.rows.map((e) => ({ id: e.id, code: e.code, categoryCode: e.categoryCode, location: e.location }))}
                actions={cat.actions.map((a) => ({ id: a.id, name: a.name, categoryCode: a.categoryCode }))}
              />
            </div>
          </details>
        ) : null}
      </Section>

      {canExecute && caps.incidentsWrite ? (
        <div>
          <Link href={`/app/incidencias/nueva?instalacion=${o.installationId}&orden=${o.id}`} className={buttonClass("secondary")}>
            Registrar una incidencia
          </Link>
        </div>
      ) : null}

      <Section title="Fotos y documentos">
        <div className="flex flex-col gap-4">
          <DocumentList docs={docs.map((d) => ({ ...d, createdAt: formatDate(d.createdAt.toISOString().slice(0, 10)) }))} canDelete={caps.documentsDelete} />
          {caps.documentsUpload && !closed ? <DocumentUploader owner="work_order" ownerId={o.id} photos /> : null}
        </div>
      </Section>

      {canManage ? (
        <Section title="Planificación">
          <details>
            <summary className="cursor-pointer text-sm font-medium text-[var(--accent)]">Cambiar fecha, técnico o descripción</summary>
            <div className="mt-3">
              <WorkOrderEditForm order={o} technicians={technicians.map((t) => ({ id: t.id, fullName: t.fullName }))} />
            </div>
          </details>
        </Section>
      ) : null}

      <Section title="Seguimiento">
        <ol className="flex flex-col gap-2 text-sm">
          {o.events.map((ev, n) => (
            <li key={n} className="flex flex-col border-l-2 border-[var(--border)] pl-3">
              <span>
                <span className="font-medium">{EVENT_LABELS[ev.event] ?? ev.event}</span>
                {ev.toStatus ? ` · ${WORK_ORDER_STATUS_LABELS[ev.toStatus as WorkOrderStatus] ?? ev.toStatus}` : ""}
              </span>
              {ev.note ? <span className="whitespace-pre-line">{ev.note}</span> : null}
              <span className="text-xs text-[var(--muted)]">
                {formatDateTime(ev.at)}
                {ev.actor ? ` · ${ev.actor}` : ""}
              </span>
            </li>
          ))}
        </ol>
        {!closed && (caps.workOrdersExecute || caps.workOrdersManage) ? (
          <div className="mt-4">
            <WorkOrderNoteForm id={o.id} />
          </div>
        ) : null}
      </Section>
    </div>
  );
}
