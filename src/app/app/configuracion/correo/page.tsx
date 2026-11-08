import type { Metadata } from "next";
import Link from "next/link";

import { DomainsManager, SenderForm, SuppressionsManager } from "@/components/email/email-settings";
import { buttonClass } from "@/components/ui/button-styles";
import { Alert } from "@/components/ui/feedback";
import { formatDateTime } from "@/lib/dates";
import { param } from "@/lib/pagination";
import { isAdmin } from "@/server/auth/context";
import { requireOrgPage } from "@/server/auth/guards";
import { getDomainProvider } from "@/server/email/domains";
import { getEmailProvider, getSenderConfig } from "@/server/email/provider";
import { listAccessibleBranches } from "@/server/modules/branches/service";
import { listDomains } from "@/server/modules/email/domains";
import { orgEmailReputation } from "@/server/modules/email/notifications";
import { getSenderSettings, listSuppressions } from "@/server/modules/email/settings";

export const metadata: Metadata = { title: "Correo · RevisaYa" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function EmailSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireOrgPage("/app/configuracion/correo");
  if (!isAdmin(ctx)) {
    return <Alert tone="error" title="Sin permiso">Solo los administradores de la empresa pueden configurar el correo.</Alert>;
  }
  const sp = await searchParams;
  const branches = await listAccessibleBranches(ctx);
  const branch = branches.find((b) => b.id === param(sp.taller, 40)) ?? branches[0];
  if (!branch) return <Alert tone="error">No hay ninguna delegación activa.</Alert>;

  const [settings, domains, suppressions, reputation] = await Promise.all([getSenderSettings(ctx, branch.id), listDomains(ctx), listSuppressions(ctx), orgEmailReputation(ctx)]);
  const pct = (n: number) => `${(n * 100).toLocaleString("es-ES", { maximumFractionDigits: 2 })} %`;
  if (!settings) return <Alert tone="error">No se ha encontrado la configuración de esta delegación.</Alert>;
  const readOnly = !ctx.subscription.active;
  const sender = getSenderConfig();
  const sharedDomain = sender?.sharedDomain ?? process.env.EMAIL_SHARED_DOMAIN ?? "avisos.revisaya.es";
  const sharedFrom = `"${ctx.membership.organizationName}" <${ctx.membership.organizationSlug}@${sharedDomain}>`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Correo</h1>
          <p className="text-sm text-[var(--muted)]">Desde qué dirección salen los avisos, resumen para la empresa y direcciones bloqueadas.</p>
        </div>
        <Link href="/app/configuracion/plantillas" className={buttonClass("secondary")}>
          Editar plantillas
        </Link>
      </div>
      {!getEmailProvider() ? (
        <Alert tone="info">El envío de correo aún no está configurado en RevisaYa: la configuración se guarda, pero no se envía nada todavía.</Alert>
      ) : null}
      {readOnly ? <Alert tone="warning">Tu suscripción no está activa: la configuración está en solo lectura.</Alert> : null}

      <section aria-labelledby="reputacion" className="flex flex-col gap-2">
        <h2 id="reputacion" className="text-lg font-semibold">Calidad de los envíos (últimos 30 días)</h2>
        {reputation.level !== "ok" ? (
          <Alert tone={reputation.level === "critical" ? "error" : "warning"} title={reputation.level === "critical" ? "Demasiados rebotes o quejas" : "Revisa tu lista de clientes"}>
            Gmail y Outlook mandan a spam a los remitentes con muchos rebotes o quejas. Revisa los correos de tus clientes y escribe solo a clientes de la empresa.
          </Alert>
        ) : null}
        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <dt className="text-sm text-[var(--muted)]">Correos a clientes</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{reputation.sent.toLocaleString("es-ES")}</dd>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <dt className="text-sm text-[var(--muted)]">Rebotes (recomendado: menos del 4 %)</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{pct(reputation.bounceRate)}</dd>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <dt className="text-sm text-[var(--muted)]">Marcados como spam (recomendado: menos del 0,1 %)</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{pct(reputation.complaintRate)}</dd>
          </div>
        </dl>
        <p className="text-xs text-[var(--muted)]">Los rebotes y las quejas solo se conocen con un proveedor que los comunica (Resend). Con SMTP, aquí verás ceros.</p>
      </section>

      {branches.length > 1 ? (
        <form method="get" className="flex flex-wrap items-center gap-2">
          <label htmlFor="taller" className="text-sm font-medium">
            Taller
          </label>
          <select id="taller" name="taller" defaultValue={branch.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-sm">
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <button type="submit" className={buttonClass("secondary")}>
            Ver
          </button>
        </form>
      ) : null}

      <SenderForm
        key={branch.id}
        branchId={branch.id}
        senderMode={settings.senderMode}
        sendingDomainId={settings.sendingDomainId}
        digestFrequency={settings.digestFrequency}
        sharedFrom={sharedFrom}
        replyTo={settings.replyToEmail}
        verifiedDomains={domains.filter((d) => d.status === "verified").map((d) => ({ id: d.id, address: `${d.fromLocalPart}@${d.domain}` }))}
        readOnly={readOnly}
      />
      <DomainsManager domains={domains} configured={getDomainProvider() !== null} readOnly={readOnly} />
      <SuppressionsManager rows={suppressions.map((s) => ({ ...s, createdAt: formatDateTime(s.createdAt) }))} readOnly={readOnly} />
    </div>
  );
}
