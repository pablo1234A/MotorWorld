import type { Metadata } from "next";
import Link from "next/link";

import { StatCard } from "@/components/pci/badges";
import { Alert, Card } from "@/components/ui/feedback";
import { formatDateTime } from "@/lib/dates";
import { ROLE_LABELS } from "@/lib/permissions";
import { PLANS } from "@/lib/plans";
import { requireOrgPage } from "@/server/auth/guards";
import { can } from "@/server/auth/context";
import { pendingRequestsCount } from "@/server/modules/appointments/service";
import { getDashboardSummary, getPciDashboard } from "@/server/modules/dashboard/service";
import { dashboardActivity } from "@/server/modules/reports/service";

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
  const [summary, pci, pendingRequests, activity] = await Promise.all([
    getDashboardSummary(ctx),
    getPciDashboard(ctx),
    canAppointments ? pendingRequestsCount(ctx) : Promise.resolve(0),
    dashboardActivity(ctx),
  ]);
  const reportsLink = can(ctx, "reports.read") && ctx.subscription.planCode && PLANS[ctx.subscription.planCode].features.includes("reports");
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
        <Alert tone="warning" title={ctx.subscription.status ? `Suscripción: ${STATUS_LABELS[ctx.subscription.status] ?? ctx.subscription.status}` : "Tu empresa aún no tiene un plan activo"}>
          Mientras no haya un plan activo, los datos de la empresa están en modo de solo lectura: no se pueden añadir
          clientes, instalaciones, equipos ni usuarios, y no se envían avisos.{" "}
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
          No hemos podido cobrar la última factura. Actualiza la tarjeta para que la cuenta no pase a solo lectura.{" "}
          {ctx.membership.role === "admin" ? (
            <Link href="/app/facturacion" className="font-medium text-[var(--accent)]">
              Ir a facturación
            </Link>
          ) : null}
        </Alert>
      ) : null}

      {pendingRequests ? (
        <Alert tone="info" title={`${pendingRequests} ${pendingRequests === 1 ? "cliente ha pedido una visita" : "clientes han pedido una visita"}`}>
          <Link href="/app/citas?estado=solicitudes" className="font-medium text-[var(--accent)]">
            Revisar las solicitudes
          </Link>{" "}
          y confírmalas o recházalas.
        </Alert>
      ) : null}

      <section aria-labelledby="vencimientos" className="flex flex-col gap-3">
        <h2 id="vencimientos" className="text-lg font-semibold">Vencimientos y trabajo</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard href="/app/equipos?vencimiento=vencidas" label="Equipos con actuación vencida" value={pci.equipmentOverdue} tone="bad" />
          <StatCard href="/app/equipos?vencimiento=30" label="Equipos que vencen en 30 días" value={pci.equipmentDue30d} tone="warn" />
          <StatCard href="/app/ordenes-trabajo" label="Órdenes de trabajo abiertas" value={pci.workOrdersOpen} />
          <StatCard href="/app/incidencias" label="Incidencias abiertas" value={pci.incidentsOpen} tone="bad" />
        </div>
      </section>

      <section aria-labelledby="parque" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="parque" className="text-lg font-semibold">Parque mantenido</h2>
          {reportsLink ? (
            <Link href="/app/informes" className="text-sm font-medium text-[var(--accent)]">
              Ver los informes
            </Link>
          ) : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard href="/app/clientes" label="Clientes" value={pci.customers} />
          <StatCard href="/app/instalaciones" label="Instalaciones" value={pci.installations} />
          <StatCard href="/app/equipos" label="Equipos PCI" value={pci.equipment} />
          <StatCard href="/app/equipos?categoria=extinguisher" label="Extintores" value={pci.extinguishers} />
        </div>
        <dl className="grid gap-4 sm:grid-cols-3">
          <Stat label="Actuaciones registradas (30 días)" value={pci.records30d} />
          <Stat label="Actuaciones programadas" value={pci.actionsScheduled} />
          <Stat label="Avisos enviados (30 días)" value={activity.remindersSent30d} />
        </dl>
      </section>

      {pci.recent.length ? (
        <section aria-labelledby="reciente" className="flex flex-col gap-3">
          <h2 id="reciente" className="text-lg font-semibold">Actividad reciente</h2>
          <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)] text-sm">
            {pci.recent.map((r) => (
              <li key={`${r.kind}-${r.refId}-${r.at}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <Link href={r.kind === "record" ? `/app/equipos/${r.refId}` : r.kind === "work_order" ? `/app/ordenes-trabajo/${r.refId}` : `/app/incidencias/${r.refId}`} className="font-medium text-[var(--accent)]">
                  {r.label}
                </Link>
                <span className="text-[var(--muted)]">
                  {r.installation} · {formatDateTime(r.at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <h2 className="text-lg font-semibold">Tu cuenta</h2>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Clientes" value={summary.customers} limit={plan ? limit(plan.maxCustomers) : undefined} />
        <Stat label="Equipos PCI en uso" value={pci.equipment} limit={plan ? limit(plan.maxEquipment) : undefined} />
        <Stat label="Usuarios" value={summary.members} limit={plan ? limit(plan.maxUsers) : undefined} />
        <Stat label="Delegaciones" value={summary.branches} limit={plan ? limit(plan.maxBranches) : undefined} />
      </dl>
      {summary.activeVehicles ? (
        <p className="text-xs text-[var(--muted)]">
          La cuenta conserva {summary.activeVehicles.toLocaleString("es-ES")} vehículos de la etapa anterior de RevisaYa. Se mantienen con su historial y se incluyen en la exportación de datos.
        </p>
      ) : null}
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
