"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import clsx from "clsx";
import { api, ApiError } from "@/lib/api";
import { formatEur } from "@/lib/money";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Display";
import { PLANS } from "@/config/plans";

export type PlanInfo = { code: string; name: string; monthlyEmailLimit: number; available: boolean; price: { baseCents: number; vatCents: number; totalCents: number } };

export function PlanPicker({ plans, currentPlan, mode, returnTo = "billing", stripeConfigured, onChanged }: { plans: PlanInfo[]; currentPlan?: string | null; mode: "checkout" | "change"; returnTo?: "onboarding" | "billing"; stripeConfigured: boolean; onChanged?: () => void }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const act = async (code: string) => {
    setLoading(code);
    setErr(null);
    try {
      if (mode === "checkout") {
        const r = await api<{ url: string }>("/api/v1/billing/checkout", { body: { plan: code, returnTo } });
        window.location.href = r.url;
        return;
      }
      await api("/api/v1/billing/change-plan", { body: { plan: code } });
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
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => {
          const def = PLANS.find((d) => d.code === p.code);
          const current = currentPlan === p.code;
          return (
            <div key={p.code} className={clsx("flex flex-col rounded-xl border bg-white p-5", current ? "border-ink-800 ring-1 ring-ink-800" : "border-ink-200")}>
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold">{p.name}</h3>
                {current ? <span className="rounded-full bg-star-100 px-2 py-0.5 text-xs font-semibold text-star-800">Tu plan</span> : null}
              </div>
              <p className="mt-3 font-display text-3xl font-bold tabular-nums">{formatEur(p.price.totalCents)}<span className="text-sm font-normal text-ink-500">/mes</span></p>
              <p className="mt-1 text-xs text-ink-500">IVA incl. · Base {formatEur(p.price.baseCents)} + IVA {formatEur(p.price.vatCents)}</p>
              <p className="mt-4 text-sm font-semibold">Hasta {p.monthlyEmailLimit} correos/mes</p>
              <ul className="mt-3 flex-1 space-y-2 text-[13px] text-ink-600">
                {def?.highlights.slice(1, 5).map((h) => (
                  <li key={h} className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok-600" />{h}</li>
                ))}
              </ul>
              <Button className="mt-5 w-full" variant={current ? "secondary" : p.code === "PRO" ? "primary" : "secondary"} disabled={current || !p.available || !stripeConfigured} loading={loading === p.code} onClick={() => act(p.code)}>
                {current ? "Plan actual" : mode === "checkout" ? `Contratar ${p.name}` : `Cambiar a ${p.name}`}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
