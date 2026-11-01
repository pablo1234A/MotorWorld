"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient, createSessionClient } from "@/lib/supabase/server";
import { extractRules, extractVariables, templateContentSchema } from "@/lib/documents/engine";
import { QUESTIONNAIRE_VERSION } from "@/lib/documents/questionnaire";
import { audit, logError } from "@/lib/observability";
import { sendEmail } from "@/lib/email/send";
import { getStripe } from "@/lib/billing/stripe";
import { fieldErrorsFrom, type FormState } from "./types";

/**
 * Acciones de administración. Cada una verifica el rol en servidor
 * (requireAdmin) y escribe con la sesión del administrador, de modo que las
 * políticas RLS y los disparadores de la base de datos actúan como segunda barrera.
 */

const dbError = (e: { message: string } | null) => (e ? { error: `No se pudo guardar: ${e.message}` } : null);

// ---------------------------------------------------------------- Plantillas
export async function createTemplateVersion(templateId: string): Promise<void> {
  const admin = await requireAdmin();
  const db = await createSessionClient();
  const { data: latest } = await db
    .from("template_versions")
    .select("content, version_label, questionnaire_version, is_demo")
    .eq("template_id", templateId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await db
    .from("template_versions")
    .insert({
      template_id: templateId,
      version_label: latest ? bumpMinor(latest.version_label as string) : "1.0.0",
      content: latest?.content ?? { title: "Nuevo documento", sections: [{ id: "seccion-1", heading: "Sección", blocks: [{ type: "paragraph", text: "Texto" }] }] },
      questionnaire_version: QUESTIONNAIRE_VERSION,
      is_demo: false,
      changelog: "",
    })
    .select("id")
    .single();
  if (error) throw error;
  await audit({ actorId: admin.id, actorType: "admin", action: "template_version.created", entityType: "template_version", entityId: data.id });
  redirect(`/admin/plantillas/${templateId}/${data.id}`);
}

function bumpMinor(label: string): string {
  const m = /^(\d+)\.(\d+)/.exec(label);
  if (!m) return "1.0.0";
  // Una versión creada a partir de una demo empieza en 1.0.0.
  if (label.includes("demo")) return "1.0.0";
  return `${m[1]}.${Number(m[2]) + 1}.0`;
}

const versionSchema = z.object({
  version_label: z.string().regex(/^\d+\.\d+(\.\d+)?(-[a-z0-9.]+)?$/, "Formato de versión no válido (p. ej. 1.2.0)."),
  changelog: z.string().trim().min(5, "Describe los cambios de esta versión.").max(4000),
  content: z.string().min(2),
});

export async function saveTemplateVersion(versionId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = versionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisa los campos.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  let json: unknown;
  try {
    json = JSON.parse(parsed.data.content);
  } catch (e) {
    return { error: "El contenido no es JSON válido.", fieldErrors: { content: String(e) } };
  }
  const content = templateContentSchema.safeParse(json);
  if (!content.success) {
    return {
      error: "La plantilla no cumple el esquema.",
      fieldErrors: { content: content.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join(" · ") },
    };
  }
  const db = await createSessionClient();
  const { error } = await db
    .from("template_versions")
    .update({
      version_label: parsed.data.version_label,
      changelog: parsed.data.changelog,
      content: content.data,
      variables: extractVariables(content.data).map((key) => ({ key })),
      rules: extractRules(content.data),
      questionnaire_version: QUESTIONNAIRE_VERSION,
    })
    .eq("id", versionId)
    .eq("status", "draft");
  const err = dbError(error);
  if (err) return err;
  await audit({ actorId: admin.id, actorType: "admin", action: "template_version.edited", entityType: "template_version", entityId: versionId });
  revalidatePath("/admin/plantillas", "layout");
  return { ok: true, message: "Borrador guardado." };
}

export async function submitTemplateVersion(versionId: string): Promise<void> {
  await requireAdmin();
  const db = await createSessionClient();
  const { error } = await db.rpc("submit_template_version", { p_version_id: versionId });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/plantillas", "layout");
}

export async function returnToDraft(versionId: string): Promise<void> {
  const admin = await requireAdmin();
  const db = await createSessionClient();
  const { error } = await db.from("template_versions").update({ status: "draft" }).eq("id", versionId).eq("status", "in_review");
  if (error) throw new Error(error.message);
  await audit({ actorId: admin.id, actorType: "admin", action: "template_version.returned_to_draft", entityType: "template_version", entityId: versionId });
  revalidatePath("/admin/plantillas", "layout");
}

const approveSchema = z.object({
  reviewer_name: z.string().trim().min(3, "Indica el nombre del profesional que ha revisado la plantilla."),
  reviewer_credentials: z.string().trim().max(200).optional(),
  reviewed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida."),
  review_reference: z.string().trim().min(3, "Indica la referencia del informe o documento de revisión."),
  review_notes: z.string().trim().max(4000).optional(),
  attest: z.literal("on", { message: "Debes confirmar que existe una revisión jurídica documentada." }),
});

export async function approveTemplateVersion(versionId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = approveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisa los campos.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const d = parsed.data;
  const db = await createSessionClient();
  const { error } = await db.rpc("approve_template_version", {
    p_version_id: versionId,
    p_reviewer_name: d.reviewer_name,
    p_reviewer_credentials: d.reviewer_credentials ?? "",
    p_reviewed_at: new Date(`${d.reviewed_at}T12:00:00Z`).toISOString(),
    p_review_reference: d.review_reference,
    p_review_notes: d.review_notes ?? "",
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/plantillas", "layout");
  return { ok: true, message: "Versión aprobada. Ya puede publicarse." };
}

export async function publishTemplateVersion(versionId: string): Promise<void> {
  await requireAdmin();
  const db = await createSessionClient();
  const { error } = await db.rpc("publish_template_version", { p_version_id: versionId });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/plantillas", "layout");
}

// ---------------------------------------------------------------- Productos
const productSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300),
  stripe_price_id: z.string().trim().regex(/^(price_[A-Za-z0-9]+)?$/, "Debe empezar por price_ o quedar vacío."),
  included_document_types: z.array(z.string().regex(/^[a-z_]+$/)).min(1, "Selecciona al menos un documento."),
  generations_limit: z.string().regex(/^\d*$/),
  documents_per_period: z.string().regex(/^\d*$/).optional(),
  includes_updates: z.string().optional(),
  features: z.string().max(3000),
  active: z.string().optional(),
});

export async function updateProduct(productId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = productSchema.safeParse({ ...Object.fromEntries(formData), included_document_types: formData.getAll("included_document_types") });
  if (!parsed.success) return { error: "Revisa los campos.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const d = parsed.data;
  const update: Record<string, unknown> = {
    name: d.name,
    description: d.description,
    stripe_price_id: d.stripe_price_id || null,
    included_document_types: d.included_document_types,
    generations_limit: d.generations_limit ? Number(d.generations_limit) : null,
    documents_per_period: d.documents_per_period ? Number(d.documents_per_period) : null,
    includes_updates: d.includes_updates === "on",
    features: d.features.split("\n").map((f) => f.trim()).filter(Boolean),
    active: d.active === "on",
  };
  // El precio mostrado se sincroniza con el precio real de Stripe para evitar incoherencias.
  if (d.stripe_price_id) {
    try {
      const price = await getStripe().prices.retrieve(d.stripe_price_id);
      if (price.unit_amount === null) return { error: "El precio de Stripe no tiene importe fijo." };
      update.price_cents = price.unit_amount;
    } catch (e) {
      return { error: `No se pudo verificar el precio en Stripe: ${e instanceof Error ? e.message : e}` };
    }
  }
  const db = await createSessionClient();
  const { error } = await db.from("products").update(update).eq("id", productId);
  const err = dbError(error);
  if (err) return err;
  await audit({ actorId: admin.id, actorType: "admin", action: "product.updated", entityType: "product", entityId: productId, metadata: update });
  updateTag("products");
  revalidatePath("/admin/productos");
  return { ok: true, message: "Plan actualizado." };
}

// ---------------------------------------------------------------- FAQ y avisos
const faqSchema = z.object({
  question: z.string().trim().min(5).max(300),
  answer: z.string().trim().min(5).max(4000),
  category: z.enum(["general", "documentos", "suscripcion", "pagos"]),
  sort_order: z.coerce.number().int().min(0).max(999),
  published: z.string().optional(),
});

export async function saveFaq(id: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = faqSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisa los campos.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const row = { ...parsed.data, published: parsed.data.published === "on" };
  const db = await createSessionClient();
  const { error } = id ? await db.from("faqs").update(row).eq("id", id) : await db.from("faqs").insert(row);
  const err = dbError(error);
  if (err) return err;
  await audit({ actorId: admin.id, actorType: "admin", action: id ? "faq.updated" : "faq.created", entityType: "faq", entityId: id ?? undefined });
  updateTag("faqs");
  revalidatePath("/admin/faq");
  return { ok: true, message: "Pregunta guardada." };
}

export async function deleteFaq(id: string): Promise<void> {
  const admin = await requireAdmin();
  const db = await createSessionClient();
  await db.from("faqs").delete().eq("id", id);
  await audit({ actorId: admin.id, actorType: "admin", action: "faq.deleted", entityType: "faq", entityId: id });
  updateTag("faqs");
  revalidatePath("/admin/faq");
}

const noticeSchema = z.object({
  title: z.string().trim().min(2).max(160),
  body: z.string().trim().min(2).max(2000),
  level: z.enum(["info", "warning", "important"]),
  ends_at: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
});

export async function createNotice(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = noticeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisa los campos.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const db = await createSessionClient();
  const { error } = await db.from("notices").insert({
    title: parsed.data.title,
    body: parsed.data.body,
    level: parsed.data.level,
    ends_at: parsed.data.ends_at ? new Date(`${parsed.data.ends_at}T23:59:59Z`).toISOString() : null,
    created_by: admin.id,
  });
  const err = dbError(error);
  if (err) return err;
  await audit({ actorId: admin.id, actorType: "admin", action: "notice.created" });
  revalidatePath("/admin/avisos");
  return { ok: true, message: "Aviso publicado en el panel de los clientes." };
}

export async function toggleNotice(id: string, active: boolean): Promise<void> {
  await requireAdmin();
  const db = await createSessionClient();
  await db.from("notices").update({ active }).eq("id", id);
  revalidatePath("/admin/avisos");
}

// ---------------------------------------------------------------- Actualizaciones legales
const updateSchema = z.object({
  title: z.string().trim().min(4).max(200),
  summary: z.string().trim().min(10).max(1000),
  body: z.string().trim().max(10000).optional(),
  document_types: z.array(z.string()).default([]),
});

export async function createLegalUpdate(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = updateSchema.safeParse({ ...Object.fromEntries(formData), document_types: formData.getAll("document_types") });
  if (!parsed.success) return { error: "Revisa los campos.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const db = await createSessionClient();
  const { error } = await db.from("legal_updates").insert({ ...parsed.data, body: parsed.data.body ?? "", created_by: admin.id });
  const err = dbError(error);
  if (err) return err;
  revalidatePath("/admin/actualizaciones");
  return { ok: true, message: "Borrador creado. Publícalo cuando tengas la revisión documentada." };
}

const publishUpdateSchema = z.object({
  review_reference: z.string().trim().min(3, "Indica la referencia de la revisión."),
  reviewed_by_name: z.string().trim().min(3, "Indica quién ha realizado la revisión."),
  notify: z.string().optional(),
});

/** Publica una actualización con revisión documentada y avisa a los suscriptores que lo permiten. */
export async function publishLegalUpdate(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = publishUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisa los campos.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const db = await createSessionClient();
  const { data: upd, error } = await db
    .from("legal_updates")
    .update({ status: "published", review_reference: parsed.data.review_reference, reviewed_by_name: parsed.data.reviewed_by_name, published_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "draft")
    .select("id, title, summary")
    .single();
  if (error) return { error: error.message };
  await audit({ actorId: admin.id, actorType: "admin", action: "legal_update.published", entityType: "legal_update", entityId: id });

  let notified = 0;
  if (parsed.data.notify === "on") {
    try {
      const sys = createAdminClient();
      const { data: subs } = await sys.from("subscriptions").select("organization_id").in("status", ["active", "trialing", "past_due"]);
      const orgIds = Array.from(new Set((subs ?? []).map((s) => s.organization_id).filter(Boolean)));
      if (orgIds.length) {
        const { data: owners } = await sys.from("organizations").select("id, owner_id, profiles!organizations_owner_id_fkey(id, email, notify_legal_updates)").in("id", orgIds);
        for (const o of owners ?? []) {
          const p = o.profiles as unknown as { id: string; email: string; notify_legal_updates: boolean } | null;
          if (!p?.notify_legal_updates) continue;
          const r = await sendEmail({
            key: `legal_update:${id}:${p.id}`,
            to: p.email,
            email: { template: "legal_update", data: { title: upd.title as string, summary: upd.summary as string } },
            userId: p.id,
            organizationId: o.id as string,
          });
          if (r === "sent") notified++;
        }
      }
      await sys.from("legal_updates").update({ notified_at: new Date().toISOString() }).eq("id", id);
    } catch (e) {
      await logError("admin.legal_update_notify", e, { id });
      return { ok: true, message: "Publicada, pero hubo errores al enviar avisos. Revisa Errores." };
    }
  }
  revalidatePath("/admin/actualizaciones");
  return { ok: true, message: `Actualización publicada.${parsed.data.notify === "on" ? ` Avisos enviados: ${notified}.` : ""}` };
}

// ---------------------------------------------------------------- Soporte
export async function updateSupportStatus(id: string, formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const status = z.enum(["open", "in_progress", "closed"]).parse(formData.get("status"));
  const notes = z.string().max(4000).parse(formData.get("admin_notes") ?? "");
  const db = await createSessionClient();
  await db.from("support_requests").update({ status, admin_notes: notes || null }).eq("id", id);
  await audit({ actorId: admin.id, actorType: "admin", action: "support.updated", entityType: "support_request", entityId: id, metadata: { status } });
  revalidatePath("/admin/soporte");
}
