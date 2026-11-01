import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Alert, Badge } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { PageHeader, Panel } from "@/components/ui/layout";
import { ActionForm } from "@/components/admin/action-form";
import { TemplateStatusBadge } from "@/components/admin/template-status";
import { fmtDate } from "@/components/app/status";
import { requireAdmin } from "@/lib/auth";
import { createSessionClient } from "@/lib/supabase/server";
import { approveTemplateVersion, publishTemplateVersion, returnToDraft, saveTemplateVersion, submitTemplateVersion } from "@/lib/actions/admin";
import { templateContentSchema, renderTemplate } from "@/lib/documents/engine";
import { buildContext } from "@/lib/documents/context";
import { validateAnswers } from "@/lib/documents/questionnaire";
import { renderHtmlFragment } from "@/lib/documents/html";
import { freelancerAnswers, shopAnswers } from "@/lib/documents/samples";
import { cn } from "@/lib/cn";

const SAMPLES = { tienda: { label: "Tienda online (S.L.)", answers: shopAnswers }, autonomo: { label: "Autónomo sin datos", answers: freelancerAnswers } };

export default async function AdminTemplateVersionPage({ params, searchParams }: PageProps<"/admin/plantillas/[id]/[versionId]">) {
  await requireAdmin();
  const { id, versionId } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(versionId)) notFound();
  const db = await createSessionClient();
  const { data: v } = await db.from("template_versions").select("*").eq("id", versionId).eq("template_id", id).maybeSingle();
  if (!v) notFound();

  const sampleKey = sp.ejemplo === "autonomo" ? "autonomo" : "tienda";
  const parsed = templateContentSchema.safeParse(v.content);
  let previewHtml = "";
  let missing: string[] = [];
  if (parsed.success) {
    const ctx = buildContext(validateAnswers(SAMPLES[sampleKey].answers).cleaned);
    const r = renderTemplate(parsed.data, ctx);
    missing = r.missing;
    previewHtml = renderHtmlFragment(r.document, { documentTypeName: "", ownerName: "", generatedAt: new Date(v.updated_at), templateVersionLabel: v.version_label, isDemo: v.is_demo, isPreview: !v.is_demo });
  }
  const editable = v.status === "draft";

  return (
    <>
      <Link href={`/admin/plantillas/${id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-navy">
        <ArrowLeft className="h-4 w-4" /> Versiones
      </Link>
      <PageHeader title={`Versión ${v.version_label}`} description={`Creada el ${fmtDate(v.created_at, true)}`} actions={<TemplateStatusBadge status={v.status} demo={v.is_demo} />} />

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          {editable ? (
            <Panel title="Editar borrador" description="El contenido es JSON con secciones, bloques, variables {{ruta}} y condiciones `when`. Ver docs/TEMPLATES.md.">
              <ActionForm action={saveTemplateVersion.bind(null, versionId)} submitLabel="Guardar borrador">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="version_label" label="Versión" required>
                    <Input id="version_label" name="version_label" defaultValue={v.version_label} />
                  </Field>
                </div>
                <Field id="changelog" label="Cambios respecto a la versión anterior" required>
                  <Textarea id="changelog" name="changelog" defaultValue={v.changelog} rows={3} />
                </Field>
                <Field id="content" label="Contenido (JSON)" required>
                  <Textarea id="content" name="content" defaultValue={JSON.stringify(v.content, null, 2)} rows={24} className="font-mono text-[12.5px] leading-snug" spellCheck={false} />
                </Field>
              </ActionForm>
              <form action={submitTemplateVersion.bind(null, versionId)} className="mt-6 border-t border-line pt-6">
                <p className="mb-3 text-sm text-muted">Al enviar a revisión el contenido queda congelado. Si hay cambios, la revisión debe devolverla a borrador.</p>
                <Button type="submit" variant="secondary" disabled={!parsed.success}>Enviar a revisión jurídica</Button>
              </form>
            </Panel>
          ) : (
            <Panel title="Contenido" description="Inmutable: para cambiarlo crea una nueva versión.">
              <pre className="max-h-[480px] overflow-auto rounded-lg bg-sand/60 p-3 text-[12px] leading-snug">{JSON.stringify(v.content, null, 2)}</pre>
              {v.changelog && <p className="mt-4 text-sm text-muted"><strong className="text-ink">Cambios:</strong> {v.changelog}</p>}
            </Panel>
          )}

          {v.status === "in_review" && (
            <Panel title="Aprobación jurídica" description="Registra la revisión realizada por un profesional del derecho. Sin estos datos la base de datos impide aprobar.">
              {v.is_demo ? (
                <Alert tone="warning">Las versiones de demostración no pueden aprobarse. Crea una nueva versión a partir de esta y sométela a revisión.</Alert>
              ) : (
                <ActionForm action={approveTemplateVersion.bind(null, versionId)} submitLabel="Registrar aprobación">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field id="reviewer_name" label="Profesional revisor" required><Input id="reviewer_name" name="reviewer_name" /></Field>
                    <Field id="reviewer_credentials" label="Colegio y n.º de colegiado"><Input id="reviewer_credentials" name="reviewer_credentials" /></Field>
                    <Field id="reviewed_at" label="Fecha de revisión" required><Input id="reviewed_at" name="reviewed_at" type="date" /></Field>
                    <Field id="review_reference" label="Referencia del informe" required><Input id="review_reference" name="review_reference" placeholder="INF-2026-001" /></Field>
                  </div>
                  <Field id="review_notes" label="Observaciones"><Textarea id="review_notes" name="review_notes" rows={3} /></Field>
                  <Checkbox name="attest" label="Confirmo que existe una revisión jurídica documentada de esta versión exacta y que se conserva el informe." />
                </ActionForm>
              )}
              <form action={returnToDraft.bind(null, versionId)} className="mt-4">
                <Button type="submit" variant="ghost" size="sm">Devolver a borrador</Button>
              </form>
            </Panel>
          )}

          {v.status === "approved" && (
            <Panel title="Publicación">
              <p className="mb-4 text-sm text-muted">Revisada por {v.legal_reviewer_name} ({v.legal_reviewer_credentials ?? "sin credenciales indicadas"}) el {fmtDate(v.legal_reviewed_at)} · Ref. {v.review_reference}.</p>
              <form action={publishTemplateVersion.bind(null, versionId)}>
                <Button type="submit">Publicar en producción</Button>
              </form>
              <p className="mt-3 text-xs text-subtle">La versión publicada anterior pasará a retirada. Después puedes crear una actualización legal para avisar a los suscriptores.</p>
            </Panel>
          )}

          {["published", "retired"].includes(v.status) && v.legal_reviewer_name && (
            <Panel title="Revisión">
              <p className="text-sm text-muted">{v.legal_reviewer_name} · {fmtDate(v.legal_reviewed_at)} · Ref. {v.review_reference}</p>
              {v.review_notes && <p className="mt-2 text-sm text-muted">{v.review_notes}</p>}
            </Panel>
          )}
        </div>

        <Panel
          title="Vista previa con datos ficticios"
          actions={
            <div className="flex gap-1 rounded-lg bg-sand/70 p-0.5">
              {(Object.keys(SAMPLES) as (keyof typeof SAMPLES)[]).map((k) => (
                <Link key={k} href={`?ejemplo=${k}`} scroll={false} className={cn("rounded-md px-2.5 py-1 text-xs", k === sampleKey ? "bg-white font-medium text-navy shadow-sm" : "text-muted")}>
                  {SAMPLES[k].label}
                </Link>
              ))}
            </div>
          }
        >
          {!parsed.success ? (
            <Alert tone="danger" title="La plantilla no cumple el esquema">{parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join(" · ")}</Alert>
          ) : (
            <>
              {missing.length > 0 && <Alert tone="warning" className="mb-4" title="Variables sin valor en este ejemplo">{missing.join(", ")}</Alert>}
              <div className="mb-3 flex flex-wrap gap-1.5">
                {(v.variables as { key: string }[]).map((x) => <Badge key={x.key}>{x.key}</Badge>)}
              </div>
              <div className="legal-prose max-h-[820px] overflow-y-auto rounded-xl border border-line bg-canvas px-5 py-6" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </>
          )}
        </Panel>
      </div>
    </>
  );
}
