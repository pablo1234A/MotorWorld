/**
 * Crea en Stripe (SOLO MODO TEST) los productos y precios de Legalito y
 * muestra los identificadores price_… para configurarlos en /admin/productos.
 *
 *   STRIPE_SECRET_KEY=sk_test_... npx tsx scripts/stripe-setup.ts
 *
 * Es idempotente: reutiliza productos con el mismo `metadata.legalito_code`.
 * Se niega a ejecutarse con claves live: los precios reales los crea el
 * propietario conscientemente desde el panel de Stripe.
 */
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key || !key.startsWith("sk_test_")) {
  console.error("Este script solo funciona con una clave de pruebas (sk_test_...).");
  process.exit(1);
}
const stripe = new Stripe(key);

const PLANS = [
  { code: "one_time_pack", name: "Legalito · Pago único", amount: 3900, recurring: undefined },
  { code: "subscription_basic", name: "Legalito · Plan Básico", amount: 599, recurring: { interval: "month" as const } },
  { code: "subscription_medium", name: "Legalito · Plan Medium", amount: 999, recurring: { interval: "month" as const } },
  { code: "subscription_business", name: "Legalito · Plan Business", amount: 1999, recurring: { interval: "month" as const } },
  { code: "subscription_agency", name: "Legalito · Plan Agencia", amount: 4900, recurring: { interval: "month" as const } },
];

async function main() {
  for (const plan of PLANS) {
    const existing = await stripe.products.search({ query: `metadata['legalito_code']:'${plan.code}'` });
    const product =
      existing.data[0] ??
      (await stripe.products.create({ name: plan.name, metadata: { legalito_code: plan.code }, tax_code: "txcd_10000000" }));
    const prices = await stripe.prices.list({ product: product.id, active: true, limit: 10 });
    const price =
      prices.data.find((p) => p.unit_amount === plan.amount && (plan.recurring ? p.recurring?.interval === plan.recurring.interval : !p.recurring)) ??
      (await stripe.prices.create({
        product: product.id,
        currency: "eur",
        unit_amount: plan.amount,
        tax_behavior: "inclusive",
        ...(plan.recurring ? { recurring: plan.recurring } : {}),
        metadata: { legalito_code: plan.code },
      }));
    console.log(`${plan.code}: ${price.id}`);
  }
  console.log("\nPega cada price_… en /admin/productos (o en products.stripe_price_id).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
