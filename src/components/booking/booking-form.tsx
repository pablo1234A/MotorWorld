"use client";

import Script from "next/script";
import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { fieldErrors, FormMessage, sentValue } from "@/components/ui/form-state";
import type { ActionState } from "@/server/actions/result";
import { createBookingRequestAction } from "@/server/modules/appointments/public-actions";

const idle: ActionState = { status: "idle" };

export interface SlotDay {
  label: string;
  slots: Array<{ value: string; label: string }>;
}

export function BookingForm({
  slug,
  token,
  branchId,
  mode,
  prefill,
  minDate,
  maxDate,
  days,
  color,
  turnstileSiteKey,
}: {
  slug: string;
  token: string | null;
  branchId: string;
  mode: "free_request" | "slots";
  prefill: { name: string; email: string | null; phone: string | null; plate: string | null } | null;
  minDate: string;
  maxDate: string;
  days: SlotDay[];
  color: string;
  turnstileSiteKey: string | null;
}) {
  const [state, action] = useActionState(createBookingRequestAction, idle);
  const v = (name: string, fallback: string | null | undefined) => sentValue(state, name) ?? fallback ?? "";
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <input type="hidden" name="slug" value={slug} />
      {token ? <input type="hidden" name="token" value={token} /> : null}
      <input type="hidden" name="branchId" value={branchId} />
      {/* Campo trampa para robots: invisible y fuera del orden de tabulación. */}
      <div aria-hidden="true" className="absolute left-[-10000px] h-px w-px overflow-hidden">
        <label>
          No rellenes este campo
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <Field label="Nombre y apellidos" name="name" required autoComplete="name" defaultValue={v("name", prefill?.name)} errors={fieldErrors(state, "name")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Correo electrónico" name="email" type="email" autoComplete="email" defaultValue={v("email", prefill?.email)} errors={fieldErrors(state, "email")} />
        <Field label="Teléfono" name="phone" type="tel" autoComplete="tel" defaultValue={v("phone", prefill?.phone)} errors={fieldErrors(state, "phone")} />
      </div>
      <Field label="Matrícula" name="plate" defaultValue={v("plate", prefill?.plate)} errors={fieldErrors(state, "plate")} placeholder="1234 BCD" />

      {mode === "free_request" ? (
        <Field
          label="¿Qué día te vendría bien?"
          name="requestedDate"
          type="date"
          required
          min={minDate}
          max={maxDate}
          defaultValue={v("requestedDate", "")}
          errors={fieldErrors(state, "requestedDate")}
          hint="El taller te confirmará el día y la hora."
        />
      ) : days.length ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-medium">Elige un hueco</legend>
          {days.map((d) => (
            <div key={d.label} className="flex flex-col gap-2">
              <p className="text-sm font-medium text-[var(--muted)]">{d.label.charAt(0).toUpperCase() + d.label.slice(1)}</p>
              <div className="flex flex-wrap gap-2">
                {d.slots.map((s) => (
                  <label key={s.value} className="cursor-pointer">
                    <input type="radio" name="slot" value={s.value} required className="peer sr-only" />
                    <span className="inline-block rounded-lg border border-[var(--border)] px-3 py-2 text-sm tabular-nums peer-checked:border-transparent peer-checked:text-white peer-focus-visible:outline-2">
                      {s.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          <style>{`input[name="slot"]:checked + span { background: ${color}; }`}</style>
        </fieldset>
      ) : (
        <p className="rounded-lg bg-[var(--surface-2)] px-4 py-3 text-sm">No quedan huecos libres en las próximas semanas. Llama al taller o vuelve a intentarlo más adelante.</p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="message" className="text-sm font-medium">
          ¿Algo que debamos saber? (opcional)
        </label>
        <textarea
          id="message"
          name="message"
          rows={3}
          maxLength={2000}
          defaultValue={v("message", "")}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[15px] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)]"
        />
      </div>

      {turnstileSiteKey ? (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
          <div className="cf-turnstile" data-sitekey={turnstileSiteKey} data-language="es" />
        </>
      ) : null}

      <p className="text-xs text-[var(--muted)]">Tus datos se envían al taller solo para gestionar esta cita.</p>
      <SubmitButton pendingLabel="Enviando…" disabled={mode === "slots" && days.length === 0} style={{ background: color }}>
        Pedir cita
      </SubmitButton>
    </form>
  );
}
