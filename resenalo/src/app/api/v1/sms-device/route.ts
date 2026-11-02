import { prisma } from "@/server/db";
import { tenantRoute } from "@/server/http/tenant";
import { disconnectSmsDevice, publicSmsDevice } from "@/server/modules/sms-device";
import { getEntitlements } from "@/server/modules/billing/entitlements";

export const GET = tenantRoute(async (_req, { business, user }) => {
  const [d, onHold, ent] = await Promise.all([
    prisma.smsDevice.findUnique({ where: { businessId: business.id } }),
    prisma.emailJob.count({ where: { businessId: business.id, channel: "SMS", status: "ON_HOLD" } }),
    getEntitlements(business.id),
  ]);
  return Response.json({ device: publicSmsDevice(d), onHold, smsIncluded: Boolean(ent.features?.sms), suggestedPhone: business.phone ?? user.phone ?? null });
});

export const DELETE = tenantRoute(async (req, { user, business }) => {
  await disconnectSmsDevice(business.id, user.id, req);
  return Response.json({ ok: true });
});
