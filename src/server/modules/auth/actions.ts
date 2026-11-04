"use server";

import { sql } from "kysely";
import { redirect } from "next/navigation";

import {
  changePasswordSchema,
  emailOnlySchema,
  newPasswordSchema,
  profileSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validation/auth";
import { type ActionState, parseForm, runAction } from "@/server/actions/result";
import { requireUser } from "@/server/auth/guards";
import { withRls } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";
import { clientIp, safeNextPath } from "@/server/http/request";
import { logger } from "@/server/logger";
import { enforceRateLimits, RATE_LIMITS } from "@/server/security/rate-limit";
import { fingerprint } from "@/server/security/tokens";
import { createSupabaseServerClient } from "@/server/supabase/server";

function appUrl(path: string): string {
  return new URL(path, process.env.APP_URL ?? "http://localhost:3000").toString();
}

/** URL de confirmación de los correos de Auth: /auth/confirm?next=… (ver supabase/templates). */
function confirmUrl(next: string): string {
  return appUrl(`/auth/confirm?next=${encodeURIComponent(next)}`);
}

async function audit(userId: string, action: string): Promise<void> {
  try {
    await withRls({ userId }, (tx) =>
      sql`select app.write_audit(null, ${action}, 'user', ${userId}, '{}'::jsonb)`.execute(tx),
    );
  } catch (err) {
    // La auditoría nunca debe impedir el inicio de sesión, pero sí quedar registrada como fallo.
    logger.error("audit_failed", { action, error: err });
  }
}

// ---------------------------------------------------------------- registro
export async function signUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "auth.sign_up",
    async () => {
      const input = parseForm(signUpSchema, formData);
      const ip = await clientIp();
      await enforceRateLimits([[`signup:ip:${ip}`, RATE_LIMITS.signUpPerIp]]);

      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          emailRedirectTo: confirmUrl(safeNextPath(input.next, "/onboarding")),
          data: { first_name: input.firstName, last_name: input.lastName },
        },
      });
      if (error) {
        if (error.code === "weak_password") {
          return { status: "error", code: "validation_error", message: "La contraseña es demasiado débil.", fieldErrors: { password: ["Elige una contraseña más segura"] } };
        }
        if (error.status === 429) throw new DomainError("rate_limited");
        // Email ya registrado: Supabase no lo revela con confirmación activa; tampoco nosotros.
        logger.warn("auth_sign_up_error", { code: error.code, status: error.status });
        if (error.code !== "user_already_exists") throw new DomainError("internal_error");
      }
      redirect("/verifica-tu-correo");
    },
    formData,
  );
}

export async function resendVerificationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "auth.resend_verification",
    async () => {
      const { email } = parseForm(emailOnlySchema, formData);
      await enforceRateLimits([[`resend:email:${fingerprint(email)}`, RATE_LIMITS.resendVerificationPerEmail]]);
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: confirmUrl("/onboarding") },
      });
      if (error && error.status === 429) throw new DomainError("rate_limited");
      // Mismo mensaje exista o no la cuenta (no revelar qué correos están registrados).
      return { status: "success", message: "Si hay una cuenta pendiente de verificar con ese correo, te hemos enviado un nuevo enlace." };
    },
    formData,
  );
}

// ------------------------------------------------------------------ acceso
export async function signInAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "auth.sign_in",
    async () => {
      const input = parseForm(signInSchema, formData);
      const ip = await clientIp();
      await enforceRateLimits([
        [`signin:ip:${ip}`, RATE_LIMITS.signInPerIp],
        [`signin:email:${fingerprint(input.email)}`, RATE_LIMITS.signInPerEmail],
      ]);

      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
      if (error || !data.user) {
        if (error?.code === "email_not_confirmed") {
          return { status: "error", code: "email_not_confirmed", message: "Tienes que verificar tu correo antes de entrar. Revisa tu bandeja de entrada.", values: { email: input.email } };
        }
        if (error?.status === 429) throw new DomainError("rate_limited");
        return { status: "error", code: "invalid_credentials", message: "Correo o contraseña incorrectos.", values: { email: input.email } };
      }
      await audit(data.user.id, "auth.signed_in");
      redirect(safeNextPath(input.next, "/app"));
    },
    formData,
  );
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  await supabase.auth.signOut({ scope: "local" });
  if (data?.claims?.sub) await audit(data.claims.sub, "auth.signed_out");
  redirect("/acceso");
}

export async function signOutEverywhereAction(): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "global" });
  await audit(user.id, "auth.signed_out_everywhere");
  redirect("/acceso");
}

// --------------------------------------------------------- contraseñas
export async function requestPasswordResetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "auth.password_reset_requested",
    async () => {
      const { email } = parseForm(emailOnlySchema, formData);
      const ip = await clientIp();
      await enforceRateLimits([
        [`reset:ip:${ip}`, RATE_LIMITS.passwordResetPerIp],
        [`reset:email:${fingerprint(email)}`, RATE_LIMITS.passwordResetPerEmail],
      ]);
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: confirmUrl("/cuenta/nueva-contrasena"),
      });
      if (error) logger.warn("auth_reset_error", { code: error.code, status: error.status });
      return {
        status: "success",
        message: "Si existe una cuenta con ese correo, te hemos enviado un enlace para crear una contraseña nueva.",
      };
    },
    formData,
  );
}

/** Tras abrir el enlace de recuperación (sesión temporal creada por /auth/confirm). */
export async function completePasswordResetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("auth.password_reset_completed", async () => {
    const user = await requireUser();
    const input = parseForm(newPasswordSchema, formData);
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({ password: input.password });
    if (error) {
      logger.warn("auth_update_password_error", { code: error.code, status: error.status });
      if (error.code === "same_password") {
        return { status: "error", code: "validation_error", message: "La nueva contraseña debe ser distinta de la anterior.", fieldErrors: { password: ["Elige otra contraseña"] } };
      }
      if (error.code === "reauthentication_needed") {
        return { status: "error", code: "reauthentication_needed", message: "El enlace ha caducado. Solicita uno nuevo." };
      }
      throw new DomainError("internal_error");
    }
    await audit(user.id, "auth.password_changed");
    redirect("/app");
  });
}

/** Cambio de contraseña desde la cuenta: exige la contraseña actual. */
export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("auth.password_changed", async () => {
    const user = await requireUser();
    const input = parseForm(changePasswordSchema, formData);
    await enforceRateLimits([[`signin:email:${fingerprint(user.email)}`, RATE_LIMITS.signInPerEmail]]);

    const supabase = await createSupabaseServerClient();
    // Reautenticación: verifica la contraseña actual (y deja una sesión reciente,
    // requisito de Supabase Auth con secure_password_change).
    const check = await supabase.auth.signInWithPassword({ email: user.email, password: input.currentPassword });
    if (check.error) {
      return { status: "error", code: "invalid_credentials", message: "La contraseña actual no es correcta.", fieldErrors: { currentPassword: ["Contraseña incorrecta"] } };
    }
    const { error } = await supabase.auth.updateUser({ password: input.password });
    if (error) {
      logger.warn("auth_change_password_error", { code: error.code, status: error.status });
      throw new DomainError("internal_error");
    }
    await audit(user.id, "auth.password_changed");
    return { status: "success", message: "Contraseña actualizada." };
  });
}

// ----------------------------------------------------------------- perfil
export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "profile.updated",
    async () => {
      const user = await requireUser();
      const input = parseForm(profileSchema, formData);
      await withRls({ userId: user.id }, (tx) =>
        tx.updateTable("profiles").set({ first_name: input.firstName, last_name: input.lastName }).where("id", "=", user.id).execute(),
      );
      return { status: "success", message: "Datos guardados." };
    },
    formData,
  );
}
