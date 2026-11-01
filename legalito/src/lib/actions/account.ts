"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getProfile, requireOrganization } from "@/lib/auth";
import { createAdminClient, createSessionClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/env";
import { audit, rateLimit } from "@/lib/observability";
import { isValidCompanyTaxId, isValidPersonTaxId, normalizeTaxId } from "@/lib/validation/spanish-id";
import { fieldErrorsFrom, type FormState } from "./types";

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

const businessSchema = z
  .object({
    owner_type: z.enum(["persona_fisica", "persona_juridica"]).nullable().optional(),
    legal_name: optional(200),
    trade_name: optional(200),
    nif: optional(12),
    address_line: optional(250),
    postal_code: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional()
      .refine((v) => !v || /^\d{5}$/.test(v), "Código postal no válido."),
    city: optional(120),
    province: optional(120),
    contact_email: z
      .string()
      .trim()
      .toLowerCase()
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional()
      .refine((v) => !v || z.string().email().safeParse(v).success, "Email no válido."),
    phone: optional(30),
    website_url: optional(300),
    activity: optional(500),
  })
  .superRefine((v, ctx) => {
    if (v.nif) {
      const id = normalizeTaxId(v.nif);
      const ok = v.owner_type === "persona_juridica" ? isValidCompanyTaxId(id) : isValidPersonTaxId(id) || isValidCompanyTaxId(id);
      if (!ok) ctx.addIssue({ code: "custom", path: ["nif"], message: "NIF no válido." });
    }
  });

export async function updateBusiness(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, org } = await requireOrganization();
  const parsed = businessSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisa los campos marcados.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const data = { ...parsed.data, nif: parsed.data.nif ? normalizeTaxId(parsed.data.nif) : null };
  const db = await createSessionClient();
  const { error } = await db.from("organizations").update(data).eq("id", org.id);
  if (error) return { error: "No hemos podido guardar los cambios." };
  await audit({ actorId: user.id, action: "organization.updated", entityType: "organization", entityId: org.id, organizationId: org.id });
  revalidatePath("/panel", "layout");
  return { ok: true, message: "Datos guardados. Se aplicarán la próxima vez que generes tus documentos tras revisar el formulario." };
}

const profileSchema = z.object({
  full_name: z.string().trim().min(2, "Indica tu nombre.").max(160),
  notify_legal_updates: z.string().optional(),
  marketing_consent: z.string().optional(),
});

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireOrganization();
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisa los campos marcados.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const current = await getProfile();
  const marketing = parsed.data.marketing_consent === "on";
  const db = await createSessionClient();
  const { error } = await db
    .from("profiles")
    .update({
      full_name: parsed.data.full_name,
      notify_legal_updates: parsed.data.notify_legal_updates === "on",
      marketing_consent: marketing,
      // Se registra el momento exacto en que se presta o retira el consentimiento.
      marketing_consent_at: marketing !== current?.marketing_consent ? new Date().toISOString() : current?.marketing_consent_at ?? null,
    })
    .eq("id", user.id);
  if (error) return { error: "No hemos podido guardar los cambios." };
  if (marketing !== current?.marketing_consent) {
    await audit({ actorId: user.id, action: marketing ? "consent.marketing_granted" : "consent.marketing_withdrawn" });
  }
  revalidatePath("/panel", "layout");
  return { ok: true, message: "Preferencias guardadas." };
}

export async function changeEmail(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireOrganization();
  const email = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));
  if (!email.success) return { error: "Introduce un email válido.", fieldErrors: { email: "Introduce un email válido." } };
  if (email.data === user.email) return { error: "Ese ya es tu email actual." };
  if (!(await rateLimit(`email_change:${user.id}`, 3, 3600))) return { error: "Inténtalo de nuevo más tarde." };
  const db = await createSessionClient();
  const { error } = await db.auth.updateUser({ email: email.data }, { emailRedirectTo: `${siteUrl()}/auth/confirm?next=/panel/datos` });
  if (error) return { error: "No hemos podido iniciar el cambio de email." };
  await audit({ actorId: user.id, action: "auth.email_change_requested" });
  return { ok: true, message: "Te hemos enviado un enlace de confirmación. El cambio se aplicará cuando lo confirmes." };
}

/** Solicitud de supresión de la cuenta (derecho de supresión, art. 17 RGPD). */
export async function requestAccountDeletion(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, org } = await requireOrganization();
  if (formData.get("confirm") !== "ELIMINAR") return { error: "Escribe ELIMINAR para confirmar la solicitud." };
  const profile = await getProfile();
  const { error } = await createAdminClient()
    .from("support_requests")
    .insert({
      user_id: user.id,
      organization_id: org.id,
      name: profile?.full_name ?? user.email,
      email: user.email,
      subject: "Solicitud de supresión de cuenta",
      message: "El usuario solicita la supresión de su cuenta y de sus datos personales desde el panel (art. 17 RGPD).",
      category: "privacidad",
    });
  if (error) return { error: "No hemos podido registrar la solicitud. Escríbenos desde Ayuda." };
  await audit({ actorId: user.id, action: "gdpr.deletion_requested", organizationId: org.id });
  return {
    ok: true,
    message: "Hemos registrado tu solicitud. La atenderemos en el plazo legal de un mes y te confirmaremos por email. Los datos de facturación se conservarán bloqueados durante los plazos legales.",
  };
}
