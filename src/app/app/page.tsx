import type { Metadata } from "next";

import { Alert, Card } from "@/components/ui/feedback";
import { ROLE_LABELS } from "@/lib/permissions";
import { PLANS } from "@/lib/plans";
import { requireOrgPage } from "@/server/auth/guards";
import { getDashboardSummary } from "@/server/modules/dashboard/service";

export const metadata: Metadata = { title: "Inicio · RevisaYa" };

const STATUS_LABELS: Record<string, string> = {
  trialing: "Periodo de prueba",
  active: "Activa",
  past_due: "Pago pendiente",
  unpaid: "Impagada",
  canceled: "Cancelada",
  incomplete: "Pendiente de completar",
  incomplete_expired: "Caducada",
  paused: "En pausa",
};

const dateFmt = new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeZone: "Europe/Madrid" });

export default async function DashboardPage() {
  const ctx = await requireOrgPage("/app");
  const summary = await getDashboardSummary(ctx);
  const plan = ctx.subscription.planCode ? PLANS[ctx.subscription.planCode] : null;
  const limit = (n: number | null | undefined) => (n == null ? "ilimitados" : n.toLocaleString("es-ES"));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{ctx.membership.organizationName}</h1>
        <p className="text-sm text-[var(--muted)]">
          {ROLE_LABELS[ctx.membership.role]}
          {ctx.membership.isOwner ? " · propietario de la cuenta" : ""}
        </p>
      </div>

      {!ctx.subscription.active ? (
        <Alert tone="warning" title={ctx.subscription.status ? `Suscripción: ${STATUS_LABELS[ctx.subscription.status] ?? ctx.subscription.status}` : "Tu taller aún no tiene un plan activo"}>
          Mientras no haya un plan activo, los datos del taller están en modo de solo lectura: no se pueden añadir
          clientes, vehículos ni usuarios, y no se envían avisos.
        </Alert>
      ) : (
        <Card>
          <p className="text-sm text-[var(--muted)]">Plan</p>
          <p className="text-lg font-semibold">
            {plan?.name} · {STATUS_LABELS[ctx.subscription.status ?? ""] ?? ctx.subscription.status}
          </p>
          {ctx.subscription.status === "trialing" && ctx.subscription.trialEnd ? (
            <p className="mt-1 text-sm text-[var(--muted)]">La prueba termina el {dateFmt.format(ctx.subscription.trialEnd)}.</p>
          ) : null}
          {ctx.subscription.cancelAtPeriodEnd && ctx.subscription.currentPeriodEnd ? (
            <p className="mt-1 text-sm text-[var(--muted)]">Se cancelará el {dateFmt.format(ctx.subscription.currentPeriodEnd)}.</p>
          ) : null}
        </Card>
      )}

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Clientes" value={summary.customers} limit={plan ? limit(plan.maxCustomers) : undefined} />
        <Stat label="Vehículos activos" value={summary.activeVehicles} limit={plan ? limit(plan.maxActiveVehicles) : undefined} />
        <Stat label="Usuarios" value={summary.members} limit={plan ? limit(plan.maxUsers) : undefined} />
        <Stat label="Talleres" value={summary.branches} limit={plan ? limit(plan.maxBranches) : undefined} />
      </dl>
    </div>
  );
}

function Stat({ label, value, limit }: { label: string; value: number; limit?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <dt className="text-sm text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 text-3xl font-semibold tabular-nums">{value.toLocaleString("es-ES")}</dd>
      {limit ? <dd className="mt-1 text-xs text-[var(--muted)]">de {limit} en tu plan</dd> : null}
    </div>
  );
}
