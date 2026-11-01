"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Eye, EyeOff, MailCheck } from "lucide-react";
import { Field, FormMessage, Input, Checkbox } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { requestPasswordReset, resendConfirmation, signIn, signUp, updatePassword } from "@/lib/actions/auth";
import { initialFormState } from "@/lib/actions/types";

function PasswordInput({ id, name, autoComplete, invalid }: { id: string; name: string; autoComplete: string; invalid?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input id={id} name={name} type={show ? "text" : "password"} autoComplete={autoComplete} required className="pr-11" aria-invalid={invalid} aria-describedby={`${id}-hint`} />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-subtle hover:text-navy"
        aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
      >
        {show ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
      </button>
    </div>
  );
}

export function SignInForm({ next, linkError }: { next?: string; linkError?: boolean }) {
  const [state, action] = useActionState(signIn, initialFormState);
  const fe = state.fieldErrors ?? {};
  return (
    <div className="space-y-5">
      {linkError && <FormMessage state={{ error: "El enlace no es válido o ha caducado. Inicia sesión o solicita uno nuevo." }} />}
      <form action={action} className="space-y-5" noValidate>
        <input type="hidden" name="next" value={next ?? "/panel"} />
        <Field id="email" label="Email" required error={fe.email}>
          <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={!!fe.email} />
        </Field>
        <Field id="password" label="Contraseña" required error={fe.password}>
          <PasswordInput id="password" name="password" autoComplete="current-password" invalid={!!fe.password} />
        </Field>
        <div className="flex justify-end">
          <Link href="/recuperar" className="text-sm text-link">
            ¿Has olvidado tu contraseña?
          </Link>
        </div>
        <FormMessage state={state.error ? { error: state.error } : null} />
        <SubmitButton className="w-full" pendingLabel="Accediendo…">
          Acceder
        </SubmitButton>
      </form>
      {fe.unconfirmed && <ResendConfirmation />}
    </div>
  );
}

function ResendConfirmation() {
  const [state, action] = useActionState(resendConfirmation, initialFormState);
  return (
    <form action={action} className="space-y-3 rounded-xl border border-line bg-sand/40 p-4">
      <p className="text-sm text-ink-soft">¿No encuentras el email de verificación?</p>
      <div className="flex gap-2">
        <Input name="email" type="email" placeholder="tu@email.com" required aria-label="Email" />
        <SubmitButton variant="secondary" size="md">
          Reenviar
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function SignUpForm({ acquisition, defaultAccountType = "business" }: { acquisition: Record<string, string>; defaultAccountType?: "business" | "agency" }) {
  const [state, action] = useActionState(signUp, initialFormState);
  const fe = state.fieldErrors ?? {};

  if (state.ok) {
    return (
      <div className="animate-rise text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-bg text-success">
          <MailCheck className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-xl font-semibold">Revisa tu email</h2>
        <p className="mt-2 text-[15px] text-muted">
          Te hemos enviado un enlace de verificación a <strong className="text-ink">{state.message}</strong>. Ábrelo para activar tu cuenta.
        </p>
        <p className="mt-4 text-sm text-subtle">Si no lo ves en unos minutos, revisa la carpeta de spam.</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5" noValidate>
      {Object.entries(acquisition).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <fieldset>
        <legend className="mb-2 block text-sm font-medium text-ink">Tipo de cuenta</legend>
        <div className="grid grid-cols-2 gap-2.5">
          {[
            { value: "business", title: "Mi negocio", body: "Textos legales de tu web" },
            { value: "agency", title: "Agencia o gestoría", body: "Webs de tus clientes" },
          ].map((o) => (
            <label
              key={o.value}
              className="relative cursor-pointer rounded-xl border border-line-strong bg-white px-3.5 py-3 transition-colors has-[:checked]:border-navy has-[:checked]:ring-1 has-[:checked]:ring-navy has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-blue/25"
            >
              <input type="radio" name="account_type" value={o.value} defaultChecked={o.value === defaultAccountType} className="sr-only" />
              <span className="block text-sm font-semibold text-navy-950">{o.title}</span>
              <span className="mt-0.5 block text-xs text-muted">{o.body}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field id="full_name" label="Nombre" required error={fe.full_name}>
        <Input id="full_name" name="full_name" autoComplete="name" required aria-invalid={!!fe.full_name} />
      </Field>
      <Field id="email" label="Email" required error={fe.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={!!fe.email} />
      </Field>
      <Field id="password" label="Contraseña" required error={fe.password} hint="Mínimo 10 caracteres, con letras y números.">
        <PasswordInput id="password" name="password" autoComplete="new-password" invalid={!!fe.password} />
      </Field>
      <div className="space-y-3">
        <Checkbox
          name="terms"
          required
          label={
            <>
              Acepto las <Link href="/legal/condiciones" className="text-blue underline underline-offset-2" target="_blank">condiciones de contratación</Link> y he leído la{" "}
              <Link href="/legal/privacidad" className="text-blue underline underline-offset-2" target="_blank">política de privacidad</Link>.
            </>
          }
        />
        {fe.terms && <p className="text-[13px] font-medium text-danger">{fe.terms}</p>}
        <Checkbox name="marketing" label="Quiero recibir novedades y consejos de Legalito por email (opcional)." />
      </div>
      <FormMessage state={state.error ? { error: state.error } : null} />
      <SubmitButton className="w-full" pendingLabel="Creando cuenta…">
        Crear cuenta
      </SubmitButton>
    </form>
  );
}

export function ResetRequestForm() {
  const [state, action] = useActionState(requestPasswordReset, initialFormState);
  if (state.ok) return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-5" noValidate>
      <Field id="email" label="Email de tu cuenta" required error={state.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <FormMessage state={state.error ? { error: state.error } : null} />
      <SubmitButton className="w-full" pendingLabel="Enviando…">
        Enviar enlace
      </SubmitButton>
    </form>
  );
}

export function NewPasswordForm() {
  const [state, action] = useActionState(updatePassword, initialFormState);
  const fe = state.fieldErrors ?? {};
  if (state.ok)
    return (
      <div className="space-y-4">
        <FormMessage state={state} />
        <Link href="/panel" className="block text-center text-sm text-link">
          Ir a mi panel
        </Link>
      </div>
    );
  return (
    <form action={action} className="space-y-5" noValidate>
      <Field id="password" label="Nueva contraseña" required error={fe.password} hint="Mínimo 10 caracteres, con letras y números.">
        <PasswordInput id="password" name="password" autoComplete="new-password" invalid={!!fe.password} />
      </Field>
      <Field id="confirm" label="Repite la contraseña" required error={fe.confirm}>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" invalid={!!fe.confirm} />
      </Field>
      <FormMessage state={state.error ? { error: state.error } : null} />
      <SubmitButton className="w-full" pendingLabel="Guardando…">
        Guardar contraseña
      </SubmitButton>
    </form>
  );
}
