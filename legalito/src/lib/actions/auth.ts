"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, siteUrl } from "@/lib/env";
import { audit, rateLimit } from "@/lib/observability";
import { ipHash } from "@/lib/request";
import { safeNextPath } from "@/lib/safe-redirect";
import { fieldErrorsFrom, type FormState } from "./types";

const NOT_CONFIGURED: FormState = { error: "La autenticación no está configurada en este entorno (faltan las variables de Supabase)." };

const password = z
  .string()
  .min(10, "La contraseña debe tener al menos 10 caracteres.")
  .max(128, "La contraseña es demasiado larga.")
  .regex(/[A-Za-z]/, "Incluye al menos una letra.")
  .regex(/[0-9]/, "Incluye al menos un número.");

const signUpSchema = z.object({
  full_name: z.string().trim().min(2, "Indica tu nombre.").max(160),
  email: z.string().trim().toLowerCase().email("Introduce un email válido."),
  password,
  terms: z.literal("on", { message: "Debes aceptar las condiciones y la política de privacidad." }),
  marketing: z.string().optional(),
  utm_source: z.string().max(100).optional(),
  utm_medium: z.string().max(100).optional(),
  utm_campaign: z.string().max(100).optional(),
  ref: z.string().max(100).optional(),
});

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisa los campos marcados.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  if (!(await rateLimit(`signup:${await ipHash()}`, 8, 3600))) {
    return { error: "Demasiados intentos de registro. Inténtalo de nuevo más tarde." };
  }
  const d = parsed.data;
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.signUp({
    email: d.email,
    password: d.password,
    options: {
      emailRedirectTo: `${siteUrl()}/auth/confirm?next=/panel`,
      data: {
        full_name: d.full_name,
        marketing_consent: d.marketing === "on",
        acquisition: Object.fromEntries(
          Object.entries({ utm_source: d.utm_source, utm_medium: d.utm_medium, utm_campaign: d.utm_campaign, ref: d.ref }).filter(([, v]) => v),
        ),
      },
    },
  });
  if (error) {
    if (/password/i.test(error.message)) return { error: "La contraseña no cumple los requisitos de seguridad.", fieldErrors: { password: error.message } };
    // Mensaje genérico: no se revela si el email ya está registrado.
    if (!/already|registered/i.test(error.message)) return { error: "No hemos podido crear la cuenta. Inténtalo de nuevo." };
  }
  return { ok: true, message: d.email };
}

const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email("Introduce un email válido."),
  password: z.string().min(1, "Introduce tu contraseña."),
  next: z.string().optional(),
});

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisa los campos marcados.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  if (!(await rateLimit(`signin:${await ipHash()}`, 20, 900))) {
    return { error: "Demasiados intentos. Espera unos minutos antes de volver a intentarlo." };
  }
  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) {
    if (/not confirmed/i.test(error.message)) {
      return { error: "Tu email todavía no está verificado. Revisa tu bandeja de entrada o solicita un nuevo enlace.", fieldErrors: { unconfirmed: "1" } };
    }
    return { error: "Email o contraseña incorrectos." };
  }
  await audit({ actorId: data.user.id, action: "auth.sign_in" }, { withIp: true });
  redirect(safeNextPath(parsed.data.next));
}

export async function resendConfirmation(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const email = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));
  if (!email.success) return { error: "Introduce un email válido." };
  if (!(await rateLimit(`resend:${await ipHash()}`, 5, 3600))) return { error: "Has solicitado varios enlaces. Inténtalo más tarde." };
  const supabase = await createSessionClient();
  await supabase.auth.resend({ type: "signup", email: email.data, options: { emailRedirectTo: `${siteUrl()}/auth/confirm?next=/panel` } });
  return { ok: true, message: "Si la cuenta existe y no está verificada, te hemos enviado un nuevo enlace." };
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const email = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));
  if (!email.success) return { error: "Introduce un email válido.", fieldErrors: { email: "Introduce un email válido." } };
  if (!(await rateLimit(`reset:${await ipHash()}`, 5, 3600))) return { error: "Has solicitado varios enlaces. Inténtalo más tarde." };
  const supabase = await createSessionClient();
  await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: `${siteUrl()}/auth/confirm?next=/nueva-contrasena` });
  // Respuesta idéntica exista o no la cuenta.
  return { ok: true, message: "Si existe una cuenta con ese email, recibirás un enlace para crear una nueva contraseña." };
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = z
    .object({ password, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: "Las contraseñas no coinciden.", path: ["confirm"] })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisa los campos marcados.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const supabase = await createSessionClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { error: "El enlace ha caducado. Solicita uno nuevo desde «He olvidado mi contraseña»." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "No hemos podido actualizar la contraseña. Prueba con otra diferente." };
  await audit({ actorId: user.user.id, action: "auth.password_changed" }, { withIp: true });
  return { ok: true, message: "Contraseña actualizada." };
}

export async function signOut(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createSessionClient();
    await supabase.auth.signOut();
  }
  redirect("/acceder");
}
