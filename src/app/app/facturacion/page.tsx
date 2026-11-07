import type { Metadata } from "next";

import { CancelButton, PlanPicker, PortalButton } from "@/components/billing/billing-forms";
import { Alert, Card } from "@/components/ui/feedback";
import { formatDate, formatDateTime, localParts } from "@/lib/dates";
import { param } from "@/lib/pagination";
import { PLANS } from "@/lib/plans";
import { isAdmin } from "@/server/auth/context";
import { requireOrgPage } from "@/server/auth/guards";
import { getOverview } from "@/server/modules/billing/service";

export const metadata: Metadata = { title: "Facturación · RevisaYa" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const STATUS: Record<string, string> = {
  trialing: "Periodo de prueba",
  active: "Activa",
  past_due: "Pago pendiente",
  unpaid: "Impagada",
  canceled: "Cancelada",
  incomplete: "Pendiente de completar el pago",
  incomplete_expired: "Pago no completado",
  paused: "En pausa",
};
const INVOICE: Record<string, string> = { open: "Pendiente", paid: "Pagada", uncollectible: "Impagada", void: "Anulada", draft: "Borrador" };

export default async function BillingPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireOrgPage("/app/facturacion");
  if (!isAdmin(ctx)) return <Alert tone="error" title="Sin permiso">Solo los administradores del taller pueden gestionar la suscripción.</Alert>;
  const sp = await searchParams;
  const o = await getOverview(ctx);
  const s = o.subscription;
  const open = s && s.stripeManaged && ["trialing", "active", "past_due", "unpaid", "incomplete", "paused"].includes(s.status);
  const day = (d: Date | null) => (d ? formatDate(localParts(d).date) : null);
  const graceEnd = s?.pastDueSince ? new Date(s.pastDueSince.getTime() + 7 * 86_400_000) : null;
  const pricesReady = o.prices.length >= 8;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Facturación</h1>
        <p className="text-sm text-[var(--muted)]">Tu plan, la tarjeta y las facturas. Los pagos los gestiona Stripe: RevisaYa nunca ve los datos de tu tarjeta.</p>
      </div>

      {param(sp.pago) === "ok" ? (
        <Alert tone="success" title="¡Listo!">
          Stripe ha recibido tus datos. En unos segundos verás aquí tu suscripción (si no aparece, recarga la página).
        </Alert>
      ) : null}
      {param(sp.pago) === "cancelado" ? <Alert tone="info">Has salido del pago sin contratar. No se ha hecho ningún cargo.</Alert> : null}
      {param(sp.cambio) === "ok" ? <Alert tone="success">Plan cambiado. La diferencia se prorratea en tu próxima factura.</Alert> : null}
      {param(sp.cancelacion) === "programada" ? <Alert tone="success">Cancelación programada: mantienes el acceso hasta el final del periodo pagado.</Alert> : null}
      {param(sp.cancelacion) === "anulada" ? <Alert tone="success">Tu suscripción sigue activa.</Alert> : null}

      {!o.configured ? (
        <Alert tone="info" title="Pagos no configurados">
          Los pagos todavía no están activados en esta instalación de RevisaYa. No se hará ningún cargo.
        </Alert>
      ) : !pricesReady ? (
        <Alert tone="info">Los planes aún no están dados de alta en Stripe. Inténtalo más tarde.</Alert>
      ) : null}

      {s ? (
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold">
              Plan {PLANS[s.planCode].name} · {s.interval === "month" ? "mensual" : "anual"}
            </h2>
            <span className="text-sm font-medium">{STATUS[s.status] ?? s.status}</span>
          </div>
          {s.status === "trialing" && s.trialEnd ? (
            <p className="text-sm">Prueba gratuita hasta el {day(s.trialEnd)}. El primer cobro será ese día, salvo que canceles antes.</p>
          ) : null}
          {s.status === "past_due" ? (
            <Alert tone="warning" title="No hemos podido cobrar la última factura">
              Actualiza la tarjeta {graceEnd ? `antes del ${day(graceEnd)}` : "cuanto antes"}: después, el taller pasará a solo lectura y se pausarán los avisos.
            </Alert>
          ) : null}
          {s.status === "unpaid" ? <Alert tone="error">La suscripción está impagada: el taller está en solo lectura y no se envían avisos. Actualiza la tarjeta para reactivarla.</Alert> : null}
          {s.cancelAtPeriodEnd && s.currentPeriodEnd ? <p className="text-sm">Se cancelará el {day(s.currentPeriodEnd)}.</p> : null}
          {!s.cancelAtPeriodEnd && s.currentPeriodEnd && s.status === "active" ? <p className="text-sm text-[var(--muted)]">Próxima renovación: {day(s.currentPeriodEnd)}.</p> : null}
          {s.status === "canceled" || s.status === "incomplete_expired" ? (
            <Alert tone="warning" title="Suscripción terminada">
              El taller está en solo lectura.{o.dataRetentionUntil ? ` Tus datos se conservan hasta el ${formatDate(o.dataRetentionUntil)}; contrata un plan antes para no perderlos.` : ""}
            </Alert>
          ) : null}
          {o.configured && open ? (
            <div className="flex flex-wrap gap-3">
              <PortalButton />
              <CancelButton cancelAtPeriodEnd={s.cancelAtPeriodEnd} until={day(s.currentPeriodEnd)} />
            </div>
          ) : o.configured && o.hasCustomer ? (
            <PortalButton />
          ) : null}
        </Card>
      ) : (
        <Alert tone="info" title="Tu taller todavía no tiene plan">
          Elige uno para empezar. {o.trialEligible ? "Los 7 primeros días son gratis: pedimos la tarjeta al empezar, pero no se cobra nada hasta que termine la prueba." : ""}
        </Alert>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{open ? "Cambiar de plan" : "Planes"}</h2>
        <PlanPicker
          mode={open ? "change" : "checkout"}
          current={s && open ? { plan: s.planCode, interval: s.interval } : null}
          trialEligible={o.trialEligible}
          available={o.configured && pricesReady}
        />
        <p className="text-xs text-[var(--muted)]">Precios sin IVA. Se cobran por adelantado; puedes cancelar cuando quieras desde esta página.</p>
      </section>

      {o.invoices.length ? (
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Facturas</h2>
          <ul className="divide-y divide-[var(--border)] text-sm">
            {o.invoices.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span>
                  {formatDateTime(i.createdAt)} · {(i.amountDueCents / 100).toLocaleString("es-ES", { style: "currency", currency: i.currency.toUpperCase() })} · {INVOICE[i.status] ?? i.status}
                </span>
                <span className="flex gap-3">
                  {i.hostedUrl ? (
                    <a href={i.hostedUrl} target="_blank" rel="noreferrer" className="text-[var(--accent)]">
                      Ver
                    </a>
                  ) : null}
                  {i.pdfUrl ? (
                    <a href={i.pdfUrl} target="_blank" rel="noreferrer" className="text-[var(--accent)]">
                      PDF
                    </a>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
