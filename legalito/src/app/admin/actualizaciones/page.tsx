import { Alert, Badge } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { PageHeader, Panel } from "@/components/ui/layout";
import { ActionForm } from "@/components/admin/action-form";
import { fmtDate } from "@/components/app/status";
import { requireAdmin } from "@/lib/auth";
import { createSessionClient } from "@/lib/supabase/server";
import { createLegalUpdate, publishLegalUpdate } from "@/lib/actions/admin";
import { DOCUMENT_TYPES, documentTypeName } from "@/lib/documents/registry";

export default async function AdminLegalUpdatesPage() {
  await requireAdmin();
  const db = await createSessionClient();
  const { data: updates } = await db.from("legal_updates").select("*").order("created_at", { ascending: false });
  return (
    <>
      <PageHeader title="Actualizaciones legales" description="Comunicaciones a los clientes sobre cambios en las plantillas o en la normativa." />
      <Alert tone="warning" className="mb-6" title="Solo con revisión documentada">
        No se publica ninguna actualización sin una referencia de revisión y la persona que la ha realizado. La base de datos lo impide.
      </Alert>
      <div className="space-y-6">
        <Panel title="Nuevo borrador">
          <ActionForm action={createLegalUpdate} submitLabel="Crear borrador">
            <Field id="title" label="Título" required><Input id="title" name="title" /></Field>
            <Field id="summary" label="Resumen para el cliente" required><Textarea id="summary" name="summary" rows={2} /></Field>
            <Field id="body" label="Detalle"><Textarea id="body" name="body" rows={4} /></Field>
            <fieldset className="flex flex-wrap gap-4">
              <legend className="mb-2 text-sm font-medium text-ink">Documentos afectados</legend>
              {DOCUMENT_TYPES.map((d) => (
                <Checkbox key={d.code} name="document_types" value={d.code} label={d.name} />
              ))}
            </fieldset>
          </ActionForm>
        </Panel>
        {(updates ?? []).map((u) => (
          <Panel key={u.id} title={u.title} actions={<Badge tone={u.status === "published" ? "success" : "neutral"}>{u.status === "published" ? `Publicada ${fmtDate(u.published_at)}` : "Borrador"}</Badge>}>
            <p className="text-sm text-ink-soft">{u.summary}</p>
            {u.document_types?.length > 0 && <p className="mt-2 text-xs text-muted">Afecta a: {u.document_types.map(documentTypeName).join(", ")}</p>}
            {u.status === "published" ? (
              <p className="mt-3 text-xs text-muted">Revisión: {u.reviewed_by_name} · Ref. {u.review_reference}{u.notified_at ? ` · Avisos enviados ${fmtDate(u.notified_at, true)}` : ""}</p>
            ) : (
              <div className="mt-5 border-t border-line pt-5">
                <ActionForm action={publishLegalUpdate.bind(null, u.id)} submitLabel="Publicar">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field id={`rb-${u.id}`} label="Revisado por" required><Input id={`rb-${u.id}`} name="reviewed_by_name" /></Field>
                    <Field id={`rr-${u.id}`} label="Referencia de la revisión" required><Input id={`rr-${u.id}`} name="review_reference" /></Field>
                  </div>
                  <Checkbox name="notify" defaultChecked label="Avisar por email a los suscriptores que tienen activadas las actualizaciones" />
                </ActionForm>
              </div>
            )}
          </Panel>
        ))}
      </div>
    </>
  );
}
