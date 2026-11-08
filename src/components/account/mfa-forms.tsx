"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { fieldErrors, FormMessage } from "@/components/ui/form-state";
import type { ActionState } from "@/server/actions/result";
import { confirmTotpEnrollAction, disableTotpAction, type EnrollData, startTotpEnrollAction, verifyMfaAction } from "@/server/modules/auth/mfa-actions";

const idle = { status: "idle" } as const;

function CodeField({ state }: { state: ActionState<unknown> }) {
  return (
    <Field
      label="Código de 6 números"
      name="code"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]{6}"
      maxLength={6}
      required
      errors={fieldErrors(state, "code")}
    />
  );
}

export function EnableMfa() {
  const [start, startAction] = useActionState<ActionState<EnrollData>, FormData>(startTotpEnrollAction, idle);
  const [confirm, confirmAction] = useActionState(confirmTotpEnrollAction, idle);
  const enroll = start.status === "success" ? start.data : undefined;
  if (!enroll) {
    return (
      <form action={startAction} className="flex flex-col gap-3">
        <FormMessage state={start} />
        <SubmitButton pendingLabel="Preparando…" className="self-start">
          Activar la verificación en dos pasos
        </SubmitButton>
      </form>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
        <li>Abre tu app de autenticación (Google Authenticator, Microsoft Authenticator, 1Password…).</li>
        <li>Escanea este código QR o escribe la clave a mano.</li>
        <li>Escribe el código de 6 números que te muestra la app.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element -- QR en SVG (data:) generado por Supabase Auth */}
      <img src={enroll.qr} alt="Código QR para la app de autenticación" className="h-44 w-44 rounded-lg border border-[var(--border)] bg-white p-2" />
      <p className="text-sm">
        Clave: <code className="break-all font-mono text-[13px]" data-testid="totp-secret">{enroll.secret}</code>
      </p>
      <form action={confirmAction} className="flex flex-col gap-3 sm:max-w-xs">
        <FormMessage state={confirm} />
        <input type="hidden" name="factorId" value={enroll.factorId} />
        <CodeField state={confirm} />
        <SubmitButton pendingLabel="Comprobando…">Confirmar y activar</SubmitButton>
      </form>
    </div>
  );
}

export function DisableMfa() {
  const [state, action] = useActionState(disableTotpAction, idle);
  return (
    <form action={action} className="flex flex-col gap-3 sm:max-w-xs">
      <FormMessage state={state} />
      <CodeField state={state} />
      <SubmitButton variant="secondary" pendingLabel="Desactivando…">
        Desactivar la verificación en dos pasos
      </SubmitButton>
    </form>
  );
}

export function VerifyMfaForm({ next }: { next?: string }) {
  const [state, action] = useActionState(verifyMfaAction, idle);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <CodeField state={state} />
      <SubmitButton pendingLabel="Comprobando…">Entrar</SubmitButton>
    </form>
  );
}
