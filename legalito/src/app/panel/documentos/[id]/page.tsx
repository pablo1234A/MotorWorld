import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/feedback";
import { PageHeader, Panel, DataTable } from "@/components/ui/layout";
import { ReviewBadge, fmtDate } from "@/components/app/status";
import { getDocumentWithVersions } from "@/lib/data/panel";
import { documentTypeName } from "@/lib/documents/registry";

export const metadata: Metadata = { title: "Historial del documento" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function DocumentDetailPage({ params }: PageProps<"/panel/documentos/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const data = await getDocumentWithVersions(id);
  if (!data) notFound();
  const { doc, versions, publishedVersionId } = data;
  const current = versions.find((v) => v.id === doc.current_version_id);

  return (
    <>
      <Link href="/panel/documentos" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-navy">
        <ArrowLeft className="h-4 w-4" /> Mis documentos
      </Link>
      <PageHeader title={documentTypeName(doc.document_type)} description="Historial de versiones generadas y estado de revisión de cada plantilla." />

      {current?.template && (
        <Panel title="Estado de revisión" className="mb-6">
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted">Plantilla utilizada</dt>
              <dd className="mt-1 font-medium text-ink">Versión {current.template.version_label}</dd>
            </div>
            <div>
              <dt className="text-muted">Revisión jurídica</dt>
              <dd className="mt-1 text-ink">
                {current.template.is_demo
                  ? "Plantilla de demostración, sin revisión"
                  : current.template.legal_reviewed_at
                    ? `${current.template.legal_reviewer_name ?? "Profesional"} · ${fmtDate(current.template.legal_reviewed_at)}`
                    : "Pendiente"}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Versión más reciente</dt>
              <dd className="mt-1 text-ink">{publishedVersionId && publishedVersionId !== current.template_version_id ? <Badge tone="info">Hay una versión nueva</Badge> : "Estás al día"}</dd>
            </div>
          </dl>
        </Panel>
      )}

      <Panel title="Versiones">
        <DataTable headers={["Versión", "Generado", "Plantilla", "Estado", "Descargas"]}>
          {versions.map((v) => (
            <tr key={v.id}>
              <td className="font-medium text-ink">
                v{v.version_number} {v.id === doc.current_version_id && <Badge tone="info" className="ml-1">Actual</Badge>}
              </td>
              <td className="text-muted">{fmtDate(v.generated_at, true)}</td>
              <td className="text-muted">{v.template?.version_label ?? "—"}</td>
              <td>
                <ReviewBadge template={v.template} revoked={Boolean(v.revoked_at)} />
              </td>
              <td>
                {v.revoked_at ? (
                  <span className="text-muted">—</span>
                ) : (
                  <span className="flex gap-3">
                    <a href={`/api/documentos/${v.id}/descargar?formato=pdf`} className="text-link">PDF</a>
                    <a href={`/api/documentos/${v.id}/descargar?formato=html`} className="text-link">HTML</a>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </>
  );
}
