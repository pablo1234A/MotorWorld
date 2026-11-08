"use server";

import { sql } from "kysely";
import { redirect } from "next/navigation";
import { z } from "zod";

import { type ActionState, parseForm, runAction } from "@/server/actions/result";
import { requireUser } from "@/server/auth/guards";
import { getPendingMfaUser, hasVerifiedFactor } from "@/server/auth/session";
import { withRls } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";
import { safeNextPath } from "@/server/http/request";
import { logger } from "@/server/logger";
import { enforceRateLimits, RATE_LIMITS } from "@/server/security/rate-limit";
import { createSupabaseServerClient } from "@/server/supabase/server";

/**
 * Verificación en dos pasos (TOTP de Supabase Auth, ADR-075): activar con una
 * app de autenticación, desactivar (con un código) y el segundo paso del
 * inicio de sesión. Los códigos y el secreto nunca se registran.
 */

const codeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Escribe los 6 números de tu app de autenticación") });

async function audit(userId: string, action: string) {
  await withRls({ userId }, (tx) => sql`select app.write_audit(null, ${action}, 'user', ${userId}, '{}'::jsonb)`.execute(tx)).catch((err) =>
    logger.error("audit_failed", { action, error: err }),
  );
}

async function verifiedTotp(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new DomainError("internal_error");
  return data.totp[0] ?? null;
}

export type EnrollData = { factorId: string; qr: string; secret: string };

/** Paso 1: crea el factor y devuelve el QR y la clave para la app de autenticación. */
export async function startTotpEnrollAction(_prev: ActionState<EnrollData>, _formData: FormData): Promise<ActionState<EnrollData>> {
  return runAction("auth.mfa_enroll", async () => {
    const user = await requireUser();
    if (await hasVerifiedFactor(user.id)) throw new DomainError("conflict", "mfa_already_enabled");
    const supabase = await createSupabaseServerClient();
    // Quita intentos anteriores sin terminar.
    const { data: list } = await supabase.auth.mfa.listFactors();
    for (const f of list?.all ?? []) if (f.factor_type === "totp" && f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `RevisaYa ${new Date().toISOString().slice(0, 10)}`, issuer: "RevisaYa" });
    if (error || !data) {
      logger.warn("mfa_enroll_failed", { code: error?.code });
      throw new DomainError("internal_error");
    }
    return { status: "success", data: { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret } };
  });
}

/** Paso 2: confirma con el primer código. A partir de aquí, el acceso pide código. */
export async function confirmTotpEnrollAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("auth.mfa_confirm", async () => {
    const user = await requireUser();
    const { code, factorId } = parseForm(codeSchema.extend({ factorId: z.uuid() }), formData);
    await enforceRateLimits([[`mfa:user:${user.id}`, RATE_LIMITS.mfaVerifyPerUser]]);
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) return { status: "error", code: "validation_error", message: "El código no es correcto o ha caducado. Prueba con el siguiente.", fieldErrors: { code: ["Código no válido"] } };
    await audit(user.id, "auth.mfa_enabled");
    redirect("/app/cuenta?dos_pasos=activada");
  });
}

/** Desactivar exige un código actual (además de la sesión completa). */
export async function disableTotpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("auth.mfa_disable", async () => {
    const user = await requireUser();
    const { code } = parseForm(codeSchema, formData);
    await enforceRateLimits([[`mfa:user:${user.id}`, RATE_LIMITS.mfaVerifyPerUser]]);
    const supabase = await createSupabaseServerClient();
    const factor = await verifiedTotp(supabase);
    if (!factor) throw new DomainError("not_found");
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (error) return { status: "error", code: "validation_error", message: "El código no es correcto o ha caducado.", fieldErrors: { code: ["Código no válido"] } };
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (unenrollError) throw new DomainError("internal_error");
    await audit(user.id, "auth.mfa_disabled");
    redirect("/app/cuenta?dos_pasos=desactivada");
  });
}

/** Segundo paso del inicio de sesión. */
export async function verifyMfaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("auth.mfa_verify", async () => {
    const user = await getPendingMfaUser();
    if (!user) redirect("/acceso");
    const { code, next } = parseForm(codeSchema.extend({ next: z.string().optional() }), formData);
    await enforceRateLimits([[`mfa:user:${user.id}`, RATE_LIMITS.mfaVerifyPerUser]]);
    const supabase = await createSupabaseServerClient();
    const factor = await verifiedTotp(supabase);
    if (!factor) redirect("/acceso");
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (error) {
      await audit(user.id, "auth.mfa_failed");
      return { status: "error", code: "validation_error", message: "El código no es correcto o ha caducado.", fieldErrors: { code: ["Código no válido"] } };
    }
    await audit(user.id, "auth.mfa_verified");
    redirect(safeNextPath(next, "/app"));
  });
}
