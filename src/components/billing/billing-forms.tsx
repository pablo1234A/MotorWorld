"use client";

import { useActionState, useState } from "react";

import { SubmitButton } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-state";
import { PLAN_CODES, PLANS, type PlanCode } from "@/lib/plans";
import type { ActionState } from "@/server/actions/result";
import { cancelSubscriptionAction, changePlanAction, openPortalAction, startCheckoutAction } from "@/server/modules/billing/actions";

const idle: ActionState = { status: "idle" };
const eur = (cents: number) => (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const limit = (n: number | null, unit: string) => (n === null ? `${unit} ilimitados` : `${n.toLocaleString("es-ES")} ${unit}`);

const FEATURE_LABELS: Partial<Record<string, string>> = {
  km_reminders: "Avisos por kilometraje",
  google_calendar: "Google Calendar",
  reports: "Informes",
  multi_branch: "Varios talleres",
  priority_support: "Soporte prioritario",
  api: "API",
  custom_templates: "Plantillas a medida",
  included_domain: "Dominio incluido",
  account_manager: "Gestor de cuenta",
};

export function PlanPicker({
  mode,
  current,
  trialEligible,
  available,
}: {
  /** checkout: contratar; change: cambiar el plan de una suscripción de Stripe */
  mode: "checkout" | "change";
  current: { plan: PlanCode; interval: "month" | "year" } | null;
  trialEligible: boolean;
  available: boolean;
}) {
  const [interval, setInterval] = useState<"month" | "year">(current?.interval ?? "month");
  const [state, action] = useActionState(mode === "checkout" ? startCheckoutAction : changePlanAction, idle);
  return (
    <div className="flex flex-col gap-4">
      <FormMessage state={state} />
      <div role="radiogroup" aria-label="Periodicidad" className="flex gap-2 self-start rounded-lg bg-[var(--surface-2)] p-1 text-sm">
        {(["month", "year"] as const).map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={interval === i}
            onClick={() => setInterval(i)}
            className={`rounded-md px-3 py-1.5 ${interval === i ? "bg-[var(--surface)] font-semibold shadow-sm" : ""}`}
          >
            {i === "month" ? "Mensual" : "Anual (2 meses gratis)"}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLAN_CODES.map((code) => {
          const p = PLANS[code];
          const isCurrent = current?.plan === code && current.interval === interval;
          const price = interval === "month" ? p.priceMonthCents : p.priceYearCents;
          const extras = p.features.map((f) => FEATURE_LABELS[f]).filter(Boolean);
          return (
            <form key={code} action={action} className={`flex flex-col gap-3 rounded-xl border p-5 ${isCurrent ? "border-[var(--accent)]" : "border-[var(--border)]"} bg-[var(--surface)]`}>
              <input type="hidden" name="plan" value={code} />
              <input type="hidden" name="interval" value={interval} />
              <div>
                <h3 className="text-lg font-semibold">{p.name}</h3>
                <p className="text-2xl font-semibold tabular-nums">
                  {eur(price)}
                  <span className="text-sm font-normal text-[var(--muted)]">{interval === "month" ? "/mes" : "/año"} + IVA</span>
                </p>
              </div>
              <ul className="flex flex-col gap-1 text-sm text-[var(--muted)]">
                <li>{limit(p.maxCustomers, "clientes")}</li>
                <li>{limit(p.maxActiveVehicles, "vehículos activos")}</li>
                <li>{p.monthlyEmails.toLocaleString("es-ES")} correos al mes</li>
                <li>{limit(p.maxUsers, p.maxUsers === 1 ? "usuario" : "usuarios")}</li>
                {p.maxBranches !== null && p.maxBranches > 1 ? <li>Hasta {p.maxBranches} talleres</li> : p.maxBranches === null ? <li>Talleres ilimitados</li> : null}
                {extras.map((e) => (
                  <li key={e}>✓ {e}</li>
                ))}
              </ul>
              <div className="mt-auto">
                {isCurrent ? (
                  <p className="text-sm font-semibold text-[var(--accent)]">Tu plan actual</p>
                ) : available ? (
                  <SubmitButton
                    variant={mode === "checkout" ? "primary" : "secondary"}
                    pendingLabel={mode === "checkout" ? "Abriendo el pago…" : "Cambiando…"}
                    className="w-full"
                    aria-label={mode === "checkout" ? `Contratar ${p.name}` : `Cambiar a ${p.name}`}
                    onClick={(e) => {
                      if (mode === "change" && !window.confirm(`¿Cambiar al plan ${p.name}? Stripe prorrateará la diferencia en la próxima factura.`)) e.preventDefault();
                    }}
                  >
                    {mode === "checkout" ? (trialEligible ? "Empezar 7 días gratis" : "Contratar") : "Cambiar a este plan"}
                  </SubmitButton>
                ) : null}
              </div>
            </form>
          );
        })}
      </div>
    </div>
  );
}

export function PortalButton() {
  const [state, action] = useActionState(openPortalAction, idle);
  return (
    <form action={action} className="flex flex-col gap-2">
      <FormMessage state={state} />
      <SubmitButton variant="secondary" pendingLabel="Abriendo…">
        Tarjeta, datos de facturación y facturas
      </SubmitButton>
    </form>
  );
}

export function CancelButton({ cancelAtPeriodEnd, until }: { cancelAtPeriodEnd: boolean; until: string | null }) {
  const [state, action] = useActionState(cancelSubscriptionAction, idle);
  return (
    <form
      action={action}
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        if (!cancelAtPeriodEnd && !window.confirm(`¿Cancelar la suscripción? Seguirás teniendo acceso hasta ${until ?? "el final del periodo"}; después el taller quedará en solo lectura y los datos se conservarán 60 días.`))
          e.preventDefault();
      }}
    >
      <FormMessage state={state} />
      <input type="hidden" name="cancel" value={cancelAtPeriodEnd ? "false" : "true"} />
      <SubmitButton variant={cancelAtPeriodEnd ? "secondary" : "ghost"} pendingLabel="Guardando…">
        {cancelAtPeriodEnd ? "Mantener la suscripción" : "Cancelar la suscripción"}
      </SubmitButton>
    </form>
  );
}
