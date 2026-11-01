import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BellRing, FileText, MailWarning, PenLine } from "lucide-react";
import { Alert, Badge, EmptyState } from "@/components/ui/feedback";
import { LinkButton } from "@/components/ui/button";
import { PageHeader, Panel } from "@/components/ui/layout";
import { ReviewBadge, SubscriptionBadge, fmtDate } from "@/components/app/status";
import { getProfile, requireOrganization } from "@/lib/auth";
import { getFormStatus, getMyEntitlements, getUpdatesAndNotices, listDocuments } from "@/lib/data/panel";
import { progress } from "@/lib/documents/questionnaire";
import { prepareInput } from "@/lib/documents/compose";
import { formatPrice } from "@/lib/billing/entitlements";
import { documentTypeName } from "@/lib/documents/registry";

export const metadata: Metadata = { title: "Inicio" };

export default async function DashboardPage() {
  const { user } = await requireOrganization();
  const [profile, ent, docs, form, feed] = await Promise.all([getProfile(), getMyEntitlements(), listDocuments(), getFormStatus(), getUpdatesAndNotices()]);
  const firstName = profile?.full_name?.split(" ")[0];
  const draftProgress = form.draft ? progress(form.draft.answers).percent : null;
  const critical = form.completed ? prepareInput(form.completed.answers).requirements.filter((r) => r.severity === "critical") : [];

  return (
    <>
      <PageHeader title={firstName ? `Hola, ${firstName}` : "Tu panel"} description="Aquí tienes el estado de tu cuenta y de tus documentos legales." />

      <div className="space-y-4">
        {!user.emailConfirmed && (
          <Alert tone="warning" title="Verifica tu email">
            Te enviamos un enlace de verificación al registrarte. Lo necesitas para recibir avisos importantes.
          </Alert>
        )}
        {ent.paymentIssue && (
          <Alert tone="danger" title="Hay un problema con el pago de tu suscripción">
            Actualiza tu método de pago desde <Link href="/panel/suscripcion">Mi suscripción</Link> para seguir generando documentos.
          </Alert>
        )}
        {feed.notices.map((n) => (
          <Alert key={n.id} tone={n.level === "important" ? "warning" : "info"} title={n.title}>
            {n.body}
          </Alert>
        ))}
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-[1.4fr_1fr]">
        {/* Acción principal según el momento del cliente */}
        <Panel>
          {docs.length > 0 ? (
            <NextStep icon={<FileText className="h-5 w-5" />} title="Tus documentos están listos" body="Descárgalos en PDF o HTML y publícalos en tu web. Si cambia tu negocio, actualiza tus respuestas.">
              <LinkButton href="/panel/documentos">Ver mis documentos</LinkButton>
              <LinkButton href="/panel/generador" variant="secondary">Actualizar respuestas</LinkButton>
            </NextStep>
          ) : form.completed && !form.draft ? (
            <NextStep icon={<FileText className="h-5 w-5" />} title="Revisa tu vista previa" body="Ya has completado el formulario. Revisa tus documentos y elige cómo quieres obtenerlos.">
              <LinkButton href="/panel/generador/revision">Ver vista previa <ArrowRight className="h-4 w-4" /></LinkButton>
            </NextStep>
          ) : (
            <NextStep
              icon={<PenLine className="h-5 w-5" />}
              title={form.draft ? "Continúa donde lo dejaste" : "Crea tus documentos"}
              body={form.draft ? "Guardamos tus respuestas automáticamente. Te falta poco." : "Responde unas preguntas sobre tu negocio. Te llevará unos minutos."}
            >
              <LinkButton href="/panel/generador">{form.draft ? "Continuar formulario" : "Empezar"} <ArrowRight className="h-4 w-4" /></LinkButton>
              {draftProgress !== null && (
                <div className="flex min-w-40 flex-1 items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sand-200" role="progressbar" aria-valuenow={draftProgress} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso del formulario">
                    <div className="h-full rounded-full bg-blue" style={{ width: `${draftProgress}%` }} />
                  </div>
                  <span className="text-sm text-muted tabular-nums">{draftProgress}%</span>
                </div>
              )}
            </NextStep>
          )}
        </Panel>

        <Panel title="Tu plan">
          {ent.plan === "subscription" && ent.subscription ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-ink">Suscripción</span>
                <SubscriptionBadge status={ent.subscription.status} />
              </div>
              {ent.subscription.amount_cents !== null && <p className="text-muted">{formatPrice(ent.subscription.amount_cents, ent.subscription.currency ?? "eur")} / mes</p>}
              <p className="text-muted">
                {ent.subscription.cancel_at_period_end ? "Finaliza el " : "Próxima renovación: "}
                {fmtDate(ent.subscription.current_period_end)}
              </p>
            </div>
          ) : ent.plan === "one_time" ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-ink">Pago único</span>
                <Badge tone="success">Activo</Badge>
              </div>
              <p className="text-muted">
                {ent.source?.type === "purchase" && ent.source.remaining !== null ? `Te quedan ${ent.source.remaining} generaciones.` : ent.blockedReason ?? "Acceso permanente a tus documentos."}
              </p>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <p className="text-muted">Todavía no tienes un plan. Puedes completar el formulario y ver la vista previa gratis.</p>
              <Link href="/precios" className="font-medium text-blue hover:underline">Ver planes</Link>
            </div>
          )}
          <Link href="/panel/suscripcion" className="mt-4 inline-block text-sm font-medium text-blue hover:underline">Gestionar</Link>
        </Panel>
      </div>

      {critical.length > 0 && (
        <Panel className="mt-5" title="Acciones importantes para tu web" description="Tus documentos no resuelven estas cuestiones por sí solos.">
          <ul className="space-y-3">
            {critical.map((r) => (
              <li key={r.id} className="flex gap-3 text-sm">
                <MailWarning className="mt-0.5 h-4.5 w-4.5 shrink-0 text-warning" aria-hidden />
                <span><strong className="font-medium text-ink">{r.title}.</strong> <span className="text-muted">{r.detail}</span></span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Panel title="Documentos recientes" actions={docs.length > 0 ? <Link href="/panel/documentos" className="text-sm font-medium text-blue hover:underline">Ver todos</Link> : undefined}>
          {docs.length === 0 ? (
            <EmptyState icon={<FileText className="h-5 w-5" />} title="Aún no hay documentos" description="Aparecerán aquí cuando los generes." />
          ) : (
            <ul className="divide-y divide-line">
              {docs.slice(0, 3).map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <Link href={`/panel/documentos/${d.id}`} className="font-medium text-ink hover:text-navy">{documentTypeName(d.document_type)}</Link>
                    <p className="text-xs text-muted">Versión {d.current?.version_number} · {fmtDate(d.current?.generated_at)}</p>
                  </div>
                  <ReviewBadge template={d.current?.template ?? null} revoked={Boolean(d.current?.revoked_at)} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Últimas actualizaciones">
          {feed.updates.length === 0 ? (
            <EmptyState icon={<BellRing className="h-5 w-5" />} title="Sin actualizaciones" description="Te avisaremos cuando se publique una nueva versión revisada de las plantillas." />
          ) : (
            <ul className="space-y-4">
              {feed.updates.map((u) => (
                <li key={u.id}>
                  <p className="text-xs text-subtle">{fmtDate(u.published_at)}</p>
                  <p className="font-medium text-ink">{u.title}</p>
                  <p className="mt-0.5 text-sm text-muted">{u.summary}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

function NextStep({ icon, title, body, children }: { icon: React.ReactNode; title: string; body: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue">{icon}</span>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-[15px] text-muted">{body}</p>
      <div className="mt-5 flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}
