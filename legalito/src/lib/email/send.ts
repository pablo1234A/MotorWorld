import "server-only";
import { Resend } from "resend";
import { env, isEmailConfigured, isSupabaseConfigured, siteUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/server";
import { logError } from "@/lib/observability";
import { renderEmail, type EmailTemplate } from "./templates";

let resend: Resend | null = null;
const client = () => (resend ??= new Resend(env().RESEND_API_KEY));

export interface SendEmailInput {
  /** Clave de idempotencia: el mismo email lógico nunca se envía dos veces. */
  key: string;
  to: string;
  email: EmailTemplate;
  userId?: string | null;
  organizationId?: string | null;
}

export type SendResult = "sent" | "duplicate" | "skipped" | "failed";

/**
 * Envía un email transaccional una sola vez por clave. El registro en
 * `email_events` (clave única) evita duplicados ante reintentos de webhooks.
 * Si Resend no está configurado, se registra como `skipped` (no se simula).
 */
export async function sendEmail(input: SendEmailInput): Promise<SendResult> {
  if (!isSupabaseConfigured()) return "skipped";
  const db = createAdminClient();

  const { data: inserted, error: insertError } = await db
    .from("email_events")
    .insert({
      idempotency_key: input.key,
      template: input.email.template,
      to_email: input.to,
      user_id: input.userId ?? null,
      organization_id: input.organizationId ?? null,
      status: "queued",
    })
    .select("id")
    .maybeSingle();

  if (insertError) {
    if (insertError.code === "23505") {
      // Ya existe: solo se reintenta si el envío anterior falló.
      const { data: existing } = await db.from("email_events").select("id,status").eq("idempotency_key", input.key).maybeSingle();
      if (!existing || existing.status !== "failed") return "duplicate";
      return deliver(existing.id as string, input);
    }
    await logError("email.queue", insertError, { key: input.key });
    return "failed";
  }
  return deliver(inserted!.id as string, input);
}

async function deliver(eventId: string, input: SendEmailInput): Promise<SendResult> {
  const db = createAdminClient();
  if (!isEmailConfigured()) {
    await db.from("email_events").update({ status: "skipped", error: "RESEND_API_KEY no configurada" }).eq("id", eventId);
    return "skipped";
  }
  const content = renderEmail(input.email, siteUrl());
  try {
    const { data, error } = await client().emails.send(
      {
        from: env().EMAIL_FROM,
        to: input.to,
        replyTo: env().EMAIL_REPLY_TO,
        subject: content.subject,
        html: content.html,
        text: content.text,
      },
      { idempotencyKey: input.key.slice(0, 256) },
    );
    if (error) throw new Error(`${error.name}: ${error.message}`);
    await db
      .from("email_events")
      .update({ status: "sent", provider_message_id: data?.id ?? null, sent_at: new Date().toISOString(), error: null })
      .eq("id", eventId);
    return "sent";
  } catch (e) {
    await db.from("email_events").update({ status: "failed", error: String(e).slice(0, 500) }).eq("id", eventId);
    await logError("email.send", e, { key: input.key, template: input.email.template });
    return "failed";
  }
}
