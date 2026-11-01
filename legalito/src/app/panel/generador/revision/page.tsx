import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, CircleAlert, Info, PencilLine } from "lucide-react";
import { Alert, Badge } from "@/components/ui/feedback";
import { LinkButton, Button } from "@/components/ui/button";
import { PageHeader, Panel } from "@/components/ui/layout";
import { GenerateButton } from "@/components/app/generate-button";
import { requireOrganization } from "@/lib/auth";
import { getFormStatus, getMyEntitlements } from "@/lib/data/panel";
import { editAnswers } from "@/lib/actions/forms";
import { prepareInput } from "@/lib/documents/compose";
import { STEPS, questionLabel, visibleQuestions, type Answers, type Question } from "@/lib/documents/questionnaire";
import { buildPreview } from "@/lib/documents/service";
import { DOCUMENT_TYPES } from "@/lib/documents/registry";
import { DocumentGenerationError } from "@/lib/documents/compose";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Revisión y vista previa" };

function formatAnswer(q: Question, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (q.type === "boolean") return value ? "Sí" : "No";
  if (q.type === "radio" || q.type === "select") return q.options?.find((o) => o.value === value)?.label ?? String(value);
  if (q.type === "multiselect" && Array.isArray(value)) return value.map((v) => q.options?.find((o) => o.value === v)?.label ?? v).join(", ");
  if (q.type === "repeater" && Array.isArray(value)) return value.length === 0 ? "—" : value.map((v) => Object.values(v as Record<string, string>)[0]).join(", ");
  return String(value);
}

export default async function ReviewPage({ searchParams }: PageProps<"/panel/generador/revision">) {
  await requireOrganization();
  const [form, ent, sp] = await Promise.all([getFormStatus(), getMyEntitlements(), searchParams]);
  if (!form.completed) redirect("/panel/generador");

  const prepared = prepareInput(form.completed.answers);
  const answers: Answers = prepared.validation.cleaned;
  const docType = DOCUMENT_TYPES.find((d) => d.code === sp.doc)?.code ?? "aviso_legal";

  let preview: Awaited<ReturnType<typeof buildPreview>> | null = null;
  let previewError: string | null = null;
  try {
    preview = await buildPreview(answers, docType);
  } catch (e) {
    previewError = e instanceof DocumentGenerationError ? e.message : "No hemos podido preparar la vista previa.";
  }

  return (
    <>
      <PageHeader
        title="Revisa tu información"
        description="Comprueba tus respuestas y la vista previa de tus documentos antes de continuar."
        actions={
          <form action={editAnswers.bind(null, undefined)}>
            <Button variant="secondary" type="submit">
              <PencilLine className="h-4 w-4" /> Editar respuestas
            </Button>
          </form>
        }
      />

      {form.draft && (
        <Alert tone="info" className="mb-6" title="Tienes cambios sin terminar">
          Has empezado a modificar tus respuestas. <Link href="/panel/generador">Continúa el formulario</Link> para aplicarlos.
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <Panel title="Vista previa" description="Se muestran completas las primeras secciones. El documento íntegro estará disponible al generarlo.">
            <div className="-mt-1 mb-5 flex gap-1 overflow-x-auto rounded-lg bg-sand/70 p-1" role="tablist" aria-label="Documento">
              {DOCUMENT_TYPES.map((d) => (
                <Link
                  key={d.code}
                  href={`/panel/generador/revision?doc=${d.code}`}
                  scroll={false}
                  role="tab"
                  aria-selected={d.code === docType}
                  className={cn("shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors", d.code === docType ? "bg-white font-medium text-navy shadow-sm" : "text-muted hover:text-navy")}
                >
                  {d.name}
                </Link>
              ))}
            </div>
            {previewError ? (
              <Alert tone="warning" title="Vista previa no disponible">
                {previewError}
              </Alert>
            ) : (
              <div className="relative max-h-[640px] overflow-y-auto rounded-xl border border-line bg-canvas px-5 py-6 sm:px-8" tabIndex={0} role="region" aria-label="Vista previa del documento">
                {preview?.isDemo && (
                  <Badge tone="warning" className="mb-4">
                    Plantilla de demostración
                  </Badge>
                )}
                <div className="legal-prose" dangerouslySetInnerHTML={{ __html: preview!.html }} />
              </div>
            )}
          </Panel>

          <Panel title="Tus respuestas">
            <div className="space-y-6">
              {STEPS.filter((s) => visibleQuestions(answers, s.id).length > 0).map((s) => (
                <div key={s.id}>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-navy">{s.title}</h3>
                    <form action={editAnswers.bind(null, s.id)}>
                      <button type="submit" className="text-sm text-link">
                        Editar<span className="sr-only"> {s.title}</span>
                      </button>
                    </form>
                  </div>
                  <dl className="mt-2 divide-y divide-line rounded-lg border border-line">
                    {visibleQuestions(answers, s.id).map((q) => (
                      <div key={q.id} className="grid gap-1 px-3.5 py-2.5 text-sm sm:grid-cols-[1fr_1.2fr] sm:gap-4">
                        <dt className="text-muted">{questionLabel(q, answers)}</dt>
                        <dd className="break-words text-ink">{formatAnswer(q, answers[q.id])}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <aside className="space-y-6 xl:sticky xl:top-8 xl:self-start">
          <Panel title="Siguiente paso">
            {ent.canGenerate ? (
              <div className="space-y-3">
                <p className="text-sm text-muted">
                  {ent.source?.type === "purchase" && ent.source.remaining !== null
                    ? `Tu compra incluye ${ent.source.remaining} generaciones disponibles.`
                    : "Tu suscripción te permite generar tus documentos cuando quieras."}
                </p>
                <GenerateButton />
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted">{ent.paymentIssue ? ent.blockedReason : "Elige cómo quieres obtener tus documentos para descargarlos en PDF y HTML."}</p>
                <LinkButton href={ent.paymentIssue ? "/panel/suscripcion" : "/panel/precompra"} className="w-full">
                  {ent.paymentIssue ? "Revisar el pago" : "Elegir modalidad"} <ArrowRight className="h-4 w-4" />
                </LinkButton>
              </div>
            )}
          </Panel>

          <Panel title="Qué más necesita tu web" description="Tus documentos no resuelven estas cuestiones por sí solos.">
            <ul className="space-y-4">
              {prepared.requirements.map((r) => (
                <li key={r.id} className="flex gap-3 text-sm">
                  {r.severity === "critical" ? (
                    <CircleAlert className="mt-0.5 h-4.5 w-4.5 shrink-0 text-danger" aria-label="Importante" />
                  ) : r.severity === "recommended" ? (
                    <AlertTriangle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-warning" aria-label="Recomendado" />
                  ) : (
                    <Info className="mt-0.5 h-4.5 w-4.5 shrink-0 text-blue" aria-label="Información" />
                  )}
                  <span>
                    <span className="block font-medium text-ink">{r.title}</span>
                    <span className="mt-0.5 block text-muted">{r.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </div>
    </>
  );
}
