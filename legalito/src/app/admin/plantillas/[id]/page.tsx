import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, PageHeader, Panel } from "@/components/ui/layout";
import { fmtDate } from "@/components/app/status";
import { TemplateStatusBadge } from "@/components/admin/template-status";
import { requireAdmin } from "@/lib/auth";
import { createSessionClient } from "@/lib/supabase/server";
import { createTemplateVersion } from "@/lib/actions/admin";

export default async function AdminTemplatePage({ params }: PageProps<"/admin/plantillas/[id]">) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await createSessionClient();
  const { data: template } = await db.from("templates").select("*").eq("id", id).maybeSingle();
  if (!template) notFound();
  const { data: versions } = await db.from("template_versions").select("*").eq("template_id", id).order("version_number", { ascending: false });
  const versionIds = (versions ?? []).map((v) => v.id);
  const { data: history } = await db
    .from("audit_logs")
    .select("*")
    .eq("entity_type", "template_version")
    .in("entity_id", versionIds.length ? versionIds : ["-"])
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <>
      <Link href="/admin/plantillas" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-navy">
        <ArrowLeft className="h-4 w-4" /> Plantillas
      </Link>
      <PageHeader
        title={template.name}
        description={`Tipo de documento: ${template.document_type} · Identificador: ${template.slug}`}
        actions={
          <form action={createTemplateVersion.bind(null, id)}>
            <Button type="submit"><Plus className="h-4 w-4" /> Nueva versión</Button>
          </form>
        }
      />
      <div className="space-y-6">
        <Panel title="Versiones">
          <DataTable headers={["Versión", "Estado", "Revisión jurídica", "Publicada", "Cambios"]}>
            {(versions ?? []).map((v) => (
              <tr key={v.id}>
                <td>
                  <Link href={`/admin/plantillas/${id}/${v.id}`} className="font-medium text-blue hover:underline">v{v.version_label}</Link>
                  {v.id === template.published_version_id && <span className="ml-2 text-xs text-success">● en producción</span>}
                </td>
                <td><TemplateStatusBadge status={v.status} demo={v.is_demo} /></td>
                <td className="text-muted">{v.legal_reviewer_name ? `${v.legal_reviewer_name} · ${fmtDate(v.legal_reviewed_at)} · ${v.review_reference}` : "—"}</td>
                <td className="text-muted">{fmtDate(v.published_at)}</td>
                <td className="max-w-xs truncate text-muted" title={v.changelog}>{v.changelog || "—"}</td>
              </tr>
            ))}
          </DataTable>
        </Panel>
        <Panel title="Historial de cambios">
          {(history ?? []).length === 0 ? (
            <p className="text-sm text-muted">Sin actividad registrada.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {history!.map((h) => (
                <li key={h.id} className="flex flex-wrap gap-x-3 text-muted">
                  <span className="tabular-nums">{fmtDate(h.created_at, true)}</span>
                  <span className="font-mono text-xs text-ink">{h.action}</span>
                  <span>v{versions?.find((v) => v.id === h.entity_id)?.version_label}</span>
                  {h.metadata?.reviewer && <span>· {String(h.metadata.reviewer)}</span>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
