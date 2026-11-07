import { NextResponse } from "next/server";

import { processStripeEvent } from "@/server/billing/apply";
import { getStripe } from "@/server/billing/stripe";
import { logger } from "@/server/logger";

/**
 * Webhook de Stripe. Firma obligatoria (cabecera Stripe-Signature, secreto
 * STRIPE_WEBHOOK_SECRET, tolerancia de 5 minutos); cada evento se aplica una
 * sola vez; los eventos en modo live se rechazan mientras los pagos estén en
 * TEST. 2xx a todo evento auténtico (aunque no se use) para que Stripe no lo
 * reintente; 5xx si falla la base de datos (Stripe lo reintentará).
 */
const MAX_BODY = 512 * 1024;

export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return NextResponse.json({ error: { code: "not_configured" } }, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  const body = await request.text();
  if (!signature || body.length > MAX_BODY) return NextResponse.json({ error: { code: "invalid_signature" } }, { status: 400 });

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret, 300);
  } catch {
    logger.warn("stripe_webhook_rejected", { reason: "signature" });
    return NextResponse.json({ error: { code: "invalid_signature" } }, { status: 400 });
  }
  try {
    const outcome = await processStripeEvent(event);
    return NextResponse.json({ received: true, outcome });
  } catch (err) {
    logger.error("stripe_webhook_failed", { type: event.type, error: err });
    return NextResponse.json({ error: { code: "internal_error" } }, { status: 500 });
  }
}
