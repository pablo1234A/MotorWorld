import type { Metadata } from "next";
import { BillingActions, DeleteAccount, PasswordForm, ProfileForm, SessionsPanel } from "@/components/app/account-forms";
import { planFeatureList } from "@/components/marketing/pricing";
import { Badge, Card, CardHeader, Notice, PageHeader, ProgressBar } from "@/components/ui/primitives";
import { usagePercent } from "@/domain/plans";
import { paymentsEnabled } from "@/lib/config/env";
import { hasAdminClient } from "@/lib/supabase/admin";
import { formatDate, formatNumber, formatPrice } from "@/lib/utils";
import { requireSession } from "@/server/auth/session";
import { getAvatarUrl } from "@/server/services/account";
import { getPublicPlans } from "@/server/services/public";
import { getUsage } from "@/server/services/usage";

export const metadata: Metadata = { title: "Mi cuenta" };

const STATUS_LABEL: Record<string, string> = { active: "Activa", trialing: "En prueba", past_due: "Pago pendiente", canceled: "Cancelada", incomplete: "Incompleta", incomplete_expired: "Caducada", unpaid: "Impagada", paused: "En pausa" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const context = await requireSession();
  const [usage, plans, avatarUrl, subscription, params] = await Promise.all([
    getUsage(context.supabase, context.workspace.id),
    getPublicPlans(),
    getAvatarUrl(context.supabase, context.profile.avatar_url),
    context.supabase.from("subscriptions").select("status, provider, provider_customer_id, current_period_end, cancel_at_period_end").eq("workspace_id", context.workspace.id).maybeSingle().then((result) => result.data),
    searchParams,
  ]);
  const enabled = paymentsEnabled();
  const percent = usagePercent(usage);
  const current = plans.find((plan) => plan.code === usage.planCode);
  const stripeManaged = subscription?.provider === "stripe";
  const upgrades = plans.filter((plan) => plan.price > (current?.price ?? 0));

  return (
    <>
      <PageHeader title="Mi cuenta" description="Tu perfil, tu plan y la seguridad de tu cuenta." />

      {params.checkout === "success" ? (
        <Notice tone="success" className="mb-5">
          Pago recibido. Tu plan se actualizará en cuanto Stripe confirme la suscripción (suele tardar unos segundos; recarga la página).
        </Notice>
      ) : params.checkout === "cancelled" ? (
        <Notice tone="info" className="mb-5">
          Has cancelado el proceso de pago. No se ha realizado ningún cargo.
        </Notice>
      ) : null}

      <div className="space-y-5">
        <Card>
          <CardHeader title="Perfil" />
          <div className="p-5">
            <ProfileForm fullName={context.profile.full_name} email={context.profile.email} avatarUrl={avatarUrl} />
          </div>
        </Card>

        <Card id="plan" className="scroll-mt-24">
          <CardHeader
            title="Plan y consumo"
            description={`Periodo actual: ${formatDate(usage.periodStart)} – ${formatDate(usage.periodEnd)}`}
            action={
              <span className="flex items-center gap-2">
                {subscription?.status && subscription.status !== "active" ? <Badge tone="warning">{STATUS_LABEL[subscription.status] ?? subscription.status}</Badge> : null}
                <Badge tone="brand">Plan {usage.planName}</Badge>
              </span>
            }
          />
          <div className="grid gap-6 p-5 lg:grid-cols-2">
            <div>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">Generaciones del periodo</span>
                <span className="tabular-nums text-muted">
                  {formatNumber(usage.used)} / {formatNumber(usage.monthlyListingLimit)}
                </span>
              </div>
              <ProgressBar value={percent} tone={percent >= 100 ? "danger" : percent >= 80 ? "warning" : "brand"} label="Generaciones usadas" className="mt-2.5" />
              <p className="mt-2 text-[13px] text-muted">
                Te quedan {formatNumber(usage.remaining)}. El contador se renueva el {formatDate(usage.periodEnd)}.
                {usage.monthlyBulkLimit > 0 ? ` Generación masiva: ${formatNumber(usage.bulkUsed)} de ${formatNumber(usage.monthlyBulkLimit)}.` : ""}
              </p>
              {subscription?.cancel_at_period_end && subscription.current_period_end ? (
                <p className="mt-2 text-[13px] text-warning">Tu suscripción se cancelará el {formatDate(subscription.current_period_end)} y pasarás al plan Free.</p>
              ) : null}
            </div>
            {current ? (
              <div>
                <p className="text-sm font-medium">
                  Incluido en {current.name} <span className="font-normal text-muted">· {formatPrice(current.price, current.currency)}/mes</span>
                </p>
                <ul className="mt-2 space-y-1 text-[13px] text-ink-soft">
                  {planFeatureList(current).map((item) => (
                    <li key={item}>· {item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <div className="border-t border-line p-5">
            {enabled ? (
              <>
                <p className="mb-3 text-sm text-muted">{stripeManaged ? "Cambia de plan, actualiza el método de pago o cancela desde el portal de facturación de Stripe." : "Elige un plan de pago. Serás redirigido a Stripe para completar la contratación de forma segura."}</p>
                <BillingActions plans={stripeManaged ? [] : upgrades.map((plan) => ({ code: plan.code, name: plan.name }))} hasBilling={Boolean(subscription?.provider_customer_id) && stripeManaged} />
              </>
            ) : (
              <Notice tone="info" title="Planes de pago todavía no disponibles">
                La contratación no está activa y no se realiza ningún cobro: todas las cuentas funcionan con los límites de su plan actual. Puedes consultar los planes previstos en la página de precios.
              </Notice>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Contraseña" description="Al cambiarla se cierran las sesiones abiertas en otros dispositivos." />
          <div className="p-5">
            <PasswordForm />
          </div>
        </Card>

        <Card>
          <CardHeader title="Sesiones" />
          <div className="p-5">
            <SessionsPanel />
          </div>
        </Card>

        <Card className="border-danger/25">
          <CardHeader title="Eliminar cuenta" />
          <div className="p-5">
            <DeleteAccount available={hasAdminClient()} />
          </div>
        </Card>
      </div>
    </>
  );
}
