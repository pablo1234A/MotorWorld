"use client";

import Link from "next/link";
import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import {
  completePasswordResetAction,
  requestPasswordResetAction,
  resendVerificationAction,
  signInAction,
  signUpAction,
} from "@/server/modules/auth/actions";
import type { ActionState } from "@/server/actions/result";

const initial: ActionState = { status: "idle" };

function fieldErrors(state: ActionState, name: string): string[] | undefined {
  return state.status === "error" ? state.fieldErrors?.[name] : undefined;
}

function value(state: ActionState, name: string): string | undefined {
  return state.status === "error" ? state.values?.[name] : undefined;
}

function FormMessage({ state }: { state: ActionState }) {
  if (state.status === "error" && !state.fieldErrors) return <Alert tone="error">{state.message}</Alert>;
  if (state.status === "error" && state.fieldErrors?._form) return <Alert tone="error">{state.fieldErrors._form[0]}</Alert>;
  if (state.status === "success" && state.message) return <Alert tone="success">{state.message}</Alert>;
  return null;
}

const PASSWORD_HINT = "Mínimo 10 caracteres, con mayúsculas, minúsculas y números.";

export function SignUpForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signUpAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" name="firstName" autoComplete="given-name" required defaultValue={value(state, "firstName")} errors={fieldErrors(state, "firstName")} />
        <Field label="Apellidos" name="lastName" autoComplete="family-name" required defaultValue={value(state, "lastName")} errors={fieldErrors(state, "lastName")} />
      </div>
      <Field label="Correo electrónico" name="email" type="email" autoComplete="email" required defaultValue={value(state, "email")} errors={fieldErrors(state, "email")} />
      <Field label="Contraseña" name="password" type="password" autoComplete="new-password" required hint={PASSWORD_HINT} errors={fieldErrors(state, "password")} />
      <Field label="Repite la contraseña" name="passwordConfirm" type="password" autoComplete="new-password" required errors={fieldErrors(state, "passwordConfirm")} />
      <SubmitButton pendingLabel="Creando cuenta…">Crear cuenta</SubmitButton>
      <p className="text-center text-sm text-[var(--muted)]">
        ¿Ya tienes cuenta?{" "}
        <Link className="font-medium text-[var(--accent)]" href={next ? `/acceso?next=${encodeURIComponent(next)}` : "/acceso"}>
          Inicia sesión
        </Link>
      </p>
    </form>
  );
}

export function SignInForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signInAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field label="Correo electrónico" name="email" type="email" autoComplete="email" required defaultValue={value(state, "email")} errors={fieldErrors(state, "email")} />
      <Field label="Contraseña" name="password" type="password" autoComplete="current-password" required errors={fieldErrors(state, "password")} />
      <SubmitButton pendingLabel="Entrando…">Iniciar sesión</SubmitButton>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <Link className="font-medium text-[var(--accent)]" href="/recuperar">
          He olvidado mi contraseña
        </Link>
        <Link className="font-medium text-[var(--accent)]" href={next ? `/registro?next=${encodeURIComponent(next)}` : "/registro"}>
          Crear cuenta
        </Link>
      </div>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordResetAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <Field label="Correo electrónico" name="email" type="email" autoComplete="email" required defaultValue={value(state, "email")} errors={fieldErrors(state, "email")} />
      <SubmitButton pendingLabel="Enviando…">Enviar enlace</SubmitButton>
      <Link className="text-center text-sm font-medium text-[var(--accent)]" href="/acceso">
        Volver a iniciar sesión
      </Link>
    </form>
  );
}

export function ResendVerificationForm() {
  const [state, action] = useActionState(resendVerificationAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormMessage state={state} />
      <Field label="¿No te ha llegado? Escribe tu correo y te lo reenviamos" name="email" type="email" autoComplete="email" required errors={fieldErrors(state, "email")} />
      <SubmitButton variant="secondary" pendingLabel="Enviando…">
        Reenviar correo de verificación
      </SubmitButton>
    </form>
  );
}

export function NewPasswordForm() {
  const [state, action] = useActionState(completePasswordResetAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <Field label="Contraseña nueva" name="password" type="password" autoComplete="new-password" required hint={PASSWORD_HINT} errors={fieldErrors(state, "password")} />
      <Field label="Repite la contraseña" name="passwordConfirm" type="password" autoComplete="new-password" required errors={fieldErrors(state, "passwordConfirm")} />
      <SubmitButton pendingLabel="Guardando…">Guardar contraseña</SubmitButton>
    </form>
  );
}
