import { z } from "zod";
import { prisma } from "@/server/db";
import { integrationStatus } from "@/server/env";
import { tenantRoute } from "@/server/http/tenant";
import { parseWith, searchParams } from "@/server/http/request";
import { reviewSummary } from "@/server/modules/reviews";
import { getEntitlements } from "@/server/modules/billing/entitlements";

export const GET = tenantRoute(async (req, { business }) => {
  const q = parseWith(
    z.object({ page: z.coerce.number().int().min(1).max(1000).default(1), rating: z.coerce.number().int().min(1).max(5).optional(), unreplied: z.enum(["1"]).optional() }),
    Object.fromEntries([...searchParams(req).entries()].filter(([, v]) => v !== "")),
  );
  const where = { businessId: business.id, ...(q.rating ? { starRating: q.rating } : {}), ...(q.unreplied ? { replyComment: null } : {}) };
  const [items, total, summary, ent] = await Promise.all([
    prisma.review.findMany({ where, orderBy: { createTime: "desc" }, skip: (q.page - 1) * 20, take: 20, include: { job: { select: { id: true, toName: true, sentAt: true } } } }),
    prisma.review.count({ where }),
    reviewSummary(business.id, 30),
    getEntitlements(business.id),
  ]);
  return Response.json({ configured: integrationStatus().google, summary, items, total, page: q.page, canReply: Boolean(ent.features?.reviewReplies) });
});
