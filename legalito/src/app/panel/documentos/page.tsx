import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Download, FileCode2, FileText, Sparkles } from "lucide-react";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { LinkButton, buttonClass } from "@/components/ui/button";
import { PageHeader, Panel } from "@/components/ui/layout";
import { ReviewBadge, fmtDate } from "@/components/app/status";
import { GenerateButton } from "@/components/app/generate-button";
import { listDocuments, getMyEntitlements } from "@/lib/data/panel";
import { documentTypeName, DOCUMENT_TYPES } from "@/lib/documents/registry";

export const metadata: Metadata = { title: "Mis documentos" };

export default async function DocumentsPage({ searchParams }: PageProps<"/panel/documentos">) {
  const [docs, ent, sp] = await Promise.all([listDocuments(), getMyEntitlements(), searchParams]);
  const anyUpdate = docs.some((d) => d.updateAvailable);
  const anyDemo = docs.some((d) => d.current?.template?.is_demo);

  return (
    <>
      <PageHeader
        title="Mis documentos"
        description="Descarga tus documentos, consulta sus versiones y regenéralos cuando cambie tu negocio."
        actions={docs.length > 0 ? <LinkButton href="/panel/generador" variant="secondary">Actualizar respuestas</LinkButton> : undefined}
      />

      <div className="mb-6 space-y-3">
        {sp.generado && <Alert tone="success" title="Documentos generados">Ya puedes descargarlos. Revísalos antes de publicarlos en tu web.</Alert>}
        {anyDemo && (
          <Alert tone="warning" title="Documentos de demostración">
            Algunos documentos se han generado con plantillas de demostración pendientes de revisión jurídica. No tienen validez y no deben publicarse.
          </Alert>
        )}
        {anyUpdate && (
          <Alert tone="info" title="Hay una nueva versión revisada de las plantillas">
            {ent.source?.type === "subscription" ? "Regenera tus documentos para aplicar la versión más reciente." : "Las actualizaciones están incluidas en la suscripción."}
          </Alert>
        )}
      </div>

      {docs.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title="Todavía no has generado documentos"
          description="Completa el formulario, revisa la vista previa y elige tu modalidad para obtener tus documentos."
          action={<LinkButton href="/panel/generador">Ir al generador</LinkButton>}
        />
      ) : (
        <div className="space-y-4">
          {DOCUMENT_TYPES.map((t) => docs.find((d) => d.document_type === t.code))
            .filter((d): d is NonNullable<typeof d> => Boolean(d))
            .map((d) => {
              const v = d.current;
              const revoked = Boolean(v?.revoked_at);
              return (
                <article key={d.id} className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-soft)] sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold">{documentTypeName(d.document_type)}</h2>
                        <ReviewBadge template={v?.template ?? null} revoked={revoked} />
                        {d.updateAvailable && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-blue">
                            <Sparkles className="h-3.5 w-3.5" /> Actualización disponible
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted">
                        Versión {v?.version_number} · Generado el {fmtDate(v?.generated_at, true)} · Plantilla {v?.template?.version_label ?? "—"}
                      </p>
                      {revoked && <p className="mt-1 text-sm text-danger">{v?.revoked_reason}</p>}
                    </div>
                    <Link href={`/panel/documentos/${d.id}`} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-blue hover:underline">
                      Historial ({d.versionCount}) <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                  {v && !revoked && (
                    <div className="mt-5 flex flex-wrap gap-2.5 border-t border-line pt-5">
                      <a href={`/api/documentos/${v.id}/descargar?formato=pdf`} className={buttonClass("primary", "sm")}>
                        <Download className="h-4 w-4" /> Descargar PDF
                      </a>
                      <a href={`/api/documentos/${v.id}/descargar?formato=html`} className={buttonClass("secondary", "sm")}>
                        <FileCode2 className="h-4 w-4" /> Descargar HTML
                      </a>
                    </div>
                  )}
                </article>
              );
            })}
        </div>
      )}

      {docs.length > 0 && (
        <Panel className="mt-8" title="Regenerar documentos" description="Usa tus respuestas más recientes. Útil si has cambiado datos de tu negocio o si hay una nueva versión de las plantillas.">
          {ent.canGenerate ? (
            <GenerateButton label="Regenerar ahora" />
          ) : (
            <p className="text-sm text-muted">
              {ent.blockedReason}{" "}
              <Link href="/precios" className="font-medium text-blue hover:underline">
                Ver planes
              </Link>
            </p>
          )}
        </Panel>
      )}
    </>
  );
}
