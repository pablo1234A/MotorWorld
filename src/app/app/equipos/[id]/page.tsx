import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";

import { ReadOnlyNotice } from "@/components/app/read-only-notice";
import { DueBadge, EquipmentStatusBadge, IncidentStatusBadge, ResultBadge, SeverityBadge } from "@/components/pci/badges";
import { AmendRecordForm, DocumentList, DocumentUploader, RecordForm, Section, VoidRecordForm } from "@/components/pci/forms";
import { Facts, PageHeader, UUID_RE } from "@/components/pci/page-parts";
import { buttonClass } from "@/components/ui/button-styles";
import { Alert } from "@/components/ui/feedback";
import { Pagination } from "@/components/ui/pagination";
import { formatDate, formatDateTime, todayIn } from "@/lib/dates";
import { param, parsePage } from "@/lib/pagination";
import { ACTION_KIND_LABELS, AGENT_LABELS, CATEGORY_SINGULAR, MOBILITY_LABELS } from "@/lib/pci/labels";
import { capabilities } from "@/server/auth/capabilities";
import { requireOrgPage } from "@/server/auth/guards";
import { getServerEnv } from "@/server/env";
import { listDocuments } from "@/server/modules/documents/service";
import { catalog, getEquipment } from "@/server/modules/equipment/service";
import { listIncidents } from "@/server/modules/incidents/service";
import { listRecords } from "@/server/modules/maintenance/records";
import { listTechnicians } from "@/server/modules/technicians/service";

export const metadata: Metadata = { title: "Equipo · RevisaYa" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function EquipmentPage({ params, searchParams }: Props) {
  const ctx = await requireOrgPage("/app/equipos");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!UUID_RE.test(id)) notFound();
  const e = await getEquipment(ctx, id);
  if (!e) notFound();
  const caps = capabilities(ctx);
  const today = todayIn();
  const page = parsePage(param(sp.pagina));
  const [records, incidents, docs, cat, technicians] = await Promise.all([
    listRecords(ctx, { equipmentId: id, includeVoided: true, page, pageSize: 20 }),
    listIncidents(ctx, { equipmentId: id, status: "all", page: 1, pageSize: 20 }),
    listDocuments(ctx, "equipment", id),
    caps.recordsWrite ? catalog(ctx) : Promise.resolve(null),
    caps.recordsWrite ? listTechnicians(ctx, { activeOnly: true }) : Promise.resolve([]),
  ]);
  const actions = (cat?.actions ?? [])
    .filter((a) => a.categoryCode === e.categoryCode || a.categoryCode === null)
    .sort((a, b) => Number(b.enabled) - Number(a.enabled) || (a.categoryCode === null ? 1 : 0) - (b.categoryCode === null ? 1 : 0))
    .map((a) => ({ id: a.id, categoryCode: a.categoryCode, name: `${a.name}${a.intervalMonths ? ` (cada ${a.intervalMonths} meses)` : ""}${a.performedBy === "owner" ? " · titular" : ""}` }));
  const qrUrl = `${getServerEnv().APP_URL.replace(/\/$/, "")}/app/equipos/qr/${e.qrToken}`;
  const qrSvg = await QRCode.toString(qrUrl, { type: "svg", margin: 1 });
  const x = e.extinguisher;
  const canRecord = caps.recordsWrite && e.status !== "retired";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: `/app/instalaciones/${e.installationId}`, label: e.installationName }}
        title={<span className="font-mono">{e.code}</span>}
        badge={<EquipmentStatusBadge status={e.status} />}
        subtitle={
          <>
            {e.typeName ?? CATEGORY_SINGULAR[e.categoryCode]}
            {e.location ? ` · ${e.location}` : ""} ·{" "}
            <Link href={`/app/clientes/${e.customerId}`} className="text-[var(--accent)]">
              {e.customerName}
            </Link>
          </>
        }
        actions={
          <>
            {canRecord ? (
              <a href="#registrar" className={buttonClass("primary")}>
                Registrar actuación
              </a>
            ) : null}
            {caps.incidentsWrite && e.status !== "retired" ? (
              <Link href={`/app/incidencias/nueva?instalacion=${e.installationId}&equipo=${e.id}`} className={buttonClass("secondary")}>
                Incidencia
              </Link>
            ) : null}
            {caps.equipmentWrite ? (
              <Link href={`/app/equipos/${e.id}/editar`} className={buttonClass("ghost")}>
                Editar
              </Link>
            ) : null}
          </>
        }
      />
      {caps.readOnly ? <ReadOnlyNotice /> : null}
      {param(sp.creado) ? <Alert tone="success">Equipo dado de alta. Sus vencimientos se calculan con las actuaciones que registres.</Alert> : null}
      {param(sp.guardado) ? <Alert tone="success">Cambios guardados.</Alert> : null}
      {param(sp.actuacion) ? <Alert tone="success">Actuación registrada. Los próximos vencimientos se han recalculado.</Alert> : null}
      {param(sp.corregida) ? <Alert tone="success">Corrección guardada. Queda constancia del motivo y del valor anterior en la auditoría.</Alert> : null}
      {param(sp.anulada) ? <Alert tone="success">Actuación anulada. Sigue en el historial, marcada como anulada.</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
        <Section title="Datos del equipo">
          <Facts
            items={[
              ["Tipo", e.typeName ?? CATEGORY_SINGULAR[e.categoryCode]],
              ["Fabricante", e.manufacturer],
              ["Modelo", e.model],
              ["Nº de serie", e.serialNumber],
              ["Ubicación", e.location],
              ["Fecha de fabricación", e.manufacturedOn ? formatDate(e.manufacturedOn) : null],
              ["Fecha de instalación", e.installedOn ? formatDate(e.installedOn) : null],
              ["Última actuación", e.lastActionOn ? formatDate(e.lastActionOn) : null],
              ["Observaciones", e.notes],
            ]}
          />
          {x ? (
            <div className="mt-5 border-t border-[var(--border)] pt-4">
              <h3 className="mb-3 text-sm font-semibold">Extintor</h3>
              <Facts
                items={[
                  ["Agente extintor", AGENT_LABELS[x.agent as keyof typeof AGENT_LABELS] ?? x.agent],
                  ["Carga", x.chargeValue !== null ? `${x.chargeValue.toLocaleString("es-ES")} ${x.chargeUnit ?? ""}` : null],
                  ["Eficacia", x.efficacy],
                  ["Tipo", MOBILITY_LABELS[x.mobility as keyof typeof MOBILITY_LABELS] ?? x.mobility],
                  ["Fecha de timbrado", x.stampedOn ? formatDate(x.stampedOn) : null],
                  ["Puesta en servicio", x.putInServiceOn ? formatDate(x.putInServiceOn) : null],
                  ["Retimbrados anteriores al alta", String(x.retimbradosBefore)],
                  ["Vida útil por retimbrados (derivada)", x.retimbradoLimitOn ? formatDate(x.retimbradoLimitOn) : null],
                ]}
              />
              {x.retimbradoLimitOn ? (
                <p className="mt-3 text-xs text-[var(--muted)]">
                  Calculada como fecha de timbrado + 20 años (3 retimbrados de 5 años; RIPCI, anexo II, tabla II). Es orientativa: revisa siempre la placa y la documentación del fabricante.
                </p>
              ) : null}
            </div>
          ) : null}
        </Section>
        <Section title="Etiqueta QR">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="w-40 rounded bg-white p-1" aria-hidden dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <p className="text-xs text-[var(--muted)]">Abre esta ficha tras iniciar sesión. No contiene datos del cliente.</p>
            <Link href={`/app/instalaciones/${e.installationId}/etiquetas`} className="text-sm text-[var(--accent)]">
              Imprimir etiquetas de la instalación
            </Link>
          </div>
        </Section>
      </div>

      <Section title="Mantenimiento programado" id="programa">
        {e.schedules.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            No hay operaciones periódicas activas para este tipo de equipo. Un administrador puede activarlas en Configuración → Mantenimiento.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)] text-sm">
            {e.schedules.map((s) => (
              <li key={s.actionTypeId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{s.actionName}</span>
                  <span className="text-[var(--muted)]">
                    {s.intervalMonths ? ` · cada ${s.intervalMonths} meses` : ""}
                    {s.lastDoneOn ? ` · última ${formatDate(s.lastDoneOn)}` : " · sin registrar"}
                    {s.retimbradosDone !== null ? ` · retimbrados: ${s.retimbradosDone}` : ""}
                  </span>
                  {s.legalReference ? <span className="block text-xs text-[var(--muted)]">{s.legalReference}</span> : null}
                </span>
                {e.status === "in_service" ? <DueBadge date={s.nextDueOn} today={today} /> : null}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-[var(--muted)]">
          Las periodicidades proceden del RIPCI (RD 513/2017) y de la configuración de tu empresa. RevisaYa ayuda a planificar, pero no certifica el cumplimiento normativo.
        </p>
      </Section>

      {canRecord ? (
        <Section title="Registrar actuación" id="registrar">
          <RecordForm equipmentId={e.id} actions={actions} technicians={technicians.map((t) => ({ id: t.id, fullName: t.fullName }))} today={today} />
        </Section>
      ) : null}

      <Section title={`Historial de actuaciones (${records.total})`} id="historial">
        {records.rows.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Todavía no hay actuaciones registradas.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-[var(--border)] text-sm">
            {records.rows.map((r) => (
              <li key={r.id} className={`flex flex-col gap-1 py-3 ${r.voidedAt ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={r.voidedAt ? "line-through" : ""}>
                    <span className="font-medium">{formatDate(r.performedOn)}</span> · {r.actionName}
                    <span className="text-[var(--muted)]"> · {ACTION_KIND_LABELS[r.actionKind as keyof typeof ACTION_KIND_LABELS] ?? r.actionKind}</span>
                  </span>
                  <ResultBadge result={r.result} />
                </div>
                <p className="text-[var(--muted)]">
                  {r.technicianName ? `Técnico: ${r.technicianName}` : "Sin técnico indicado"}
                  {r.workOrderId ? (
                    <>
                      {" · "}
                      <Link href={`/app/ordenes-trabajo/${r.workOrderId}`} className="text-[var(--accent)]">
                        {r.workOrderNumber}
                      </Link>
                    </>
                  ) : null}
                  {r.nextActionRecommendedOn ? ` · próxima recomendada ${formatDate(r.nextActionRecommendedOn)}` : ""}
                </p>
                {r.observations ? <p className="whitespace-pre-line">{r.observations}</p> : null}
                {r.materials.length ? (
                  <p className="text-xs text-[var(--muted)]">
                    Materiales: {r.materials.map((m) => `${m.description}${m.reference ? ` (${m.reference})` : ""} × ${m.quantity.toLocaleString("es-ES")}${m.unit ? ` ${m.unit}` : ""}`).join("; ")}
                  </p>
                ) : null}
                {r.amendedAt ? <p className="text-xs text-[var(--muted)]">Corregida el {formatDateTime(r.amendedAt)}: {r.amendmentReason}</p> : null}
                {r.voidedAt ? <p className="text-xs font-medium text-[var(--danger)]">Anulada el {formatDateTime(r.voidedAt)}: {r.voidReason}</p> : null}
                {!r.voidedAt && (caps.recordsWrite || caps.maintenanceDelete) ? (
                  <div className="flex flex-wrap gap-4">
                    {caps.recordsWrite ? (
                      <details className="text-sm">
                        <summary className="cursor-pointer text-[var(--accent)]">Corregir</summary>
                        <div className="mt-2 max-w-xl">
                          <AmendRecordForm record={r} />
                        </div>
                      </details>
                    ) : null}
                    {caps.maintenanceDelete ? (
                      <details className="text-sm">
                        <summary className="cursor-pointer text-[var(--danger)]">Anular</summary>
                        <div className="mt-2 max-w-xl">
                          <VoidRecordForm id={r.id} />
                        </div>
                      </details>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
        <Pagination page={records} basePath={`/app/equipos/${e.id}`} params={{}} />
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={`Incidencias (${incidents.total})`}>
          {incidents.rows.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Sin incidencias.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)] text-sm">
              {incidents.rows.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/app/incidencias/${i.id}`} className="font-medium text-[var(--accent)]">
                    {i.title}
                  </Link>
                  <span className="flex gap-1">
                    <SeverityBadge severity={i.severity} />
                    <IncidentStatusBadge status={i.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Documentos y fotos">
          <div className="flex flex-col gap-4">
            <DocumentList docs={docs.map((d) => ({ ...d, createdAt: formatDate(d.createdAt.toISOString().slice(0, 10)) }))} canDelete={caps.documentsDelete} />
            {caps.documentsUpload ? <DocumentUploader owner="equipment" ownerId={e.id} photos /> : null}
          </div>
        </Section>
      </div>
    </div>
  );
}
