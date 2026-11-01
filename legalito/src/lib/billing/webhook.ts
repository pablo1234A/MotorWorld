import "server-only";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/server";
import { fulfillCheckoutSession, recordDispute, recordInvoice, recordRefund, sendRenewalReminder, syncSubscription } from "./fulfillment";

/** Eventos de Stripe que Legalito procesa. El resto se registra y se ignora. */
export const HANDLED_EVENTS = new Set<string>([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.upcoming",
  "charge.refunded",
  "charge.dispute.created",
]);

export async function dispatchStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await fulfillCheckoutSession(event.data.object.id);
      return;
    case "checkout.session.async_payment_failed": {
      const s = event.data.object;
      await createAdminClient()
        .from("payments")
        .upsert(
          {
            kind: "one_time",
            status: "failed",
            amount_cents: s.amount_total ?? 0,
            currency: s.currency ?? "eur",
            stripe_checkout_session_id: s.id,
            failure_reason: "El pago diferido no se completó",
          },
          { onConflict: "stripe_checkout_session_id" },
        );
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(event.data.object.id);
      return;
    case "invoice.paid":
      if (event.data.object.id) await recordInvoice(event.data.object.id, "paid");
      return;
    case "invoice.payment_failed":
      if (event.data.object.id) await recordInvoice(event.data.object.id, "failed");
      return;
    case "invoice.upcoming":
      await sendRenewalReminder(event.data.object);
      return;
    case "charge.refunded":
      await recordRefund(event.data.object);
      return;
    case "charge.dispute.created":
      await recordDispute(event.data.object);
      return;
    default:
      return;
  }
}

export type ClaimResult = "process" | "duplicate" | "in_progress";

/**
 * Reclama un evento para procesarlo una sola vez.
 *  - nuevo → se procesa
 *  - ya procesado → se ignora (200)
 *  - fallido o bloqueado más de 5 min → se reprocesa
 *  - en curso reciente → se pide a Stripe que reintente más tarde
 */
export async function claimEvent(event: Stripe.Event): Promise<ClaimResult> {
  const db = createAdminClient();
  const { error } = await db.from("stripe_events").insert({ id: event.id, type: event.type, livemode: event.livemode });
  if (!error) return "process";
  if (error.code !== "23505") throw error;

  const { data: existing } = await db.from("stripe_events").select("status, received_at").eq("id", event.id).single();
  if (existing?.status === "processed") return "duplicate";
  const stale = existing && Date.now() - new Date(existing.received_at as string).getTime() > 5 * 60_000;
  if (existing?.status === "failed" || stale) {
    const { data: rows } = await db
      .from("stripe_events")
      .update({ status: "processing", received_at: new Date().toISOString(), error: null })
      .eq("id", event.id)
      .neq("status", "processed")
      .select("id");
    return rows && rows.length > 0 ? "process" : "duplicate";
  }
  return "in_progress";
}

export async function markEvent(eventId: string, status: "processed" | "failed", error?: string): Promise<void> {
  const db = createAdminClient();
  const { data } = await db.from("stripe_events").select("attempts").eq("id", eventId).single();
  await db
    .from("stripe_events")
    .update({
      status,
      error: error?.slice(0, 1000) ?? null,
      processed_at: status === "processed" ? new Date().toISOString() : null,
      attempts: status === "failed" ? ((data?.attempts as number) ?? 1) + 1 : ((data?.attempts as number) ?? 1),
    })
    .eq("id", eventId);
}
