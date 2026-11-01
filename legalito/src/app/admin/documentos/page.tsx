import { DataTable, PageHeader, Panel } from "@/components/ui/layout";
import { Badge } from "@/components/ui/feedback";
import { fmtDate } from "@/components/app/status";
import { requireAdmin } from "@/lib/auth";
import { createSessionClient } from "@/lib/supabase/server";
import { documentTypeName } from "@/lib/documents/registry";

/** Solo metadatos: el contenido de los documentos de los clientes no se expone en administración. */
export default async function AdminDocumentsPage() {
  await requireAdmin();
  const db = await createSessionClient();
  const [{ data: versions }, { data: orgs }, { data: tvs }] = await Promise.all([
    db.from("document_versions").select("id, organization_id, version_number, template_version_id, entitlement_source, is_demo, generated_at, revoked_at, documents!document_versions_document_id_fkey(document_type)").order("generated_at", { ascending: false }).limit(200),
    db.from("organizations").select("id, legal_name"),
    db.from("template_versions").select("id, version_label"),
  ]);
  return (
    <>
      <PageHeader title="Documentos generados" description="Registro de generación con la versión de plantilla utilizada. No se muestra el contenido." />
      <Panel>
        <DataTable headers={["Fecha", "Cliente", "Documento", "Versión", "Plantilla", "Origen", "Estado"]}>
          {(versions ?? []).map((v) => (
            <tr key={v.id}>
              <td className="text-muted">{fmtDate(v.generated_at, true)}</td>
              <td>{orgs?.find((o) => o.id === v.organization_id)?.legal_name ?? "—"}</td>
              <td>{documentTypeName((v.documents as unknown as { document_type: string }).document_type)}</td>
              <td>v{v.version_number}</td>
              <td className="text-muted">{tvs?.find((t) => t.id === v.template_version_id)?.version_label ?? "—"}</td>
              <td className="text-muted">{v.entitlement_source === "subscription" ? "Suscripción" : "Pago único"}</td>
              <td>{v.revoked_at ? <Badge tone="danger">Revocado</Badge> : v.is_demo ? <Badge tone="warning">Demo</Badge> : <Badge tone="success">Válido</Badge>}</td>
            </tr>
          ))}
        </DataTable>
        {(versions ?? []).length === 0 && <p className="py-6 text-center text-sm text-muted">Todavía no se han generado documentos.</p>}
      </Panel>
    </>
  );
}
