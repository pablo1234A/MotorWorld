import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ReadOnlyNotice } from "@/components/app/read-only-notice";
import {
  Badge,
  DueBadge,
  EquipmentStatusBadge,
  IncidentStatusBadge,
  ResultBadge,
  SeverityBadge,
  WorkOrderStatusBadge,
} from "@/components/pci/badges";
import {
  DocumentList,
  DocumentUploader,
  Section,
  SendCustomerEmailButton,
} from "@/components/pci/forms";
import {
  DataTable,
  Facts,
  PageHeader,
  Td,
  UUID_RE,
} from "@/components/pci/page-parts";
import { buttonClass } from "@/components/ui/button-styles";
import { Alert } from "@/components/ui/feedback";
import { addDays, formatDate, todayIn } from "@/lib/dates";
import { param } from "@/lib/pagination";
import { CATEGORY_SINGULAR, ESTABLISHMENT_LABELS } from "@/lib/pci/labels";
import { formatPhone } from "@/lib/phone";
import { capabilities } from "@/server/auth/capabilities";
import { requireOrgPage } from "@/server/auth/guards";
import { listDocuments } from "@/server/modules/documents/service";
import { listEquipment } from "@/server/modules/equipment/service";
import { listIncidents } from "@/server/modules/incidents/service";
import { getInstallation } from "@/server/modules/installations/service";
import { listRecords } from "@/server/modules/maintenance/records";
import {
  dueItemsForInstallation,
  listWorkOrders,
} from "@/server/modules/work-orders/service";

export const metadata: Metadata = { title: "Instalación · RevisaYa" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InstallationPage({
  params,
  searchParams,
}: Props) {
  const ctx = await requireOrgPage("/app/instalaciones");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!UUID_RE.test(id)) notFound();
  const inst = await getInstallation(ctx, id);
  if (!inst) notFound();
  const today = todayIn();
  const [equipment, due, orders, incidents, records, docs] = await Promise.all([
    listEquipment(ctx, { installationId: id, page: 1, pageSize: 500 }),
    dueItemsForInstallation(ctx, id, addDays(today, 60)),
    listWorkOrders(ctx, { installationId: id, page: 1, pageSize: 10 }),
    listIncidents(ctx, {
      installationId: id,
      status: "open",
      page: 1,
      pageSize: 20,
    }),
    listRecords(ctx, { installationId: id, page: 1, pageSize: 10 }),
    listDocuments(ctx, "installation", id),
  ]);
  const caps = capabilities(ctx);
  const active = inst.status === "active";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/app/instalaciones", label: "Instalaciones" }}
        title={inst.name}
        badge={
          active ? (
            <Badge tone="ok">Activa</Badge>
          ) : (
            <Badge tone="neutral">Inactiva</Badge>
          )
        }
        subtitle={
          <>
            <Link
              href={`/app/clientes/${inst.customerId}`}
              className="text-[var(--accent)]"
            >
              {inst.customerName}
            </Link>{" "}
            ·{" "}
            {[inst.addressLine1, inst.postalCode, inst.city, inst.province]
              .filter(Boolean)
              .join(", ")}
          </>
        }
        actions={
          <>
            {caps.workOrdersManage && active ? (
              <Link
                href={`/app/ordenes-trabajo/nueva?instalacion=${inst.id}`}
                className={buttonClass("primary")}
              >
                Nueva orden de trabajo
              </Link>
            ) : null}
            {caps.equipmentWrite && active ? (
              <Link
                href={`/app/equipos/nuevo?instalacion=${inst.id}`}
                className={buttonClass("secondary")}
              >
                Añadir equipo
              </Link>
            ) : null}
            {equipment.total ? (
              <Link
                href={`/app/instalaciones/${inst.id}/etiquetas`}
                className={buttonClass("ghost")}
              >
                Etiquetas QR
              </Link>
            ) : null}
            {caps.installationsWrite ? (
              <Link
                href={`/app/instalaciones/${inst.id}/editar`}
                className={buttonClass("ghost")}
              >
                Editar
              </Link>
            ) : null}
          </>
        }
      />
      {caps.readOnly ? <ReadOnlyNotice /> : null}
      {param(sp.creada) ? (
        <Alert tone="success">
          Instalación creada. Ahora añade sus equipos.
        </Alert>
      ) : null}
      {param(sp.guardada) ? (
        <Alert tone="success">Cambios guardados.</Alert>
      ) : null}
      {param(sp.equipo_borrado) ? (
        <Alert tone="success">Equipo enviado a la papelera.</Alert>
      ) : null}

      <Section title="Datos">
        <Facts
          items={[
            [
              "Tipo de establecimiento",
              ESTABLISHMENT_LABELS[
                inst.establishmentType as keyof typeof ESTABLISHMENT_LABELS
              ] ?? inst.establishmentType,
            ],
            ["Responsable", inst.contactName],
            [
              "Teléfono",
              inst.contactPhone ? formatPhone(inst.contactPhone) : null,
            ],
            ["Correo", inst.contactEmail],
            ["Observaciones", inst.notes],
          ]}
        />
      </Section>

      <Section
        title={`Vencimientos de los próximos 60 días (${due.length})`}
        id="vencimientos"
      >
        {due.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            No hay actuaciones vencidas ni previstas en los próximos 60 días.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)] text-sm">
            {due.map((d) => (
              <li
                key={`${d.equipmentId}-${d.actionTypeId}`}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span>
                  <Link
                    href={`/app/equipos/${d.equipmentId}`}
                    className="font-mono font-medium text-[var(--accent)]"
                  >
                    {d.code}
                  </Link>{" "}
                  · {d.actionName}
                  {d.location ? (
                    <span className="text-[var(--muted)]"> · {d.location}</span>
                  ) : null}
                </span>
                <DueBadge date={d.nextDueOn} today={today} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Equipos (${equipment.total})`} id="equipos">
        {equipment.rows.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Todavía no hay equipos en esta instalación.
          </p>
        ) : (
          <DataTable
            head={[
              "Código",
              "Equipo",
              "Ubicación",
              "Última",
              "Próxima",
              "Estado",
            ]}
            minWidth="min-w-[760px]"
          >
            {equipment.rows.map((e) => (
              <tr key={e.id}>
                <Td>
                  <Link
                    href={`/app/equipos/${e.id}`}
                    className="font-mono font-medium text-[var(--accent)]"
                  >
                    {e.code}
                  </Link>
                </Td>
                <Td>
                  {CATEGORY_SINGULAR[e.categoryCode]}
                  {e.typeName ? (
                    <div className="text-xs text-[var(--muted)]">
                      {e.typeName}
                    </div>
                  ) : null}
                </Td>
                <Td>{e.location ?? "—"}</Td>
                <Td>{formatDate(e.lastActionOn)}</Td>
                <Td>
                  {e.status === "in_service" ? (
                    <DueBadge date={e.nextActionOn} today={today} />
                  ) : (
                    "—"
                  )}
                </Td>
                <Td>
                  <EquipmentStatusBadge status={e.status} />
                </Td>
              </tr>
            ))}
          </DataTable>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Órdenes de trabajo"
          actions={
            orders.total > orders.rows.length ? (
              <Link
                href={`/app/ordenes-trabajo?instalacion=${inst.id}&estado=todas`}
                className="text-sm text-[var(--accent)]"
              >
                Ver todas ({orders.total})
              </Link>
            ) : null
          }
        >
          {orders.rows.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Sin órdenes.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)] text-sm">
              {orders.rows.map((o) => (
                <li
                  key={o.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <Link
                    href={`/app/ordenes-trabajo/${o.id}`}
                    className="font-medium text-[var(--accent)]"
                  >
                    {o.number}
                  </Link>
                  <span className="text-[var(--muted)]">
                    {o.scheduledFor ? formatDate(o.scheduledFor) : "Sin fecha"}
                  </span>
                  <WorkOrderStatusBadge status={o.status} />
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section
          title={`Incidencias abiertas (${incidents.total})`}
          actions={
            caps.incidentsWrite && active ? (
              <Link
                href={`/app/incidencias/nueva?instalacion=${inst.id}`}
                className="text-sm font-medium text-[var(--accent)]"
              >
                Nueva incidencia
              </Link>
            ) : null
          }
        >
          {incidents.rows.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              Sin incidencias abiertas.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)] text-sm">
              {incidents.rows.map((x) => (
                <li
                  key={x.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <Link
                    href={`/app/incidencias/${x.id}`}
                    className="min-w-0 font-medium text-[var(--accent)]"
                  >
                    {x.title}
                    {x.equipmentCode ? (
                      <span className="font-mono text-xs text-[var(--muted)]">
                        {" "}
                        · {x.equipmentCode}
                      </span>
                    ) : null}
                  </Link>
                  <span className="flex gap-1">
                    <SeverityBadge severity={x.severity} />
                    <IncidentStatusBadge status={x.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section
        title="Últimas actuaciones"
        actions={
          <Link
            href={`/app/mantenimientos?instalacion=${inst.id}`}
            className="text-sm text-[var(--accent)]"
          >
            Historial completo
          </Link>
        }
      >
        {records.rows.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Todavía no hay actuaciones registradas.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)] text-sm">
            {records.rows.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span>
                  {formatDate(r.performedOn)} ·{" "}
                  <Link
                    href={`/app/equipos/${r.equipmentId}`}
                    className="font-mono text-[var(--accent)]"
                  >
                    {r.equipmentCode}
                  </Link>{" "}
                  · {r.actionName}
                </span>
                <ResultBadge result={r.result} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Estado de la instalación"
        actions={
          <a
            href={`/api/app/installations/${inst.id}/report`}
            target="_blank"
            rel="noopener"
            className="text-sm font-medium text-[var(--accent)]"
          >
            Descargar (PDF)
          </a>
        }
      >
        <p className="text-sm text-[var(--muted)]">
          Equipos, últimas y próximas actuaciones e incidencias abiertas, a día
          de hoy. No es un certificado oficial.
        </p>
        {caps.workOrdersManage && !caps.readOnly ? (
          <SendCustomerEmailButton
            kind="report_sent"
            id={inst.id}
            hasEmail={Boolean(inst.customerEmail)}
            label="Enviar al cliente"
            confirm={`¿Enviar el estado de la instalación en PDF a ${inst.customerEmail}?`}
          />
        ) : null}
      </Section>

      <Section title="Documentos y fotos">
        <div className="flex flex-col gap-4">
          <DocumentList
            docs={docs.map((d) => ({
              ...d,
              createdAt: formatDate(d.createdAt.toISOString().slice(0, 10)),
            }))}
            canDelete={caps.documentsDelete}
          />
          {caps.documentsUpload ? (
            <DocumentUploader owner="installation" ownerId={inst.id} photos />
          ) : null}
        </div>
      </Section>
    </div>
  );
}
