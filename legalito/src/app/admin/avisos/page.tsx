import { Badge } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { PageHeader, Panel } from "@/components/ui/layout";
import { ActionForm } from "@/components/admin/action-form";
import { fmtDate } from "@/components/app/status";
import { requireAdmin } from "@/lib/auth";
import { createSessionClient } from "@/lib/supabase/server";
import { createNotice, toggleNotice } from "@/lib/actions/admin";

export default async function AdminNoticesPage() {
  await requireAdmin();
  const db = await createSessionClient();
  const { data: notices } = await db.from("notices").select("*").order("created_at", { ascending: false });
  return (
    <>
      <PageHeader title="Avisos" description="Mensajes que se muestran en el panel de todos los clientes (incidencias, mantenimiento, novedades)." />
      <div className="space-y-6">
        <Panel title="Nuevo aviso">
          <ActionForm action={createNotice} submitLabel="Publicar aviso">
            <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
              <Field id="title" label="Título" required><Input id="title" name="title" /></Field>
              <Field id="level" label="Nivel" required>
                <Select id="level" name="level" defaultValue="info">
                  <option value="info">Información</option>
                  <option value="warning">Advertencia</option>
                  <option value="important">Importante</option>
                </Select>
              </Field>
              <Field id="ends_at" label="Visible hasta"><Input id="ends_at" name="ends_at" type="date" /></Field>
            </div>
            <Field id="body" label="Texto" required><Textarea id="body" name="body" rows={3} /></Field>
          </ActionForm>
        </Panel>
        <Panel title="Avisos">
          {(notices ?? []).length === 0 ? (
            <p className="text-sm text-muted">No hay avisos.</p>
          ) : (
            <ul className="divide-y divide-line">
              {notices!.map((n) => (
                <li key={n.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{n.title} <Badge tone={n.active ? "success" : "neutral"}>{n.active ? "Activo" : "Inactivo"}</Badge></p>
                    <p className="text-sm text-muted">{n.body}</p>
                    <p className="text-xs text-subtle">{fmtDate(n.created_at)}{n.ends_at ? ` · hasta ${fmtDate(n.ends_at)}` : ""}</p>
                  </div>
                  <form action={toggleNotice.bind(null, n.id, !n.active)}>
                    <Button type="submit" variant="secondary" size="sm">{n.active ? "Desactivar" : "Activar"}</Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
