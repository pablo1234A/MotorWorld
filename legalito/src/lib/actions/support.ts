"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getOrganization, getSessionUser } from "@/lib/auth";
import { env, isSupabaseConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/server";
import { audit, logError, rateLimit } from "@/lib/observability";
import { ipHash } from "@/lib/request";
import { sendEmail } from "@/lib/email/send";
import { fieldErrorsFrom, type FormState } from "./types";

const schema = z.object({
  name: z.string().trim().min(2, "Indica tu nombre.").max(120),
  email: z.string().trim().toLowerCase().email("Introduce un email válido.").max(254),
  subject: z.string().trim().min(3, "Indica el asunto.").max(160),
  message: z.string().trim().min(10, "Cuéntanos un poco más (mínimo 10 caracteres).").max(5000, "Máximo 5000 caracteres."),
  category: z.enum(["general", "documentos", "pagos", "cuenta", "privacidad"]).default("general"),
  privacy: z.literal("on", { message: "Debes aceptar la información sobre privacidad." }),
});

export async function submitSupportRequest(_prev: FormState, formData: FormData): Promise<FormState> {
  // Campo trampa para bots: si viene relleno se responde como si todo fuera bien.
  if (String(formData.get("company_website") ?? "").length > 0) {
    return { ok: true, message: "Mensaje enviado. Te responderemos lo antes posible." };
  }
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisa los campos marcados.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  if (!isSupabaseConfigured()) {
    return { error: "El sistema de soporte no está disponible en este momento. Escríbenos por email." };
  }

  const allowed = await rateLimit(`support:${await ipHash()}`, 5, 3600);
  if (!allowed) return { error: "Has enviado varios mensajes seguidos. Inténtalo de nuevo en una hora." };

  const user = await getSessionUser();
  const org = user ? await getOrganization() : null;
  const data = parsed.data;

  try {
    const { data: row, error } = await createAdminClient()
      .from("support_requests")
      .insert({
        user_id: user?.id ?? null,
        organization_id: org?.id ?? null,
        name: data.name,
        email: data.email,
        subject: data.subject,
        message: data.message,
        category: data.category,
      })
      .select("id")
      .single();
    if (error) throw error;

    await audit({ actorId: user?.id, action: "support.created", entityType: "support_request", entityId: row.id, organizationId: org?.id }, { withIp: true });
    await sendEmail({ key: `support_received:${row.id}`, to: data.email, email: { template: "support_received", data: { subject: data.subject } }, userId: user?.id });
    const supportEmail = env().SUPPORT_EMAIL;
    if (supportEmail) {
      await sendEmail({
        key: `support_notification:${row.id}`,
        to: supportEmail,
        email: { template: "support_notification", data: { subject: data.subject, from: `${data.name} <${data.email}>`, message: data.message } },
      });
    }
    if (user) revalidatePath("/panel/ayuda");
    return { ok: true, message: "Mensaje enviado. Te responderemos lo antes posible, normalmente en uno o dos días laborables." };
  } catch (e) {
    await logError("support.submit", e);
    return { error: "No hemos podido enviar tu mensaje. Inténtalo de nuevo en unos minutos." };
  }
}
