import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { env, isStripeConfigured } from "@/lib/env";
import { getStripe } from "@/lib/billing/stripe";
import { claimEvent, dispatchStripeEvent, HANDLED_EVENTS, markEvent } from "@/lib/billing/webhook";
import { logError } from "@/lib/observability";

/**
 * Webhook de Stripe.
 *  - Verifica la firma con STRIPE_WEBHOOK_SECRET sobre el cuerpo sin modificar.
 *  - Idempotente: cada evento se procesa una sola vez (tabla stripe_events).
 *  - Responde 500 ante errores para que Stripe reintente con backoff.
 */
export async function POST(request: NextRequest) {
  if (!isStripeConfigured()) return NextResponse.json({ error: "Stripe no configurado" }, { status: 503 });

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Falta la firma" }, { status: 400 });

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, env().STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Firma no válida" }, { status: 400 });
  }

  if (!HANDLED_EVENTS.has(event.type)) return NextResponse.json({ received: true, ignored: true });

  try {
    const claim = await claimEvent(event);
    if (claim === "duplicate") return NextResponse.json({ received: true, duplicate: true });
    if (claim === "in_progress") return NextResponse.json({ error: "En proceso" }, { status: 409 });

    await dispatchStripeEvent(event);
    await markEvent(event.id, "processed");
    return NextResponse.json({ received: true });
  } catch (e) {
    await markEvent(event.id, "failed", e instanceof Error ? e.message : String(e)).catch(() => {});
    await logError("stripe.webhook", e, { eventId: event.id, type: event.type });
    return NextResponse.json({ error: "Error procesando el evento" }, { status: 500 });
  }
}
