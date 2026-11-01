import { Input } from "@/components/ui/field";
import { DataTable, PageHeader, Panel } from "@/components/ui/layout";
import { Badge } from "@/components/ui/feedback";
import { fmtDate } from "@/components/app/status";
import { requireAdmin } from "@/lib/auth";
import { createSessionClient } from "@/lib/supabase/server";

export default async function AdminAuditPage({ searchParams }: PageProps<"/admin/auditoria">) {
  await requireAdmin();
  const sp = await searchParams;
  const action = typeof sp.accion === "string" ? sp.accion.replace(/[^a-z_.]/g, "").slice(0, 60) : "";
  const db = await createSessionClient();
  let query = db.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200);
  if (action) query = query.ilike("action", `${action}%`);
  const { data: logs } = await query;
  return (
    <>
      <PageHeader title="Auditoría" description="Registro de operaciones relevantes (accesos, pagos, generación, cambios administrativos)." />
      <form className="mb-4 max-w-sm">
        <Input name="accion" defaultValue={action} placeholder="Filtrar por acción (p. ej. template_version)" aria-label="Filtrar por acción" />
      </form>
      <Panel>
        <DataTable headers={["Fecha", "Actor", "Acción", "Entidad", "Detalle"]}>
          {(logs ?? []).map((l) => (
            <tr key={l.id}>
              <td className="whitespace-nowrap text-muted">{fmtDate(l.created_at, true)}</td>
              <td><Badge>{l.actor_type}</Badge></td>
              <td className="font-mono text-xs">{l.action}</td>
              <td className="font-mono text-xs text-muted">{l.entity_type ? `${l.entity_type}:${String(l.entity_id ?? "").slice(0, 8)}` : "—"}</td>
              <td className="max-w-xs truncate text-xs text-muted" title={JSON.stringify(l.metadata)}>{Object.keys(l.metadata ?? {}).length ? JSON.stringify(l.metadata) : "—"}</td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </>
  );
}
