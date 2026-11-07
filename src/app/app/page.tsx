import type { Metadata } from "next";
import Link from "next/link";

import { Alert, Card } from "@/components/ui/feedback";
import { ROLE_LABELS } from "@/lib/permissions";
import { PLANS } from "@/lib/plans";
import { requireOrgPage } from "@/server/auth/guards";
import { can } from "@/server/auth/context";
import { pendingRequestsCount } from "@/server/modules/appointments/service";
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
  const canAppointments = can(ctx, "appointments.manage");
  const [summary, pendingRequests] = await Promise.all([getDashboardSummary(ctx), canAppointments ? pendingRequestsCount(ctx) : Promise.resolve(0)]);
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
          clientes, vehículos ni usuarios, y no se envían avisos.{" "}
          {ctx.membership.role === "admin" ? (
            <Link href="/app/facturacion" className="font-medium text-[var(--accent)]">
              Elegir un plan (7 días gratis)
            </Link>
          ) : (
            "Pídele a un administrador que elija un plan."
          )}
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

      {ctx.subscription.status === "past_due" ? (
        <Alert tone="warning" title="Pago pendiente">
          No hemos podido cobrar la última factura. Actualiza la tarjeta para que el taller no pase a solo lectura.{" "}
          {ctx.membership.role === "admin" ? (
            <Link href="/app/facturacion" className="font-medium text-[var(--accent)]">
              Ir a facturación
            </Link>
          ) : null}
        </Alert>
      ) : null}

      {pendingRequests ? (
        <Alert tone="info" title={`${pendingRequests} ${pendingRequests === 1 ? "cliente ha pedido cita" : "clientes han pedido cita"}`}>
          <Link href="/app/citas?estado=solicitudes" className="font-medium text-[var(--accent)]">
            Revisar las solicitudes
          </Link>{" "}
          y confírmalas o recházalas.
        </Alert>
      ) : null}

      <section aria-labelledby="revisiones" className="flex flex-col gap-3">
        <h2 id="revisiones" className="text-lg font-semibold">Revisiones</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <LinkStat href="/app/vehiculos?revision=vencidas" label="Vencidas" value={summary.overdue} tone={summary.overdue ? "danger" : undefined} />
          <LinkStat href="/app/vehiculos?revision=30" label="En los próximos 30 días" value={summary.dueIn30} tone={summary.dueIn30 ? "warning" : undefined} />
          <LinkStat href="/app/vehiculos?revision=sin-fecha" label="Vehículos sin próxima revisión" value={summary.withoutNextService} />
          <LinkStat href="/app/clientes?correo=sin" label="Clientes sin correo (no reciben avisos)" value={summary.customersWithoutEmail} />
        </div>
      </section>

      <h2 className="text-lg font-semibold">Tu cuenta</h2>
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

function LinkStat({ href, label, value, tone }: { href: string; label: string; value: number; tone?: "danger" | "warning" }) {
  const color = tone === "danger" ? "text-[var(--danger)]" : tone === "warning" ? "text-[var(--warning)]" : "";
  return (
    <Link href={href} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 transition-colors hover:border-[var(--accent)]">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${color}`}>{value.toLocaleString("es-ES")}</p>
    </Link>
  );
}
