"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ACTIVE_ORG_COOKIE, requireOrganization } from "@/lib/auth";
import { createSessionClient } from "@/lib/supabase/server";
import { audit, logError, rateLimit } from "@/lib/observability";
import { trackServer } from "@/lib/analytics-server";
import { fieldErrorsFrom, type FormState } from "./types";

/**
 * Modo agencia / gestoría. Toda la autorización ocurre en servidor y en base
 * de datos: las cuentas se comprueban contra las membresías del usuario (RLS)
 * y la jerarquía la protegen restricciones y disparadores de PostgreSQL.
 */

const uuid = z.string().uuid();
const clientSchema = z.object({
  name: z.string().trim().min(1, "Indica el nombre del cliente.").max(120, "Máximo 120 caracteres."),
  notes: z.string().trim().max(500, "Máximo 500 caracteres.").optional(),
});

/** Rutas a las que se puede volver tras cambiar de cuenta (nunca una URL arbitraria). */
const RETURN_PATHS = ["/panel", "/panel/generador", "/panel/documentos", "/panel/datos", "/panel/clientes"] as const;

async function setActiveCookie(orgId: string | null) {
  const jar = await cookies();
  if (!orgId) {
    jar.delete(ACTIVE_ORG_COOKIE);
    return;
  }
  jar.set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && !process.env.LEGALITO_TEST_BACKEND,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

/** Activa el modo agencia en la cuenta principal. */
export async function enableAgencyMode(): Promise<void> {
  const { user, account } = await requireOrganization();
  if (!account.isAgency) {
    const db = await createSessionClient();
    const { error } = await db.from("organizations").update({ account_type: "agency" }).eq("id", account.root.id);
    if (error) {
      await logError("clients.enable_agency", error, { organizationId: account.root.id });
      redirect("/panel/clientes?error=activar");
    }
    await audit({ actorId: user.id, action: "account.agency_enabled", entityType: "organization", entityId: account.root.id, organizationId: account.root.id });
    await trackServer("agency_enabled", { userId: user.id });
  }
  revalidatePath("/panel", "layout");
  redirect("/panel/clientes");
}

/** Vuelve a cuenta de negocio (solo sin clientes activos: lo exige la base de datos). */
export async function disableAgencyMode(): Promise<void> {
  const { user, account } = await requireOrganization();
  if (!account.isAgency) redirect("/panel/clientes");
  const db = await createSessionClient();
  const { error } = await db.from("organizations").update({ account_type: "business" }).eq("id", account.root.id);
  if (error) redirect("/panel/clientes?error=desactivar");
  await setActiveCookie(null);
  await audit({ actorId: user.id, action: "account.agency_disabled", entityType: "organization", entityId: account.root.id, organizationId: account.root.id });
  revalidatePath("/panel", "layout");
  redirect("/panel");
}

/** Alta de un cliente y paso directo a su formulario. */
export async function createClient(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, account } = await requireOrganization();
  if (!account.isAgency) return { error: "Activa el modo agencia para añadir clientes." };
  const parsed = clientSchema.safeParse({ name: formData.get("name") ?? "", notes: formData.get("notes") || undefined });
  if (!parsed.success) return { error: "Revisa los campos marcados.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  if (!(await rateLimit(`client_create:${user.id}`, 60, 3600))) return { error: "Has añadido muchos clientes en poco tiempo. Inténtalo más tarde." };

  const db = await createSessionClient();
  const { data: id, error } = await db.rpc("create_client_organization", { p_name: parsed.data.name });
  if (error || typeof id !== "string") {
    if (error && /máximo/.test(error.message)) return { error: "Has alcanzado el máximo de clientes activos. Archiva los que ya no gestiones." };
    await logError("clients.create", error ?? new Error("Sin id"), { organizationId: account.root.id });
    return { error: "No hemos podido crear el cliente. Inténtalo de nuevo." };
  }
  if (parsed.data.notes) await db.from("organizations").update({ client_notes: parsed.data.notes }).eq("id", id);
  await trackServer("client_created", { userId: user.id });
  await setActiveCookie(id);
  revalidatePath("/panel", "layout");
  redirect("/panel/generador?cliente=nuevo");
}

/** Cambia la cuenta en la que se trabaja (la principal o un cliente no archivado). */
export async function switchAccount(formData: FormData): Promise<void> {
  const { account } = await requireOrganization();
  const id = uuid.safeParse(formData.get("org"));
  const next = RETURN_PATHS.find((p) => p === formData.get("next")) ?? "/panel";
  if (!id.success) redirect(next);
  if (id.data === account.root.id) {
    await setActiveCookie(null);
  } else {
    const client = account.clients.find((c) => c.id === id.data && !c.archived_at);
    if (!client) redirect("/panel/clientes?error=cliente");
    await setActiveCookie(client.id);
  }
  revalidatePath("/panel", "layout");
  redirect(next);
}

/** Edita el nombre y las notas internas de un cliente. */
export async function updateClient(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, account } = await requireOrganization();
  const id = uuid.safeParse(formData.get("id"));
  const client = id.success ? account.clients.find((c) => c.id === id.data) : undefined;
  if (!client) return { error: "Cliente no encontrado." };
  const parsed = clientSchema.safeParse({ name: formData.get("name") ?? "", notes: formData.get("notes") ?? "" });
  if (!parsed.success) return { error: "Revisa los campos marcados.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const db = await createSessionClient();
  const { error } = await db
    .from("organizations")
    .update({ client_name: parsed.data.name, client_notes: parsed.data.notes || null })
    .eq("id", client.id);
  if (error) return { error: "No hemos podido guardar los cambios." };
  await audit({ actorId: user.id, action: "client.updated", entityType: "organization", entityId: client.id, organizationId: account.root.id });
  revalidatePath("/panel", "layout");
  return { ok: true, message: "Cliente actualizado." };
}

/** Archiva o restaura un cliente. Sus documentos se conservan. */
export async function setClientArchived(formData: FormData): Promise<void> {
  const { user, account } = await requireOrganization();
  const id = uuid.safeParse(formData.get("id"));
  const client = id.success ? account.clients.find((c) => c.id === id.data) : undefined;
  if (!client) redirect("/panel/clientes?error=cliente");
  const archive = formData.get("archive") === "1";
  const db = await createSessionClient();
  const { error } = await db
    .from("organizations")
    .update({ archived_at: archive ? new Date().toISOString() : null })
    .eq("id", client.id);
  if (error) redirect("/panel/clientes?error=archivar");
  if (archive && account.active.id === client.id) await setActiveCookie(null);
  await audit({ actorId: user.id, action: archive ? "client.archived" : "client.restored", entityType: "organization", entityId: client.id, organizationId: account.root.id });
  revalidatePath("/panel", "layout");
  redirect(`/panel/clientes?${archive ? "archivado" : "restaurado"}=1`);
}
