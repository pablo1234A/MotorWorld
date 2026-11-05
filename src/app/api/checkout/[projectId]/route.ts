import { z } from "zod";
import type { Item } from "@/engine/schema";
import { clientIp, handler, HttpError, rateLimit } from "@/server/http";
import { createStripeCheckout } from "@/server/integrations";
import { getPublication } from "@/server/projects";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" };
const body = z.object({ items: z.array(z.object({ id: z.string().max(64), qty: z.number().int().min(1).max(99) })).min(1).max(50), returnUrl: z.string().url().max(600) });

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * Creates a Stripe Checkout session. Prices are always read from the published document on the
 * server: the browser only sends product ids and quantities, so prices cannot be tampered with.
 */
export const POST = handler(async (req: Request, { params }: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await params;
  const send = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
  try {
    rateLimit(`checkout:${projectId}:${clientIp(req)}`, 20, 10 * 60_000);
    const input = body.parse(await req.json());
    const pub = await getPublication(projectId);
    if (!pub) throw new HttpError(404, "La tienda no está publicada.");
    const catalog = new Map<string, Item>();
    for (const p of pub.doc.pages) for (const s of p.sections) if (s.type === "products") for (const it of s.content.items ?? []) catalog.set(it.id, it);
    const lines = input.items.map((i) => {
      const it = catalog.get(i.id);
      const price = Number(it?.price);
      if (!it || !Number.isFinite(price) || price <= 0) throw new HttpError(400, "Producto no disponible.");
      return { name: it.title, unitAmount: Math.round(price * 100), quantity: i.qty, priceId: it.checkout?.priceId };
    });
    const back = new URL(input.returnUrl);
    const url = await createStripeCheckout(lines, pub.doc.settings.currency, `${back.origin}${back.pathname}?pedido=ok`, `${back.origin}${back.pathname}?pedido=cancelado`);
    return send({ url });
  } catch (e) {
    if (e instanceof HttpError) return send({ error: e.message }, e.status);
    if (e instanceof z.ZodError) return send({ error: "Carrito no válido." }, 400);
    throw e;
  }
});
