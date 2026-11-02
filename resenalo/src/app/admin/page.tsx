import Link from "next/link";
import { prisma } from "@/server/db";
import { requirePageAdmin } from "@/server/auth/page-auth";
import { integrationStatus } from "@/server/env";
import { Logo } from "@/components/brand/Logo";
import { Badge, Card, CardHeader, Stat } from "@/components/ui/Display";
import { formatEur, vatBreakdown } from "@/lib/money";
import { fmtDate } from "@/lib/format";
import { SUB_STATUS } from "@/lib/status";
import { ResolveButton } from "./ResolveButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Administración", robots: { index: false } };

/** Panel interno del dueño de la plataforma. Datos reales de la BD; sin datos personales de los clientes finales. */
export default async function AdminPage() {
  await requirePageAdmin();
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86400_000);
  const d1 = new Date(now.getTime() - 86400_000);
  const [businesses, onboarded, subs, canceled30, emails30, sms30, failed24, reauth, openDsr, billingErrors, latest] = await Promise.all([
    prisma.business.count(),
    prisma.business.count({ where: { onboardingCompletedAt: { not: null } } }),
    prisma.subscription.findMany({ include: { plan: true } }),
    prisma.subscription.count({ where: { status: "CANCELED", canceledAt: { gte: d30 } } }),
    prisma.emailJob.count({ where: { channel: "EMAIL", sentAt: { gte: d30 } } }),
    prisma.emailJob.count({ where: { channel: "SMS", sentAt: { gte: d30 } } }),
    prisma.emailJob.count({ where: { status: { in: ["FAILED", "BOUNCED"] }, failedAt: { gte: d1 } } }),
    prisma.emailConnection.count({ where: { status: "NEEDS_REAUTH" } }),
    prisma.dataRightsRequest.findMany({ where: { status: { not: "RESOLVED" } }, orderBy: { createdAt: "asc" } }),
    prisma.billingEvent.findMany({ where: { error: { not: null }, processedAt: null }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.business.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { owner: { select: { email: true } }, subscription: { include: { plan: true } }, emailConnection: { select: { status: true, provider: true } }, usage: { orderBy: { periodStart: "desc" }, take: 1 } },
    }),
  ]);
  const paying = subs.filter((s) => s.status === "ACTIVE");
  const mrrGross = paying.reduce((a, s) => a + (s.billingInterval === "YEAR" ? Math.round(s.plan.annualPriceCents / 12) : s.plan.priceCents), 0);
  const mrrBase = paying.reduce((a, s) => a + vatBreakdown(s.billingInterval === "YEAR" ? Math.round(s.plan.annualPriceCents / 12) : s.plan.priceCents, s.plan.vatRateBps).baseCents, 0);
  const byPlan = ["STARTER", "PRO", "BUSINESS"].map((c) => ({ c, n: paying.filter((s) => s.plan.code === c).length }));
  const trials = subs.filter((s) => s.status === "TRIALING").length;
  const pastDue = subs.filter((s) => s.status === "PAST_DUE" || s.status === "UNPAID").length;
  const integ = integrationStatus();

  return (
    <div className="min-h-[100dvh]">
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-4 sm:px-8">
          <div className="flex items-center gap-3"><Logo size="sm" /><Badge tone="star">Administración</Badge></div>
          <Link href="/app" className="text-sm font-medium hover:underline">Ir a mi panel</Link>
        </div>
      </header>
      <main className="mx-auto max-w-[1200px] px-4 py-8 sm:px-8">
        <h1 className="text-2xl font-semibold">Estado de la plataforma</h1>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Stat label="Ingresos recurrentes mensuales" value={formatEur(mrrGross)} hint={`Base sin IVA: ${formatEur(mrrBase)}`} />
          <Stat label="Clientes de pago" value={paying.length} hint={byPlan.map((p) => `${p.c[0]}${p.c.slice(1).toLowerCase()} ${p.n}`).join(" · ")} />
          <Stat label="En prueba gratuita" value={trials} hint={`${pastDue} con pago pendiente`} />
          <Stat label="Bajas (30 días)" value={canceled30} hint={`${businesses} negocios · ${onboarded} configurados`} />
          <Stat label="Correos enviados (30 días)" value={emails30.toLocaleString("es-ES")} />
          <Stat label="SMS enviados (30 días)" value={sms30.toLocaleString("es-ES")} />
          <Stat label="Fallos de envío (24 h)" value={failed24} />
          <Stat label="Correos sin autorización" value={reauth} hint="Negocios que deben reconectar" />
        </div>

        <Card className="mt-4">
          <CardHeader title="Integraciones del servidor" />
          <div className="flex flex-wrap gap-2 text-sm">
            {Object.entries({ Stripe: integ.stripe, Google: integ.google, Microsoft: integ.microsoft, SMTP: integ.smtp }).map(([k, v]) => (
              <Badge key={k} tone={v ? "ok" : "warn"} dot>{k}: {v ? "configurado" : "sin configurar"}</Badge>
            ))}
          </div>
        </Card>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Solicitudes RGPD pendientes" description="Plazo legal de respuesta: 1 mes." />
            {openDsr.length ? (
              <ul className="divide-y divide-ink-100">
                {openDsr.map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                    <div className="min-w-0"><p className="font-medium">{r.type} · {r.name} &lt;{r.email}&gt;</p><p className="text-xs text-ink-500">{fmtDate(r.createdAt, true)} · {r.message.slice(0, 160)}</p></div>
                    <ResolveButton id={r.id} />
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-ink-500">Ninguna pendiente.</p>}
          </Card>
          <Card>
            <CardHeader title="Webhooks de Stripe con error" description="Stripe los reintenta automáticamente." />
            {billingErrors.length ? (
              <ul className="space-y-2 text-sm">{billingErrors.map((e) => <li key={e.id}><span className="font-medium">{e.type}</span> · {fmtDate(e.createdAt, true)}<p className="text-xs text-bad-700">{e.error}</p></li>)}</ul>
            ) : <p className="text-sm text-ink-500">Sin errores.</p>}
          </Card>
        </div>

        <Card className="mt-4" padded={false}>
          <div className="px-5 pt-5 sm:px-6"><h2 className="text-base font-semibold">Últimos negocios</h2></div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-ink-500"><tr className="border-b border-ink-100"><th className="px-5 py-2 sm:px-6">Negocio</th><th className="px-3 py-2">Plan</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Consumo</th><th className="px-3 py-2">Correo</th><th className="px-5 py-2 sm:px-6">Alta</th></tr></thead>
              <tbody className="divide-y divide-ink-100">
                {latest.map((b) => {
                  const u = b.usage[0];
                  const st = b.subscription ? SUB_STATUS[b.subscription.status] : null;
                  return (
                    <tr key={b.id}>
                      <td className="px-5 py-2.5 sm:px-6"><p className="font-medium">{b.name}</p><p className="text-xs text-ink-500">{b.owner.email}</p></td>
                      <td className="px-3 py-2.5">{b.subscription ? `${b.subscription.plan.name}${b.subscription.billingInterval === "YEAR" ? " (anual)" : ""}` : "—"}</td>
                      <td className="px-3 py-2.5">{st ? <Badge tone={st.tone}>{st.label}</Badge> : <Badge>Sin plan</Badge>}</td>
                      <td className="px-3 py-2.5 tabular-nums">{u ? `${u.sent}/${u.emailLimit}${u.smsLimit ? ` · ${u.smsSent}/${u.smsLimit} SMS` : ""}` : "—"}</td>
                      <td className="px-3 py-2.5">{b.emailConnection ? <Badge tone={b.emailConnection.status === "ACTIVE" ? "ok" : "bad"}>{b.emailConnection.provider === "GOOGLE" ? "Gmail" : "Outlook"}</Badge> : "—"}</td>
                      <td className="px-5 py-2.5 sm:px-6">{fmtDate(b.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </main>
    </div>
  );
}
