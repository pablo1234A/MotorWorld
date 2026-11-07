import "server-only";

import type Stripe from "stripe";

import { withSystem } from "@/server/db/client";

import { assertTestMode } from "./stripe";

/**
 * Crea (o reutiliza) en Stripe un producto por plan y un precio mensual y otro
 * anual, con los importes EXACTOS de la tabla `plans` (los del PDF), y los
 * guarda en billing_prices. Idempotente: producto con id fijo y precios por
 * `lookup_key`. Si un importe cambiase, se crea un precio nuevo y se le
 * transfiere la lookup_key (los clientes actuales conservan el suyo).
 * Precios SIN IVA (P11): `tax_behavior: exclusive`.
 */
export async function syncCatalog(stripe: Stripe): Promise<Array<{ plan: string; interval: string; priceId: string; created: boolean }>> {
  const plans = await withSystem((tx) => tx.selectFrom("plans").select(["code", "name", "price_month_cents", "price_year_cents"]).orderBy("sort_order").execute());
  const out: Array<{ plan: string; interval: string; priceId: string; created: boolean }> = [];
  for (const p of plans) {
    const productId = `revisaya_${p.code}`;
    let product: Stripe.Product;
    try {
      product = await stripe.products.retrieve(productId);
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode !== 404) throw err;
      product = await stripe.products.create({ id: productId, name: `RevisaYa ${p.name}`, metadata: { plan_code: p.code } });
    }
    assertTestMode(product);

    for (const [interval, amount] of [
      ["month", p.price_month_cents],
      ["year", p.price_year_cents],
    ] as const) {
      const lookupKey = `revisaya_${p.code}_${interval}`;
      const existing = (await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 })).data[0];
      let price = existing;
      let created = false;
      if (!price || price.unit_amount !== amount || price.currency !== "eur" || price.recurring?.interval !== interval) {
        price = await stripe.prices.create({
          product: product.id,
          currency: "eur",
          unit_amount: amount,
          recurring: { interval },
          tax_behavior: "exclusive",
          lookup_key: lookupKey,
          transfer_lookup_key: Boolean(existing),
          metadata: { plan_code: p.code },
        });
        created = true;
      }
      assertTestMode(price);
      await withSystem((tx) =>
        tx
          .insertInto("billing_prices")
          .values({ plan_code: p.code, interval, livemode: price.livemode, stripe_price_id: price.id })
          .onConflict((oc) => oc.columns(["plan_code", "interval", "livemode"]).doUpdateSet({ stripe_price_id: price.id }))
          .execute(),
      );
      out.push({ plan: p.code, interval, priceId: price.id, created });
    }
  }
  return out;
}
