"use client";
import { fmtNum } from "@/lib/format";
import { useState } from "react";
import { Check } from "lucide-react";
import clsx from "clsx";
import { api, ApiError } from "@/lib/api";
import { formatEur } from "@/lib/money";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Display";
import { PLANS, TRIAL_DAYS } from "@/config/plans";

type Price = { baseCents: number; vatCents: number; totalCents: number };
export type PlanInfo = { code: string; name: string; monthlyEmailLimit: number; monthlySmsLimit: number; available: boolean; annualAvailable: boolean; price: Price; annualPrice: Price };

export function IntervalToggle({ value, onChange }: { value: "month" | "year"; onChange: (v: "month" | "year") => void }) {
  return (
    <div className="inline-flex rounded-full border border-ink-200 bg-white p-1 text-sm" role="group" aria-label="Periodo de facturación">
      {(["month", "year"] as const).map((v) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)} className={clsx("rounded-full px-4 py-1.5 font-medium transition-colors", value === v ? "bg-ink-800 text-white" : "text-ink-600 hover:text-ink-900")}>
          {v === "month" ? "Mensual" : (<>Anual <span className={clsx("ml-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold", value === v ? "bg-star-300 text-ink-900" : "bg-star-100 text-star-800")}>2 meses gratis</span></>)}
        </button>
      ))}
    </div>
  );
}

export function PlanPicker({
  plans, currentPlan, currentInterval, mode, returnTo = "billing", stripeConfigured, trialAvailable, onChanged,
}: {
  plans: PlanInfo[]; currentPlan?: string | null; currentInterval?: "month" | "year"; mode: "checkout" | "change"; returnTo?: "onboarding" | "billing";
  stripeConfigured: boolean; trialAvailable?: boolean; onChanged?: () => void;
}) {
  const [interval, setInterval] = useState<"month" | "year">(currentInterval ?? "month");
  const [loading, setLoading] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const act = async (code: string) => {
    setLoading(code);
    setErr(null);
    try {
      if (mode === "checkout") {
        const r = await api<{ url: string }>("/api/v1/billing/checkout", { body: { plan: code, interval, returnTo } });
        window.location.href = r.url;
        return;
      }
      await api("/api/v1/billing/change-plan", { body: { plan: code, interval } });
      onChanged?.();
    } catch (e) {
      setErr((e as ApiError).message);
    }
    setLoading(null);
  };
  return (
    <div>
      {!stripeConfigured ? (
        <Alert tone="warn" title="Pagos no configurados" className="mb-4">
          El servidor no tiene las credenciales de Stripe (STRIPE_SECRET_KEY, precios y webhook). Hasta configurarlas no es posible contratar un plan.
        </Alert>
      ) : null}
      {err ? <Alert tone="bad" className="mb-4">{err}</Alert> : null}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <IntervalToggle value={interval} onChange={setInterval} />
        {mode === "checkout" && trialAvailable ? <p className="text-sm font-medium text-ok-700">{TRIAL_DAYS} días gratis · cancela antes y no pagas nada</p> : null}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => {
          const def = PLANS.find((d) => d.code === p.code);
          const current = currentPlan === p.code && (currentInterval ?? "month") === interval;
          const price = interval === "year" ? p.annualPrice : p.price;
          const enabled = interval === "year" ? p.annualAvailable : p.available;
          return (
            <div key={p.code} className={clsx("flex flex-col rounded-xl border bg-white p-5", current ? "border-ink-800 ring-1 ring-ink-800" : "border-ink-200")}>
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold">{p.name}</h3>
                {current ? <span className="rounded-full bg-star-100 px-2 py-0.5 text-xs font-semibold text-star-800">Tu plan</span> : null}
              </div>
              <p className="mt-3 font-display text-3xl font-bold tabular-nums">
                {formatEur(interval === "year" ? Math.round(price.totalCents / 12) : price.totalCents)}
                <span className="text-sm font-normal text-ink-500">/mes</span>
              </p>
              <p className="mt-1 text-xs text-ink-500">
                {interval === "year" ? `${formatEur(price.totalCents)} al año · ` : ""}IVA incl. · Base {formatEur(price.baseCents)} + IVA {formatEur(price.vatCents)}
              </p>
              <p className="mt-4 text-sm font-semibold">
                {fmtNum(p.monthlyEmailLimit)} correos{p.monthlySmsLimit ? ` + ${p.monthlySmsLimit} SMS` : ""}/mes
              </p>
              <ul className="mt-3 flex-1 space-y-2 text-[13px] text-ink-600">
                {def?.highlights.slice(1, 6).map((h) => (
                  <li key={h} className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok-600" />{h}</li>
                ))}
              </ul>
              <Button className="mt-5 w-full" variant={current ? "secondary" : p.code === "PRO" ? "primary" : "secondary"} disabled={current || !enabled || !stripeConfigured} loading={loading === p.code} onClick={() => act(p.code)}>
                {current ? "Plan actual" : !enabled ? "No disponible" : mode === "checkout" ? (trialAvailable ? `Probar ${p.name} gratis` : `Contratar ${p.name}`) : `Cambiar a ${p.name}`}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
