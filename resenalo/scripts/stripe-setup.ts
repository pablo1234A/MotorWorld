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
    const lookup = `resenalo_${p.code.toLowerCase()}_monthly_eur_v1`;
    const existing = await stripe.prices.list({ lookup_keys: [lookup], expand: ["data.product"] });
    if (existing.data[0]) {
      console.log(`STRIPE_PRICE_${p.code}=${existing.data[0].id}   (ya existía)`);
      continue;
    }
    const product = await stripe.products.create({
      name: `Reseñalo ${p.name}`,
      description: `Hasta ${p.monthlyEmailLimit} solicitudes de reseña por correo al mes`,
      tax_code: "txcd_10103001", // Software as a Service (SaaS) - uso empresarial
      metadata: { planCode: p.code },
    });
    const price = await stripe.prices.create({
      product: product.id,
      currency: "eur",
      unit_amount: p.priceCents,
      recurring: { interval: "month" },
      tax_behavior: "inclusive",
      lookup_key: lookup,
      metadata: { planCode: p.code },
    });
    console.log(`STRIPE_PRICE_${p.code}=${price.id}`);
  }
  console.log("\nSiguientes pasos: activa Stripe Tax con tu registro de IVA (ES), configura el portal de cliente y crea el webhook (ver docs/CREDENCIALES.md).");
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
