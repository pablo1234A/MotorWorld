import { DataTable, PageHeader, Panel } from "@/components/ui/layout";
import { Badge } from "@/components/ui/feedback";
import { fmtDate } from "@/components/app/status";
import { requireAdmin } from "@/lib/auth";
import { createSessionClient } from "@/lib/supabase/server";
import { maskEmail } from "@/lib/mask";

export default async function AdminErrorsPage() {
  await requireAdmin();
  const db = await createSessionClient();
  const [{ data: errors }, { data: emails }] = await Promise.all([
    db.from("app_errors").select("*").order("created_at", { ascending: false }).limit(100),
    db.from("email_events").select("*").in("status", ["failed", "skipped"]).order("created_at", { ascending: false }).limit(50),
  ]);
  return (
    <>
      <PageHeader title="Errores" description="Errores de aplicación y envíos de email no completados." />
      <div className="space-y-6">
        <Panel title="Errores de aplicación">
          <DataTable headers={["Fecha", "Origen", "Mensaje", "Contexto"]}>
            {(errors ?? []).map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap text-muted">{fmtDate(e.created_at, true)}</td>
                <td><Badge>{e.source}</Badge></td>
                <td className="max-w-md text-danger">{e.message}</td>
                <td className="max-w-xs">
                  <details>
                    <summary className="cursor-pointer text-xs text-blue">Ver</summary>
                    <pre className="mt-2 max-h-48 overflow-auto rounded bg-sand p-2 text-[11px]">{JSON.stringify(e.context, null, 2)}</pre>
                  </details>
                </td>
              </tr>
            ))}
          </DataTable>
          {(errors ?? []).length === 0 && <p className="py-6 text-center text-sm text-muted">Sin errores registrados.</p>}
        </Panel>
        <Panel title="Emails no enviados">
          <DataTable headers={["Fecha", "Plantilla", "Destinatario", "Estado", "Motivo"]}>
            {(emails ?? []).map((e) => (
              <tr key={e.id}>
                <td className="text-muted">{fmtDate(e.created_at, true)}</td>
                <td>{e.template}</td>
                <td className="text-muted">{maskEmail(e.to_email)}</td>
                <td><Badge tone={e.status === "failed" ? "danger" : "warning"}>{e.status}</Badge></td>
                <td className="text-xs text-muted">{e.error}</td>
              </tr>
            ))}
          </DataTable>
          {(emails ?? []).length === 0 && <p className="py-6 text-center text-sm text-muted">Todos los emails se han enviado.</p>}
        </Panel>
      </div>
    </>
  );
}
