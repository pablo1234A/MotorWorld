import { PrismaClient, PlanCode } from "@prisma/client";
import { PLANS } from "../src/config/plans";

const prisma = new PrismaClient();

/** Sincroniza los planes comerciales con la BD. Idempotente. */
async function main() {
  const priceEnv: Record<string, string | undefined> = {
    STARTER: process.env.STRIPE_PRICE_STARTER,
    PRO: process.env.STRIPE_PRICE_PRO,
    BUSINESS: process.env.STRIPE_PRICE_BUSINESS,
  };
  for (const p of PLANS) {
    const data = {
      name: p.name,
      priceCents: p.priceCents,
      vatRateBps: p.vatRateBps,
      monthlyEmailLimit: p.monthlyEmailLimit,
      maxTemplates: p.maxTemplates,
      maxAutomationRules: p.maxAutomationRules,
      features: p.features,
      sortOrder: p.sortOrder,
      active: true,
      ...(priceEnv[p.code] ? { stripePriceId: priceEnv[p.code] } : {}),
    };
    await prisma.plan.upsert({ where: { code: p.code as PlanCode }, create: { code: p.code as PlanCode, ...data }, update: data });
    console.log(`plan ${p.code}: ${priceEnv[p.code] ? "vinculado a " + priceEnv[p.code] : "SIN precio de Stripe (configura STRIPE_PRICE_" + p.code + ")"}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
