import { z } from "zod";
import { CampaignStatus, EventSource } from "@prisma/client";
import { prisma } from "../db";
import { AppError, notFound } from "../http/errors";
import { requireFeature } from "./billing/entitlements";
import { createReviewRequest } from "./automation/requests";
import { audit } from "./audit";

export const campaignSchema = z.object({
  name: z.string().trim().min(1).max(100),
  templateId: z.string().min(1),
  customerIds: z.array(z.string().min(1)).min(1, "Selecciona al menos un cliente").max(500),
});

export async function listCampaigns(businessId: string) {
  const campaigns = await prisma.campaign.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, include: { template: { select: { name: true } } } });
  const stats = await prisma.emailJob.groupBy({ by: ["campaignId", "status"], where: { businessId, campaignId: { not: null } }, _count: true });
  return campaigns.map((c) => ({
    ...c,
    stats: Object.fromEntries(stats.filter((s) => s.campaignId === c.id).map((s) => [s.status, s._count])),
  }));
}

/**
 * Lanza una campaña: genera una solicitud por cliente seleccionado. Cada una
 * pasa por las mismas comprobaciones (cupo, duplicados, bajas…), por lo que
 * una campaña nunca puede superar el límite del plan.
 */
export async function launchCampaign(businessId: string, userId: string, input: z.infer<typeof campaignSchema>, req?: Request) {
  await requireFeature(businessId, "campaigns", "La gestión de campañas");
  const tpl = await prisma.emailTemplate.findFirst({ where: { id: input.templateId, businessId } });
  if (!tpl) throw notFound("Plantilla");
  const customers = await prisma.customer.findMany({ where: { businessId, id: { in: input.customerIds } }, select: { id: true } });
  if (!customers.length) throw new AppError("VALIDATION", "Ninguno de los clientes seleccionados existe.");
  const campaign = await prisma.campaign.create({
    data: { businessId, name: input.name, templateId: tpl.id, status: CampaignStatus.RUNNING, launchedAt: new Date(), totalTargets: customers.length },
  });
  const summary = { created: 0, skipped: 0, rejected: 0, reasons: {} as Record<string, number> };
  for (const c of customers) {
    const r = await createReviewRequest(businessId, { customerId: c.id, source: EventSource.CAMPAIGN, campaignId: campaign.id });
    if (r.status === "CREATED") summary.created++;
    else if (r.status === "REJECTED") summary.rejected++;
    else summary.skipped++;
    if (r.reason) summary.reasons[r.reason] = (summary.reasons[r.reason] ?? 0) + 1;
  }
  await prisma.campaign.update({ where: { id: campaign.id }, data: { status: summary.created ? CampaignStatus.RUNNING : CampaignStatus.COMPLETED } });
  await audit({ action: "campaign.launched", userId, businessId, targetId: campaign.id, meta: summary, req });
  return { campaign, summary };
}
