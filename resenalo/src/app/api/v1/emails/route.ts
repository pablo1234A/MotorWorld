import { z } from "zod";
import { EmailJobStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { tenantRoute } from "@/server/http/tenant";
import { parseWith, searchParams } from "@/server/http/request";
import { reasonMessage } from "@/server/modules/automation/reasons";

export const GET = tenantRoute(async (req, { business }) => {
  const q = parseWith(
    z.object({
      status: z.nativeEnum(EmailJobStatus).optional(),
      group: z.enum(["pending", "sent", "failed", "blocked"]).optional(),
      search: z.string().max(100).optional(),
      page: z.coerce.number().int().min(1).max(10000).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(25),
    }),
    Object.fromEntries([...searchParams(req).entries()].filter(([, v]) => v !== "")),
  );
  const groups: Record<string, EmailJobStatus[]> = {
    pending: ["SCHEDULED", "QUEUED", "SENDING", "ON_HOLD"],
    sent: ["SENT", "DELIVERED"],
    failed: ["FAILED", "BOUNCED"],
    blocked: ["BLOCKED", "CANCELED"],
  };
  const where: Prisma.EmailJobWhereInput = {
    businessId: business.id,
    ...(q.status ? { status: q.status } : q.group ? { status: { in: groups[q.group] } } : {}),
    ...(q.search ? { OR: [{ toEmail: { contains: q.search.toLowerCase() } }, { toName: { contains: q.search, mode: "insensitive" } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.emailJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: {
        id: true, toName: true, toEmail: true, subject: true, status: true, statusReason: true, scheduledFor: true, sentAt: true,
        createdAt: true, attempts: true, lastError: true, clickCount: true, customerId: true,
        rule: { select: { name: true } }, campaign: { select: { name: true } }, event: { select: { source: true, serviceName: true } },
      },
    }),
    prisma.emailJob.count({ where }),
  ]);
  return Response.json({ items: items.map((i) => ({ ...i, reasonText: reasonMessage(i.statusReason) })), total, page: q.page, pageSize: q.pageSize });
});
