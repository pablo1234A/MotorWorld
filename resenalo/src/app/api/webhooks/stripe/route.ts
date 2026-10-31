import { route } from "@/server/http/handler";
import { constructWebhookEvent, handleStripeEvent } from "@/server/modules/billing/stripe";

/** Webhook de Stripe. La firma se verifica sobre el cuerpo en bruto. */
export const POST = route(
  async (req) => {
    const raw = await req.text();
    const event = constructWebhookEvent(raw, req.headers.get("stripe-signature"));
    const result = await handleStripeEvent(event);
    return Response.json({ received: true, result });
  },
  { csrf: false },
);
