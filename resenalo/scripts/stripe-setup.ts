/**
 * Crea (o reutiliza) en Stripe los productos y precios mensuales de Reseñalo,
 * con IVA INCLUIDO (tax_behavior=inclusive). Idempotente por lookup_key.
 *   STRIPE_SECRET_KEY=sk_... npm run stripe:setup
 * Copia los IDs que imprime en STRIPE_PRICE_STARTER/PRO/BUSINESS y ejecuta `npm run db:seed`.
 */
import Stripe from "stripe";
import { PLANS } from "../src/config/plans";

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Falta STRIPE_SECRET_KEY");
  const stripe = new Stripe(key);
  for (const p of PLANS) {
    let productId: string | null = null;
    for (const [interval, amount, suffix] of [["month", p.priceCents, ""], ["year", p.annualPriceCents, "_ANNUAL"]] as const) {
      // Mismas claves que los precios ya creados (v1): si no, se duplicarían los precios mensuales y las
      // suscripciones existentes dejarían de corresponder a un plan («Precio de Stripe desconocido»).
      const lookup = `resenalo_${p.code.toLowerCase()}_${interval}ly_eur_v1`;
      const existing = await stripe.prices.list({ lookup_keys: [lookup] });
      if (existing.data[0]) {
        console.log(`STRIPE_PRICE_${p.code}${suffix}=${existing.data[0].id}   (ya existía)`);
        productId ??= typeof existing.data[0].product === "string" ? existing.data[0].product : existing.data[0].product.id;
        continue;
      }
      if (!productId) {
        const product = await stripe.products.create({
          name: `Reseñalo ${p.name}`,
          description: `Hasta ${p.monthlyEmailLimit} correos${p.monthlySmsLimit ? ` y ${p.monthlySmsLimit} SMS` : ""} de solicitud de reseña al mes`,
          tax_code: "txcd_10103001", // Software as a Service (SaaS) - uso empresarial
          metadata: { planCode: p.code },
        });
        productId = product.id;
      }
      const price = await stripe.prices.create({
        product: productId,
        currency: "eur",
        unit_amount: amount,
        recurring: { interval },
        tax_behavior: "inclusive",
        lookup_key: lookup,
        metadata: { planCode: p.code, interval },
      });
      console.log(`STRIPE_PRICE_${p.code}${suffix}=${price.id}`);
    }
  }
  console.log("\nSiguientes pasos: activa Stripe Tax con tu registro de IVA (ES), configura el portal de cliente y crea el webhook (ver docs/CREDENCIALES.md).");
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
