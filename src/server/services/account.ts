import "server-only";
import { randomUUID } from "node:crypto";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/config/env";
import { logger } from "@/lib/logger";
import { getAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import type { Db } from "@/lib/supabase/types";
import type { SessionContext } from "@/server/auth/session";
import { cancelWorkspaceSubscription } from "@/server/billing/stripe";
import { ApiError } from "@/server/http/errors";
import { fromDbError } from "@/server/http/handler";
import { AVATAR_MAX_BYTES, readImageUpload } from "@/server/security/files";
import { audit } from "./audit";

/** Verifica una contraseña sin tocar las cookies de la sesión actual. */
async function verifyPassword(email: string, password: string): Promise<boolean> {
  const env = getEnv();
  const client = createPlainClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) return false;
  await client.auth.signOut({ scope: "local" });
  return true;
}

export async function updateProfile(context: SessionContext, fullName: string) {
  const { error } = await context.supabase.from("profiles").update({ full_name: fullName }).eq("id", context.user.id);
  if (error) throw fromDbError(error);
  await context.supabase.auth.updateUser({ data: { full_name: fullName } });
}

export async function completeOnboarding(context: SessionContext) {
  const { error } = await context.supabase.from("profiles").update({ onboarding_completed_at: new Date().toISOString() }).eq("id", context.user.id);
  if (error) throw fromDbError(error);
}

export async function renameWorkspace(context: SessionContext, name: string) {
  if (context.role !== "owner" && context.role !== "admin") throw new ApiError("forbidden", "No tienes permiso para cambiar este espacio de trabajo.");
  const { error } = await context.supabase.from("workspaces").update({ name }).eq("id", context.workspace.id);
  if (error) throw fromDbError(error);
}

export async function changePassword(context: SessionContext, currentPassword: string, newPassword: string) {
  if (!(await verifyPassword(context.profile.email, currentPassword))) {
    throw new ApiError("validation_error", "La contraseña actual no es correcta.", { fields: { currentPassword: "La contraseña actual no es correcta." } });
  }
  const { error } = await context.supabase.auth.updateUser({ password: newPassword });
  if (error) throw new ApiError("validation_error", error.code === "same_password" ? "La nueva contraseña debe ser distinta de la actual." : "No se pudo cambiar la contraseña.");
  // Cierra el resto de sesiones abiertas con la contraseña anterior.
  await context.supabase.auth.signOut({ scope: "others" });
  await audit(context.supabase, { workspaceId: context.workspace.id, action: "account.password_changed", resourceType: "user", resourceId: context.user.id });
}

export async function signOutOtherSessions(context: SessionContext) {
  const { error } = await context.supabase.auth.signOut({ scope: "others" });
  if (error) throw new ApiError("internal_error", "No se pudieron cerrar las otras sesiones.");
}

const AVATAR_BUCKET = "avatars";

export async function getAvatarUrl(supabase: Db, path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function updateAvatar(context: SessionContext, file: unknown): Promise<string | null> {
  const upload = await readImageUpload(file, AVATAR_MAX_BYTES);
  const path = `${context.user.id}/${randomUUID()}.${upload.kind.extension}`;
  const stored = await context.supabase.storage.from(AVATAR_BUCKET).upload(path, upload.bytes, { contentType: upload.kind.mime, upsert: false });
  if (stored.error) throw new ApiError("internal_error", "No se pudo guardar la imagen.");
  const previous = context.profile.avatar_url;
  const { error } = await context.supabase.from("profiles").update({ avatar_url: path }).eq("id", context.user.id);
  if (error) {
    await context.supabase.storage.from(AVATAR_BUCKET).remove([path]);
    throw fromDbError(error);
  }
  if (previous) await context.supabase.storage.from(AVATAR_BUCKET).remove([previous]);
  return getAvatarUrl(context.supabase, path);
}

export async function removeAvatar(context: SessionContext) {
  const previous = context.profile.avatar_url;
  const { error } = await context.supabase.from("profiles").update({ avatar_url: null }).eq("id", context.user.id);
  if (error) throw fromDbError(error);
  if (previous) await context.supabase.storage.from(AVATAR_BUCKET).remove([previous]);
}

async function removeFolder(admin: Db, bucket: string, prefix: string) {
  // Recorre el árbol {prefijo}/{subcarpeta}/{archivo} y borra por lotes.
  const pending = [prefix];
  while (pending.length > 0) {
    const folder = pending.pop()!;
    for (;;) {
      const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 100 });
      if (error || !data || data.length === 0) break;
      const files = data.filter((entry) => entry.id !== null).map((entry) => `${folder}/${entry.name}`);
      const folders = data.filter((entry) => entry.id === null).map((entry) => `${folder}/${entry.name}`);
      pending.push(...folders);
      if (files.length === 0) break;
      const removed = await admin.storage.from(bucket).remove(files);
      if (removed.error) break;
      if (data.length < 100 && folders.length === 0) break;
    }
  }
}

/**
 * Eliminación definitiva de la cuenta: cancela la suscripción, borra los archivos de
 * Storage y elimina el usuario de Auth (el resto de datos cae por ON DELETE CASCADE).
 */
export async function deleteAccount(context: SessionContext, password: string) {
  if (!hasAdminClient()) throw new ApiError("not_configured", "La eliminación de cuentas no está disponible: falta la configuración del servidor.");
  if (!(await verifyPassword(context.profile.email, password))) {
    throw new ApiError("validation_error", "La contraseña no es correcta.", { fields: { password: "La contraseña no es correcta." } });
  }
  const admin = getAdminClient();
  const { data: owned } = await admin.from("workspaces").select("id").eq("owner_id", context.user.id);

  for (const workspace of owned ?? []) {
    try {
      await cancelWorkspaceSubscription(workspace.id);
    } catch (error) {
      logger.error("account.delete.cancel_subscription_failed", { workspaceId: workspace.id, error });
      throw new ApiError("internal_error", "No se pudo cancelar tu suscripción. Cancélala desde el portal de facturación e inténtalo de nuevo.");
    }
    for (const bucket of ["product-images", "imports", "exports"]) await removeFolder(admin, bucket, workspace.id);
  }
  await removeFolder(admin, AVATAR_BUCKET, context.user.id);

  await admin.from("audit_logs").insert({ actor_id: null, action: "account.deleted", resource_type: "user", resource_id: context.user.id, metadata: { workspaces: (owned ?? []).length } });
  const { error } = await admin.auth.admin.deleteUser(context.user.id);
  if (error) {
    logger.error("account.delete_failed", { userId: context.user.id, error: error.message });
    throw new ApiError("internal_error", "No se pudo eliminar la cuenta. Inténtalo de nuevo.");
  }
  await context.supabase.auth.signOut({ scope: "local" });
}
