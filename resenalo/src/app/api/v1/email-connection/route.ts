import { prisma } from "@/server/db";
import { integrationStatus } from "@/server/env";
import { tenantRoute } from "@/server/http/tenant";
import { disconnect, publicConnection } from "@/server/modules/email-connection";

export const GET = tenantRoute(async (_req, { business }) => {
  const c = await prisma.emailConnection.findUnique({ where: { businessId: business.id } });
  const onHold = await prisma.emailJob.count({ where: { businessId: business.id, status: "ON_HOLD" } });
  const s = integrationStatus();
  return Response.json({ connection: publicConnection(c), onHold, providers: { google: s.google, microsoft: s.microsoft } });
});

export const DELETE = tenantRoute(async (req, { user, business }) => {
  await disconnect(business.id, user.id, req);
  return Response.json({ ok: true });
});
