"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Check, Lock } from "lucide-react";
import { Checkbox, FormMessage } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { startCheckout } from "@/lib/actions/billing";
import { initialFormState } from "@/lib/actions/types";
import { cn } from "@/lib/cn";

export interface CheckoutPlan {
  code: string;
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  available: boolean;
  recommended?: boolean;
}

export function CheckoutForm({ plans, defaultPlan }: { plans: CheckoutPlan[]; defaultPlan?: string }) {
  const [state, action] = useActionState(startCheckout, initialFormState);
  const [selected, setSelected] = useState(defaultPlan ?? plans.find((p) => p.available)?.code ?? plans[0]?.code);

  return (
    <form action={action} className="space-y-6">
      <fieldset>
        <legend className="sr-only">Modalidad</legend>
        <div className="grid gap-4 md:grid-cols-2">
          {plans.map((p) => (
            <label
              key={p.code}
              className={cn(
                "relative flex cursor-pointer flex-col rounded-2xl border bg-white p-5 transition-[border-color,box-shadow] sm:p-6",
                selected === p.code ? "border-navy ring-1 ring-navy shadow-[var(--shadow-lift)]" : "border-line-strong hover:border-navy/40",
                !p.available && "cursor-not-allowed opacity-60",
              )}
            >
              {p.recommended && <span className="absolute -top-2.5 left-5 rounded-md bg-navy px-2 py-0.5 text-[11px] font-medium text-white">Recomendado</span>}
              <input type="radio" name="product" value={p.code} checked={selected === p.code} onChange={() => setSelected(p.code)} disabled={!p.available} className="sr-only" />
              <span className="flex items-start justify-between gap-3">
                <span>
                  <span className="block font-semibold text-navy-950">{p.name}</span>
                  <span className="mt-1 block text-sm text-muted">{p.description}</span>
                </span>
                <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", selected === p.code ? "border-navy bg-navy text-white" : "border-line-strong")}>
                  {selected === p.code && <Check className="h-3.5 w-3.5" />}
                </span>
              </span>
              <span className="mt-4 flex items-baseline gap-1.5">
                <span className="text-3xl font-semibold tabular-nums text-navy-950">{p.price}</span>
                <span className="text-sm text-muted">{p.period}</span>
              </span>
              <ul className="mt-4 space-y-2 text-sm text-ink-soft">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {f}
                  </li>
                ))}
              </ul>
              {!p.available && <span className="mt-3 text-xs font-medium text-warning">No disponible todavía</span>}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-3 rounded-xl border border-line bg-white p-5">
        <Checkbox
          name="terms"
          required
          label={
            <>
              Acepto las{" "}
              <Link href="/legal/condiciones" target="_blank" className="text-blue underline underline-offset-2">
                condiciones de contratación
              </Link>
              .
            </>
          }
        />
        <Checkbox
          name="immediate"
          required
          label="Solicito el acceso inmediato a los documentos y reconozco que, una vez generados, pierdo el derecho de desistimiento."
          description="Los documentos son contenido digital que se suministra en el momento (art. 103.m de la Ley General para la Defensa de los Consumidores y Usuarios)."
        />
      </div>

      <FormMessage state={state.error ? { error: state.error } : null} />

      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <SubmitButton size="lg" pendingLabel="Redirigiendo al pago seguro…">
          <Lock className="h-4 w-4" /> Continuar al pago
        </SubmitButton>
        <p className="text-xs text-muted">Pago seguro con Stripe. Legalito no almacena los datos de tu tarjeta.</p>
      </div>
    </form>
  );
}
