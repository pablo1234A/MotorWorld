"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, fieldAria } from "@/components/ui/form";
import { ApiClientError, api, errorMessage } from "@/lib/api-client";
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from "@/validation/schemas";

/** Solo se aceptan destinos internos tras iniciar sesión. */
function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/app";
}

function EmailSent({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="text-center" role="status">
      <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-success-soft text-success">
        <MailCheck className="size-6" aria-hidden />
      </span>
      <h2 className="mt-5 text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{children}</p>
      <Link href="/login" className="mt-6 inline-block text-sm font-medium text-brand-strong hover:underline">
        Volver a iniciar sesión
      </Link>
    </div>
  );
}

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof loginSchema>>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        setFormError(null);
        try {
          await api("/api/auth/login", { body: values });
          // Navegación completa para que el servidor reciba las cookies de sesión recién creadas.
          window.location.assign(safeNext(next));
        } catch (error) {
          setFormError(errorMessage(error));
        }
      })}
    >
      {notice ? <p className="rounded-[10px] border border-warning/25 bg-warning-soft px-3.5 py-2.5 text-sm text-warning">{notice}</p> : null}
      <FormError message={formError} />
      <Field label="Correo electrónico" htmlFor="login-email" error={errors.email?.message}>
        <Input type="email" autoComplete="email" autoFocus {...fieldAria("login-email", errors.email?.message)} {...register("email")} />
      </Field>
      <Field
        label={
          <span className="flex w-full items-center justify-between">
            Contraseña
            <Link href="/recuperar" className="font-normal text-brand-strong hover:underline">
              ¿La has olvidado?
            </Link>
          </span>
        }
        htmlFor="login-password"
        error={errors.password?.message}
      >
        <Input type="password" autoComplete="current-password" {...fieldAria("login-password", errors.password?.message)} {...register("password")} />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
        Entrar
      </Button>
    </form>
  );
}

export function RegisterForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: "", email: "", password: "", confirmPassword: "", acceptTerms: false as unknown as true },
  });

  if (sentTo) {
    return (
      <EmailSent title="Revisa tu correo">
        Hemos enviado un enlace de confirmación a <strong className="text-ink">{sentTo}</strong>. Ábrelo para activar tu cuenta. Si no lo ves, mira en la carpeta de correo no deseado.
      </EmailSent>
    );
  }

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        setFormError(null);
        try {
          const result = await api<{ requiresEmailConfirmation: boolean }>("/api/auth/register", { body: values });
          if (result.requiresEmailConfirmation) setSentTo(values.email);
          else window.location.assign("/app?bienvenida=1");
        } catch (error) {
          if (error instanceof ApiClientError) {
            for (const [field, message] of Object.entries(error.fields)) setError(field as keyof typeof values, { message });
          }
          setFormError(errorMessage(error));
        }
      })}
    >
      <FormError message={formError} />
      <Field label="Nombre" htmlFor="register-name" error={errors.fullName?.message}>
        <Input autoComplete="name" autoFocus {...fieldAria("register-name", errors.fullName?.message)} {...register("fullName")} />
      </Field>
      <Field label="Correo electrónico" htmlFor="register-email" error={errors.email?.message}>
        <Input type="email" autoComplete="email" {...fieldAria("register-email", errors.email?.message)} {...register("email")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contraseña" htmlFor="register-password" error={errors.password?.message} hint="Mínimo 8 caracteres, con letras y números.">
          <Input type="password" autoComplete="new-password" {...fieldAria("register-password", errors.password?.message)} {...register("password")} />
        </Field>
        <Field label="Confirmar contraseña" htmlFor="register-confirm" error={errors.confirmPassword?.message}>
          <Input type="password" autoComplete="new-password" {...fieldAria("register-confirm", errors.confirmPassword?.message)} {...register("confirmPassword")} />
        </Field>
      </div>
      <div>
        <label className="flex items-start gap-2.5 text-sm leading-snug text-ink-soft">
          <Checkbox className="mt-0.5" aria-invalid={errors.acceptTerms ? true : undefined} aria-describedby={errors.acceptTerms ? "register-terms-error" : undefined} {...register("acceptTerms")} />
          <span>
            Acepto las{" "}
            <Link href="/legal/condiciones" target="_blank" className="font-medium text-brand-strong hover:underline">
              condiciones de uso
            </Link>{" "}
            y la{" "}
            <Link href="/legal/privacidad" target="_blank" className="font-medium text-brand-strong hover:underline">
              política de privacidad
            </Link>
            .
          </span>
        </label>
        {errors.acceptTerms ? (
          <p id="register-terms-error" role="alert" className="mt-1.5 text-[13px] text-danger">
            {errors.acceptTerms.message}
          </p>
        ) : null}
      </div>
      <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
        Crear cuenta
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof forgotPasswordSchema>>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });

  if (sent) {
    return <EmailSent title="Comprueba tu correo">Si existe una cuenta con esa dirección, recibirás un enlace para elegir una nueva contraseña. El enlace caduca en 1 hora.</EmailSent>;
  }
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        setFormError(null);
        try {
          await api("/api/auth/forgot-password", { body: values });
          setSent(true);
        } catch (error) {
          setFormError(errorMessage(error));
        }
      })}
    >
      <FormError message={formError} />
      <Field label="Correo electrónico" htmlFor="forgot-email" error={errors.email?.message}>
        <Input type="email" autoComplete="email" autoFocus {...fieldAria("forgot-email", errors.email?.message)} {...register("email")} />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
        Enviar enlace de recuperación
      </Button>
    </form>
  );
}

export function ResetPasswordForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof resetPasswordSchema>>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { password: "", confirmPassword: "" } });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        setFormError(null);
        try {
          await api("/api/auth/reset-password", { body: values });
          window.location.assign("/app?clave=actualizada");
        } catch (error) {
          setFormError(errorMessage(error));
        }
      })}
    >
      <FormError message={formError} />
      <Field label="Nueva contraseña" htmlFor="reset-password" error={errors.password?.message} hint="Mínimo 8 caracteres, con letras y números.">
        <Input type="password" autoComplete="new-password" autoFocus {...fieldAria("reset-password", errors.password?.message)} {...register("password")} />
      </Field>
      <Field label="Confirmar contraseña" htmlFor="reset-confirm" error={errors.confirmPassword?.message}>
        <Input type="password" autoComplete="new-password" {...fieldAria("reset-confirm", errors.confirmPassword?.message)} {...register("confirmPassword")} />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
        Guardar nueva contraseña
      </Button>
    </form>
  );
}
