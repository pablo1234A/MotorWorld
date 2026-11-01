import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Archive, Building2, Check, FileText, RotateCcw, Users } from "lucide-react";
import { Alert, Badge, EmptyState } from "@/components/ui/feedback";
import { Button, LinkButton } from "@/components/ui/button";
import { PageHeader, Panel, Stat } from "@/components/ui/layout";
import { QuotaMeter } from "@/components/app/quota-meter";
import { fmtDate } from "@/components/app/status";
import { EditClientForm, NewClientForm } from "@/components/app/client-forms";
import { requireOrganization } from "@/lib/auth";
import { accountLabel } from "@/lib/accounts";
import { createSessionClient } from "@/lib/supabase/server";
import { loadEntitlements } from "@/lib/billing/data";
import { disableAgencyMode, enableAgencyMode, setClientArchived, switchAccount } from "@/lib/actions/clients";
import type { OrganizationRow } from "@/lib/db/types";

export const metadata: Metadata = { title: "Clientes" };

type ClientStatus = "nuevo" | "en_curso" | "completado" | "documentos";

const STATUS: Record<ClientStatus, { label: string; tone: "neutral" | "info" | "warning" | "success" }> = {
  nuevo: { label: "Sin empezar", tone: "neutral" },
  en_curso: { label: "Formulario en curso", tone: "warning" },
  completado: { label: "Listo para generar", tone: "info" },
  documentos: { label: "Documentos generados", tone: "success" },
};

const ERRORS: Record<string, string> = {
  activar: "No hemos podido activar el modo agencia. Inténtalo de nuevo.",
  desactivar: "Para volver a una cuenta de negocio archiva primero todos tus clientes.",
  cliente: "No encontramos ese cliente en tu cuenta.",
  archivar: "No hemos podido actualizar el cliente.",
};

export default async function ClientsPage({ searchParams }: PageProps<"/panel/clientes">) {
  const [{ account }, sp] = await Promise.all([requireOrganization(), searchParams]);
  const error = typeof sp.error === "string" ? ERRORS[sp.error] : undefined;

  if (!account.isAgency) return <AgencyIntro error={error} />;

  const db = await createSessionClient();
  const ids = [account.root.id, ...account.clients.map((c) => c.id)];
  const [{ data: forms }, { data: docs }, ent] = await Promise.all([
    db.from("form_responses").select("organization_id, status, updated_at").in("organization_id", ids),
    db.from("documents").select("organization_id, updated_at").in("organization_id", ids),
    loadEntitlements(db, account.root.id),
  ]);

  const summary = (org: OrganizationRow) => {
    const f = (forms ?? []).filter((x) => x.organization_id === org.id);
    const d = (docs ?? []).filter((x) => x.organization_id === org.id);
    const status: ClientStatus = d.length > 0 ? "documentos" : f.some((x) => x.status === "completed") ? "completado" : f.length > 0 ? "en_curso" : "nuevo";
    const last = [...f.map((x) => x.updated_at as string), ...d.map((x) => x.updated_at as string)].sort().at(-1) ?? null;
    return { status, documents: d.length, last };
  };

  const active = account.clients.filter((c) => !c.archived_at);
  const archived = account.clients.filter((c) => c.archived_at);
  const stats = active.map(summary);
  const hasSubscription = Boolean(ent.subscription && ["active", "trialing"].includes(ent.subscription.status));
  const hasAgencyPlan = hasSubscription && ent.allowsClients;

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Gestiona los textos legales de las webs de tus clientes. Cada cliente tiene su propio formulario, sus documentos y su banner de cookies."
      />

      <div className="mb-6 space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}
        {sp.archivado && <Alert tone="info">Cliente archivado. Sus documentos se conservan y puedes restaurarlo cuando quieras.</Alert>}
        {sp.restaurado && <Alert tone="success">Cliente restaurado.</Alert>}
        {!hasAgencyPlan && (
          <Alert tone="warning" title="Para generar los documentos de tus clientes necesitas el plan Agencia">
            Puedes dar de alta clientes y completar sus formularios ya. El plan Agencia (49 €/mes) incluye clientes y documentos ilimitados y el banner de cookies de cada web.{" "}
            {hasSubscription ? (
              <>Tu plan actual cubre solo tu propia web: cámbialo desde <Link href="/panel/suscripcion" className="text-link">Mi suscripción</Link>.</>
            ) : (
              <Link href="/panel/precompra?plan=subscription_agency" className="text-link">Contratar el plan Agencia</Link>
            )}
          </Alert>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Clientes activos" value={active.length} />
        <Stat label="Con documentos" value={stats.filter((s) => s.status === "documentos").length} />
        <Stat label="Pendientes" value={stats.filter((s) => s.status !== "documentos").length} hint="Sin formulario completado o sin generar" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <Panel title="Añadir cliente" description="Lo creamos y te llevamos a su formulario. Los datos legales (titular, NIF, domicilio) se piden allí.">
          <NewClientForm />
        </Panel>
        <Panel title="Tu plan">
          {hasSubscription && ent.quota ? (
            <div className="space-y-3 text-sm">
              <p className="font-medium text-ink">Plan {ent.planName ?? "suscripción"}</p>
              <QuotaMeter quota={ent.quota} />
              <p className="text-muted">{ent.quota.limit === null ? "Sin límite de documentos." : "Cada documento generado cuenta 1 (un cliente con sus tres textos son 3)."}</p>
            </div>
          ) : (
            <p className="text-sm text-muted">Sin suscripción activa.</p>
          )}
          <Link href="/panel/suscripcion" className="mt-4 inline-block text-sm text-link">
            Gestionar suscripción
          </Link>
        </Panel>
      </div>

      <Panel className="mt-6" title="Tus clientes">
        {active.length === 0 ? (
          <EmptyState icon={<Building2 className="h-5 w-5" />} title="Todavía no tienes clientes" description="Añade el primero con el formulario de arriba." />
        ) : (
          <ul className="divide-y divide-line">
            {active.map((c, i) => (
              <ClientRow key={c.id} org={c} info={stats[i]} activeId={account.active.id} />
            ))}
          </ul>
        )}
        <ul className="mt-5 border-t border-line pt-5">
          <ClientRow org={account.root} info={summary(account.root)} activeId={account.active.id} root />
        </ul>
      </Panel>

      {archived.length > 0 && (
        <details className="mt-6 rounded-2xl border border-line bg-white p-5 sm:p-6">
          <summary className="cursor-pointer font-semibold text-ink">Clientes archivados ({archived.length})</summary>
          <ul className="mt-4 divide-y divide-line">
            {archived.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-ink">{accountLabel(c)}</p>
                  <p className="text-xs text-muted">Archivado el {fmtDate(c.archived_at)}</p>
                </div>
                <form action={setClientArchived}>
                  <input type="hidden" name="id" value={c.id} />
                  <Button type="submit" size="sm" variant="secondary">
                    <RotateCcw className="h-4 w-4" /> Restaurar
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      )}

      {active.length === 0 && (
        <form action={disableAgencyMode} className="mt-8 text-sm text-muted">
          ¿No gestionas webs de terceros?{" "}
          <button type="submit" className="text-link">
            Volver a una cuenta de negocio
          </button>
        </form>
      )}
    </>
  );
}

function ClientRow({ org, info, activeId, root }: { org: OrganizationRow; info: { status: ClientStatus; documents: number; last: string | null }; activeId: string; root?: boolean }) {
  const s = STATUS[info.status];
  const isActive = org.id === activeId;
  const label = root ? `${accountLabel(org, "Tu agencia")} · web propia` : accountLabel(org);
  const action = info.status === "documentos" ? "Ver documentos" : info.status === "nuevo" ? "Empezar formulario" : "Continuar";
  return (
    <li className="list-none py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
            {label}
            {isActive && (
              <span className="inline-flex items-center gap-1 text-xs font-normal text-blue">
                <Check className="h-3.5 w-3.5" aria-hidden /> Seleccionado
              </span>
            )}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <Badge tone={s.tone}>{s.label}</Badge>
            {org.website_url && <span>{org.website_url.replace(/^https?:\/\//, "")}</span>}
            <span className="inline-flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" aria-hidden /> {info.documents} documentos
            </span>
            {info.last && <span>Actualizado el {fmtDate(info.last)}</span>}
          </p>
          {org.client_notes && <p className="mt-1.5 text-sm text-ink-soft">{org.client_notes}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action={switchAccount}>
            <input type="hidden" name="org" value={org.id} />
            <input type="hidden" name="next" value={info.status === "documentos" ? "/panel/documentos" : "/panel/generador"} />
            <Button type="submit" size="sm" variant={isActive ? "secondary" : "primary"} aria-label={`${action} de ${label}`}>
              {action} <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </form>
          {!root && (
            <details className="relative">
              <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-lg px-2.5 text-sm text-ink-soft hover:bg-sand [&::-webkit-details-marker]:hidden">
                Editar
              </summary>
              <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-line bg-white p-4 shadow-[var(--shadow-lift)]">
                <EditClientForm id={org.id} name={org.client_name ?? ""} notes={org.client_notes} />
                <form action={setClientArchived} className="mt-3 border-t border-line pt-3">
                  <input type="hidden" name="id" value={org.id} />
                  <input type="hidden" name="archive" value="1" />
                  <button type="submit" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-danger">
                    <Archive className="h-4 w-4" aria-hidden /> Archivar cliente
                  </button>
                </form>
              </div>
            </details>
          )}
        </div>
      </div>
    </li>
  );
}

function AgencyIntro({ error }: { error?: string }) {
  return (
    <>
      <PageHeader title="Clientes" description="¿Eres una agencia web, una gestoría o un consultor? Gestiona los textos legales de todas las webs de tus clientes desde una sola cuenta." />
      {error && <Alert tone="danger" className="mb-6">{error}</Alert>}
      <Panel>
        <div className="grid gap-8 md:grid-cols-[1.2fr_1fr]">
          <div>
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue">
              <Users className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="mt-4 text-lg font-semibold">Activa el modo agencia</h2>
            <ul className="mt-4 space-y-2.5 text-[15px] text-ink-soft">
              {[
                "Un formulario y un juego de documentos por cliente, sin mezclar datos.",
                "Una sola suscripción: el cupo de documentos se comparte entre todos tus clientes.",
                "Cambia de cliente en un clic y entrega PDF o código HTML listo para su web.",
                "Tu propia web sigue disponible como cuenta principal.",
              ].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <Check className="mt-0.5 h-4.5 w-4.5 shrink-0 text-success" aria-hidden /> {t}
                </li>
              ))}
            </ul>
            <form action={enableAgencyMode} className="mt-6">
              <Button type="submit">Activar modo agencia</Button>
            </form>
            <p className="mt-3 text-xs text-muted">Puedes volver a una cuenta de negocio mientras no tengas clientes activos.</p>
          </div>
          <div className="rounded-xl border border-line bg-sand/50 p-5 text-sm text-ink-soft">
            <p className="font-semibold text-ink">Plan Agencia · 49 €/mes</p>
            <ul className="mt-3 space-y-1.5">
              <li>Clientes y documentos ilimitados.</li>
              <li>Banner de cookies para cada cliente.</li>
              <li>Documentos y banner sin la marca Legalito.</li>
              <li>Con 10 clientes, unos 4,90 € por web al mes.</li>
            </ul>
            <LinkButton href="/agencias-y-gestorias" variant="secondary" size="sm" className="mt-4">
              Cómo funciona para agencias
            </LinkButton>
          </div>
        </div>
      </Panel>
    </>
  );
}
