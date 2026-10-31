import { prisma } from "@/server/db";
import { integrationStatus } from "@/server/env";
import { tenantRoute } from "@/server/http/tenant";
import { getEntitlements } from "@/server/modules/billing/entitlements";
import { usageSummary } from "@/server/modules/stats";
import { vatBreakdown } from "@/lib/money";

export const GET = tenantRoute(async (_req, { business }) => {
  const ent = await getEntitlements(business.id);
  const plans = await prisma.plan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  const invoices = await prisma.invoice.findMany({ where: { businessId: business.id }, orderBy: { issuedAt: "desc" }, take: 36 });
  return Response.json({
    stripeConfigured: integrationStatus().stripe,
    hasStripeCustomer: Boolean(business.stripeCustomerId),
    subscription: ent.subscription
      ? {
          status: ent.subscription.status,
          planCode: ent.subscription.plan.code,
          currentPeriodStart: ent.subscription.currentPeriodStart,
          currentPeriodEnd: ent.subscription.currentPeriodEnd,
          cancelAtPeriodEnd: ent.subscription.cancelAtPeriodEnd,
          canSend: ent.canSend,
        }
      : null,
    usage: await usageSummary(business.id),
    plans: plans.map((p) => ({
      code: p.code,
      name: p.name,
      monthlyEmailLimit: p.monthlyEmailLimit,
      available: Boolean(p.stripePriceId),
      price: vatBreakdown(p.priceCents, p.vatRateBps),
      features: p.features,
    })),
    invoices,
  });
});
