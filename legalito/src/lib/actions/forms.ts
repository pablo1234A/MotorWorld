"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireOrganization } from "@/lib/auth";
import { createAdminClient, createSessionClient } from "@/lib/supabase/server";
import { coerceAnswers, QUESTIONNAIRE_VERSION, STEPS, validateAnswers, type Answers } from "@/lib/documents/questionnaire";
import { generateDocuments } from "@/lib/documents/service";
import { DocumentGenerationError } from "@/lib/documents/compose";
import { audit, logError, rateLimit } from "@/lib/observability";
import { trackServer } from "@/lib/analytics-server";
import type { FormResponseRow, OrganizationRow } from "@/lib/db/types";
import type { FormState } from "./types";

/** Obtiene el borrador en curso o crea uno nuevo precargado con los datos conocidos. */
export async function getOrCreateDraft(): Promise<FormResponseRow> {
  const { user, org } = await requireOrganization();
  const db = await createSessionClient();
  const { data: draft } = await db
    .from("form_responses")
    .select("*")
    .eq("organization_id", org.id)
    .eq("status", "draft")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (draft) return draft as FormResponseRow;

  // Evita pedir dos veces la misma información: se parte de la última respuesta
  // completada o, si no existe, de los datos del negocio.
  const { data: last } = await db
    .from("form_responses")
    .select("answers")
    .eq("organization_id", org.id)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const answers = last?.answers ?? answersFromOrganization(org);

  const { data: created, error } = await db
    .from("form_responses")
    .insert({ organization_id: org.id, created_by: user.id, questionnaire_version: QUESTIONNAIRE_VERSION, answers })
    .select("*")
    .single();
  if (error) throw error;
  if (!last) await trackServer("form_started", { userId: user.id });
  return created as FormResponseRow;
}

function answersFromOrganization(org: OrganizationRow): Answers {
  const a: Answers = {};
  const set = (k: string, v: unknown) => {
    if (v !== null && v !== undefined && v !== "") a[k] = v;
  };
  set("business_type", org.business_type);
  set("owner_type", org.owner_type);
  set("legal_name", org.legal_name);
  set("trade_name", org.trade_name);
  set("nif", org.nif);
  set("address_line", org.address_line);
  set("postal_code", org.postal_code);
  set("city", org.city);
  set("province", org.province);
  set("contact_email", org.contact_email);
  set("phone", org.phone);
  set("website_url", org.website_url);
  set("activity_description", org.activity);
  return a;
}

/** Autoguardado del borrador. La política RLS garantiza que solo se modifica uno propio. */
export async function saveDraft(responseId: string, rawAnswers: unknown, step: string): Promise<{ ok: boolean; savedAt?: string; error?: string }> {
  await requireOrganization();
  const answers = coerceAnswers(rawAnswers);
  if (JSON.stringify(answers).length > 60_000) return { ok: false, error: "Las respuestas son demasiado largas." };
  const db = await createSessionClient();
  const { data, error } = await db
    .from("form_responses")
    .update({ answers, current_step: STEPS.some((s) => s.id === step) ? step : null })
    .eq("id", responseId)
    .eq("status", "draft")
    .select("updated_at")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "No se ha podido guardar. Comprueba tu conexión." };
  return { ok: true, savedAt: data.updated_at as string };
}

/**
 * Valida en servidor y marca el formulario como completado. También actualiza
 * los datos del negocio para no volver a pedirlos.
 */
export async function completeForm(responseId: string, rawAnswers: unknown): Promise<{ errors?: Record<string, string>; error?: string }> {
  const { user, org } = await requireOrganization();
  const answers = coerceAnswers(rawAnswers);
  const result = validateAnswers(answers);
  if (!result.valid) return { errors: result.errors, error: "Hay respuestas que revisar." };

  const session = await createSessionClient();
  // Comprobación de pertenencia con la sesión del usuario (RLS) antes de usar service_role.
  const { data: owned } = await session.from("form_responses").select("id").eq("id", responseId).eq("status", "draft").maybeSingle();
  if (!owned) return { error: "No encontramos el formulario. Recarga la página." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("form_responses")
    .update({ answers: result.cleaned, status: "completed", completed_at: new Date().toISOString(), current_step: null })
    .eq("id", responseId)
    .eq("organization_id", org.id);
  if (error) {
    await logError("forms.complete", error, { responseId });
    return { error: "No hemos podido guardar tus respuestas. Inténtalo de nuevo." };
  }

  const c = result.cleaned;
  const str = (k: string) => (typeof c[k] === "string" ? (c[k] as string) : null);
  await session
    .from("organizations")
    .update({
      business_type: str("business_type"),
      owner_type: str("owner_type"),
      legal_name: str("legal_name"),
      trade_name: str("trade_name"),
      nif: str("nif"),
      address_line: str("address_line"),
      postal_code: str("postal_code"),
      city: str("city"),
      province: str("province"),
      contact_email: str("contact_email"),
      phone: str("phone"),
      website_url: str("website_url"),
      activity: str("activity_description"),
    })
    .eq("id", org.id);

  await audit({ actorId: user.id, action: "form.completed", entityType: "form_response", entityId: responseId, organizationId: org.id });
  await trackServer("form_completed", { userId: user.id, props: { business_type: str("business_type") } });
  revalidatePath("/panel", "layout");
  redirect("/panel/generador/revision");
}

/** Abre un nuevo borrador a partir de las últimas respuestas para editarlas (opcionalmente en un paso concreto). */
export async function editAnswers(step?: string): Promise<void> {
  await getOrCreateDraft();
  const valid = typeof step === "string" && STEPS.some((s) => s.id === step);
  redirect(valid ? `/panel/generador?paso=${step}` : "/panel/generador");
}

/** Generación o regeneración manual desde el panel. */
export async function generateNow(_prev: FormState): Promise<FormState> {
  const { user, org } = await requireOrganization();
  if (!(await rateLimit(`generate:${org.id}`, 10, 3600))) {
    return { error: "Has generado documentos varias veces en poco tiempo. Inténtalo de nuevo en una hora." };
  }
  try {
    await generateDocuments({
      organizationId: org.id,
      userId: user.id,
      batchKey: `manual:${org.id}:${randomUUID()}`,
      notifyEmail: user.email,
    });
  } catch (e) {
    if (e instanceof DocumentGenerationError) return { error: e.message };
    await logError("forms.generate_now", e, { organizationId: org.id });
    return { error: "No hemos podido generar tus documentos. Inténtalo de nuevo en unos minutos." };
  }
  revalidatePath("/panel", "layout");
  redirect("/panel/documentos?generado=1");
}
