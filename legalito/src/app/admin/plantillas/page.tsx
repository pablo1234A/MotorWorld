import Link from "next/link";
import { Alert, Badge } from "@/components/ui/feedback";
import { DataTable, PageHeader, Panel } from "@/components/ui/layout";
import { fmtDate } from "@/components/app/status";
import { requireAdmin } from "@/lib/auth";
import { createSessionClient } from "@/lib/supabase/server";
import { TemplateStatusBadge } from "@/components/admin/template-status";

export default async function AdminTemplatesPage() {
  await requireAdmin();
  const db = await createSessionClient();
  const [{ data: templates }, { data: versions }] = await Promise.all([
    db.from("templates").select("*").order("document_type"),
    db.from("template_versions").select("id, template_id, version_label, status, is_demo, updated_at, version_number").order("version_number", { ascending: false }),
  ]);
  return (
    <>
      <PageHeader title="Plantillas" description="Cada plantilla tiene versiones inmutables tras enviarse a revisión. Solo las versiones aprobadas por un profesional pueden publicarse." />
      <Alert tone="info" className="mb-6" title="Flujo editorial">
        Borrador → En revisión → Aprobada (revisión jurídica documentada) → Publicada. Las versiones de demostración nunca pueden aprobarse.
      </Alert>
      <Panel>
        <DataTable headers={["Plantilla", "Tipo", "Versión publicada", "Última versión", "Actualizada"]}>
          {(templates ?? []).map((t) => {
            const vs = (versions ?? []).filter((v) => v.template_id === t.id);
            const pub = vs.find((v) => v.id === t.published_version_id);
            const last = vs[0];
            return (
              <tr key={t.id}>
                <td>
                  <Link href={`/admin/plantillas/${t.id}`} className="text-link">{t.name}</Link>
                </td>
                <td className="font-mono text-xs text-muted">{t.document_type}</td>
                <td>{pub ? <Badge tone="success">v{pub.version_label}</Badge> : <Badge tone="warning">Ninguna</Badge>}</td>
                <td>{last ? <span className="flex items-center gap-2">v{last.version_label} <TemplateStatusBadge status={last.status} demo={last.is_demo} /></span> : "—"}</td>
                <td className="text-muted">{fmtDate(last?.updated_at)}</td>
              </tr>
            );
          })}
        </DataTable>
      </Panel>
    </>
  );
}
