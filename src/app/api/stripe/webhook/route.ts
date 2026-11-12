import { NextResponse } from "next/server";
import { paymentsEnabled } from "@/lib/config/env";
import { logger } from "@/lib/logger";
import { processWebhookEvent, verifyWebhook } from "@/server/billing/stripe";
import { errorResponse } from "@/server/http/handler";

export const dynamic = "force-dynamic";

/**
 * Webhook de Stripe. No usa sesión ni comprobación de origen: la autenticidad se
 * garantiza verificando la firma con STRIPE_WEBHOOK_SECRET sobre el cuerpo sin procesar.
 */
export async function POST(request: Request) {
  if (!paymentsEnabled()) {
    return NextResponse.json({ error: { code: "payments_disabled", message: "Los pagos están desactivados." } }, { status: 503 });
  }
  try {
    const payload = await request.text();
    const event = verifyWebhook(payload, request.headers.get("stripe-signature"));
    const result = await processWebhookEvent(event);
    return NextResponse.json({ received: true, result });
  } catch (error) {
    if (!(error instanceof Error && error.name === "ApiError")) {
      // Un 500 hace que Stripe reintente el evento más tarde.
      logger.error("stripe.webhook_failed", { error });
    }
    return errorResponse(error, request);
  }
}
