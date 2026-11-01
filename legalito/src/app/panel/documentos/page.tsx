import type { Metadata } from "next";
import Link from "next/link";
import { Cookie, Download, FileCheck2, FileCode2, FileText, History, ShieldCheck, Sparkles } from "lucide-react";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { LinkButton, buttonClass } from "@/components/ui/button";
import { PageHeader, Panel } from "@/components/ui/layout";
import { ReviewBadge, fmtDate } from "@/components/app/status";
import { GenerateButton } from "@/components/app/generate-button";
import { CopyHtmlButton } from "@/components/app/copy-html-button";
import { PublishGuideList } from "@/components/app/publish-guide";
import { QuotaMeter } from "@/components/app/quota-meter";
import { listDocuments, getMyEntitlements } from "@/lib/data/panel";
import { documentTypeName, DOCUMENT_TYPES } from "@/lib/documents/registry";
import { requireOrganization } from "@/lib/auth";
import { accountLabel } from "@/lib/accounts";

export const metadata: Metadata = { title: "Mis documentos" };

const ICON = { aviso_legal: FileCheck2, privacidad: ShieldCheck, cookies: Cookie } as Record<string, typeof FileText>;

export default async function DocumentsPage({ searchParams }: PageProps<"/panel/documentos">) {
  const [docs, ent, sp, { org, account }] = await Promise.all([listDocuments(), getMyEntitlements(), searchParams, requireOrganization()]);
  const client = org.id !== account.root.id ? accountLabel(org) : null;
  const anyUpdate = docs.some((d) => d.updateAvailable);
  const anyDemo = docs.some((d) => d.current?.template?.is_demo);
  const ordered = DOCUMENT_TYPES.map((t) => docs.find((d) => d.document_type === t.code)).filter((d): d is NonNullable<typeof d> => Boolean(d));

  return (
    <>
      <PageHeader
        title={client ? `Documentos de ${client}` : "Mis documentos"}
        description={client ? "Descárgalos para entregárselos o copia el código HTML para publicarlos en su web." : "Descárgalos, copia el código para tu web y regenéralos cuando cambie tu negocio."}
        actions={docs.length > 0 ? <LinkButton href="/panel/generador" variant="secondary">Actualizar respuestas</LinkButton> : undefined}
      />

      <div className="mb-6 space-y-3">
        {sp.generado && <Alert tone="success" title="Documentos generados">Ya puedes descargarlos. Revísalos antes de publicarlos en tu web.</Alert>}
        {anyDemo && (
          <Alert tone="warning" title="Documentos de demostración">
            Se han generado con plantillas pendientes de revisión jurídica. No tienen validez y no deben publicarse.
          </Alert>
        )}
        {anyUpdate && (
          <Alert tone="info" title="Hay una nueva versión revisada de las plantillas">
            {ent.source?.type === "subscription" ? "Regenera tus documentos para aplicarla." : "Las nuevas versiones están incluidas en la suscripción."}
          </Alert>
        )}
      </div>

      {ordered.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title="Todavía no has generado documentos"
          description="Completa el formulario, revisa la vista previa y elige tu modalidad para obtener tus documentos."
          action={<LinkButton href="/panel/generador">Ir al generador</LinkButton>}
        />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-soft)]">
          {ordered.map((d) => {
            const v = d.current;
            const revoked = Boolean(v?.revoked_at);
            const Icon = ICON[d.document_type] ?? FileText;
            return (
              <li key={d.id} className="p-5 sm:p-6">
                <div className="flex gap-4">
                  <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue sm:flex">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <h2 className="text-[17px] font-semibold">{documentTypeName(d.document_type)}</h2>
                      <ReviewBadge template={v?.template ?? null} revoked={revoked} />
                      {d.updateAvailable && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-blue">
                          <Sparkles className="h-3.5 w-3.5" /> Nueva versión disponible
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      Versión {v?.version_number} · {fmtDate(v?.generated_at, true)} · Plantilla {v?.template?.version_label ?? "—"}
                    </p>
                    {revoked && <p className="mt-1 text-sm text-danger">{v?.revoked_reason}</p>}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {v && !revoked && (
                        <>
                          <a href={`/api/documentos/${v.id}/descargar?formato=pdf`} className={buttonClass("primary", "sm")}>
                            <Download className="h-4 w-4" /> Descargar PDF
                          </a>
                          <a href={`/api/documentos/${v.id}/descargar?formato=html`} className={buttonClass("secondary", "sm")}>
                            <FileCode2 className="h-4 w-4" /> Descargar HTML
                          </a>
                          <CopyHtmlButton versionId={v.id} />
                        </>
                      )}
                      {ent.source?.type === "subscription" && <GenerateButton label="Regenerar" documentType={d.document_type} variant="ghost" size="sm" />}
                      <Link href={`/panel/documentos/${d.id}`} className={buttonClass("ghost", "sm")}>
                        <History className="h-4 w-4" /> Historial ({d.versionCount})
                      </Link>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {ordered.length > 0 && (
        <div id="publicar" className="mt-8 grid scroll-mt-8 gap-6 lg:grid-cols-[1.3fr_1fr]">
          <Panel className="scroll-mt-8" title="Cómo publicarlos en tu web" description="Copia el código HTML y pégalo en una página nueva. Enlázala desde el pie de página.">
            <PublishGuideList />
          </Panel>
          <Panel title="Regenerar documentos" description="Usa tus respuestas más recientes. Útil si ha cambiado tu negocio o hay una nueva versión de las plantillas.">
            {ent.quota && <QuotaMeter quota={ent.quota} className="mb-5" />}
            {ent.canGenerate ? (
              <GenerateButton label={ent.source?.type === "subscription" ? "Regenerar los tres" : "Regenerar ahora"} />
            ) : (
              <p className="text-sm text-muted">
                {ent.blockedReason}{" "}
                <Link href={ent.subscription && ["active", "trialing"].includes(ent.subscription.status) ? "/panel/suscripcion" : "/panel/precompra"} className="text-link">
                  {ent.quota ? "Cambiar de plan" : "Ver opciones"}
                </Link>
              </p>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
