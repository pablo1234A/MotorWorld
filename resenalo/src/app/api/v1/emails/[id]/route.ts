import { prisma } from "@/server/db";
import { notFound } from "@/server/http/errors";
import { tenantRoute } from "@/server/http/tenant";
import { reasonMessage } from "@/server/modules/automation/reasons";

export const GET = tenantRoute(async (_req, { business }, { id }) => {
  const job = await prisma.emailJob.findFirst({
    where: { id, businessId: business.id },
    include: { logs: { orderBy: { createdAt: "asc" } }, rule: { select: { name: true } }, campaign: { select: { name: true } }, event: true },
  });
  if (!job) throw notFound("Envío");
  const { publicToken: _t, ...safe } = job;
  void _t;
  return Response.json({ job: { ...safe, reasonText: reasonMessage(job.statusReason) } });
});
