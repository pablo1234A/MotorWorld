"use client";
import Link from "next/link";
import { useState } from "react";
import { Check } from "lucide-react";
import { buttonClass } from "@/components/ui/button-class";
import { IntervalToggle } from "@/components/app/PlanPicker";
import { PLANS, TRIAL_DAYS } from "@/config/plans";
import { formatEur, vatBreakdown } from "@/lib/money";

export function Pricing() {
  const [interval, setInterval] = useState<"month" | "year">("month");
  return (
    <>
      <div className="mt-8 flex justify-center"><IntervalToggle value={interval} onChange={setInterval} /></div>
      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {PLANS.map((p) => {
          const total = interval === "year" ? p.annualPriceCents : p.priceCents;
          const vat = vatBreakdown(total, p.vatRateBps);
          const featured = p.code === "PRO";
          return (
            <div key={p.code} className={`relative flex flex-col rounded-xl border p-6 sm:p-7 ${featured ? "border-ink-800 ring-1 ring-ink-800" : "border-ink-200"}`}>
              {featured ? <span className="absolute -top-3 left-6 rounded-full bg-star-300 px-3 py-0.5 text-xs font-semibold text-ink-900">Más elegido</span> : null}
              <h3 className="text-lg font-semibold">{p.name}</h3>
              <p className="mt-1 text-sm text-ink-500">{p.tagline}</p>
              <p className="mt-6 flex items-baseline gap-1">
                <span className="font-display text-[40px] font-bold tabular-nums leading-none">{formatEur(interval === "year" ? Math.round(total / 12) : total)}</span>
                <span className="text-sm text-ink-500">/mes</span>
              </p>
              <p className="mt-2 text-xs text-ink-500">
                {interval === "year" ? `${formatEur(total)} al año · ` : ""}IVA incluido · Base {formatEur(vat.baseCents)} + IVA {formatEur(vat.vatCents)}
              </p>
              <p className="mt-5 rounded-lg bg-cream-200 px-3 py-2 text-sm font-semibold">
                {p.monthlyEmailLimit.toLocaleString("es-ES")} correos{p.monthlySmsLimit ? ` + ${p.monthlySmsLimit} SMS` : ""} al mes
              </p>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm text-ink-700">
                {p.highlights.slice(1).map((h) => (
                  <li key={h} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-ok-600" /> {h}</li>
                ))}
              </ul>
              <Link href={`/registro?plan=${p.code}&periodo=${interval}`} className={buttonClass(featured ? "primary" : "secondary", "lg", "mt-7 w-full")}>
                Probar {TRIAL_DAYS} días gratis
              </Link>
            </div>
          );
        })}
      </div>
    </>
  );
}
