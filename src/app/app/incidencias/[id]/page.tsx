import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ReadOnlyNotice } from "@/components/app/read-only-notice";
import { IncidentStatusBadge, SeverityBadge } from "@/components/pci/badges";
import {
  DocumentList,
  DocumentUploader,
  IncidentUpdateForm,
  Section,
  SendCustomerEmailButton,
} from "@/components/pci/forms";
import { Facts, PageHeader, UUID_RE } from "@/components/pci/page-parts";
import { Alert } from "@/components/ui/feedback";
import { formatDate } from "@/lib/dates";
import { param } from "@/lib/pagination";
import { capabilities } from "@/server/auth/capabilities";
import { requireOrgPage } from "@/server/auth/guards";
import { listDocuments } from "@/server/modules/documents/service";
import { getIncident } from "@/server/modules/incidents/service";
import { getInstallation } from "@/server/modules/installations/service";
import { emailHistory } from "@/server/modules/pci-notify/service";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Incidencia · RevisaYa" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function IncidentPage({ params, searchParams }: Props) {
  const ctx = await requireOrgPage("/app/incidencias");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!UUID_RE.test(id)) notFound();
  const i = await getIncident(ctx, id);
  if (!i) notFound();
  const caps = capabilities(ctx);
  const [docs, inst, emails] = await Promise.all([
    listDocuments(ctx, "incident", id),
    getInstallation(ctx, i.installationId),
    emailHistory(ctx, { incidentId: id }),
  ]);
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        back={{ href: "/app/incidencias", label: "Incidencias" }}
        title={i.title}
        badge={
          <span className="flex gap-1">
            <SeverityBadge severity={i.severity} />
            <IncidentStatusBadge status={i.status} />
          </span>
        }
      />
      {caps.readOnly ? <ReadOnlyNotice /> : null}
      {param(sp.creada) ? (
        <Alert tone="success">Incidencia registrada.</Alert>
      ) : null}
      {param(sp.guardada) ? (
        <Alert tone="success">Cambios guardados.</Alert>
      ) : null}
      <Section title="Detalle">
        <Facts
          items={[
            [
              "Instalación",
              <Link
                key="i"
                href={`/app/instalaciones/${i.installationId}`}
                className="text-[var(--accent)]"
              >
                {i.installationName}
              </Link>,
            ],
            ["Cliente", i.customerName],
            [
              "Equipo",
              i.equipmentId ? (
                <Link
                  key="e"
                  href={`/app/equipos/${i.equipmentId}`}
                  className="font-mono text-[var(--accent)]"
                >
                  {i.equipmentCode}
                </Link>
              ) : null,
            ],
            [
              "Orden de trabajo",
              i.workOrderId ? (
                <Link
                  key="o"
                  href={`/app/ordenes-trabajo/${i.workOrderId}`}
                  className="font-mono text-[var(--accent)]"
                >
                  {i.workOrderNumber}
                </Link>
              ) : null,
            ],
            ["Detectada", formatDate(i.detectedOn)],
            ["Resuelta", i.resolvedOn ? formatDate(i.resolvedOn) : null],
            [
              "Descripción",
              i.description ? (
                <span key="d" className="whitespace-pre-line font-normal">
                  {i.description}
                </span>
              ) : null,
            ],
            [
              "Resolución",
              i.resolution ? (
                <span key="r" className="whitespace-pre-line font-normal">
                  {i.resolution}
                </span>
              ) : null,
            ],
          ]}
        />
      </Section>
      {caps.incidentsWrite ? (
        <Section title="Seguimiento">
          <IncidentUpdateForm incident={i} />
        </Section>
      ) : null}
      {caps.incidentsWrite && !caps.readOnly ? (
        <Section title="Comunicar al cliente">
          <SendCustomerEmailButton
            kind="incident_detected"
            id={i.id}
            hasEmail={Boolean(inst?.customerEmail)}
            label="Enviar la incidencia al cliente"
            confirm={`¿Comunicar esta incidencia por correo a ${inst?.customerEmail ?? "el cliente"}?`}
          />
          {emails.length ? (
            <ul className="text-xs text-[var(--muted)]">
              {emails.map((e, n) => (
                <li key={n}>
                  {formatDateTime(e.sent_at ?? e.created_at)} · enviada a{" "}
                  {String(e.to_email)} ·{" "}
                  {e.status === "failed" ? "no se pudo enviar" : "enviado"}
                </li>
              ))}
            </ul>
          ) : null}
        </Section>
      ) : null}
      <Section title="Fotos y documentos">
        <div className="flex flex-col gap-4">
          <DocumentList
            docs={docs.map((d) => ({
              ...d,
              createdAt: formatDate(d.createdAt.toISOString().slice(0, 10)),
            }))}
            canDelete={caps.documentsDelete}
          />
          {caps.documentsUpload ? (
            <DocumentUploader owner="incident" ownerId={i.id} photos />
          ) : null}
        </div>
      </Section>
    </div>
  );
}
