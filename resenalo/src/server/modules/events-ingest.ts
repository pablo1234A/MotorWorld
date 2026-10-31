import { z } from "zod";
import { CustomerSource, EventSource, type Business, type Prisma } from "@prisma/client";
import { prisma } from "../db";
import { AppError } from "../http/errors";
import { isValidEmail, normalizeEmailAddress } from "@/lib/email";
import { getEntitlements, subscriptionAllowsSending } from "./billing/entitlements";
import { createReviewRequest } from "./automation/requests";

/** Contrato público de eventos "servicio finalizado" (API REST y webhook entrante). */
export const inboundEventSchema = z.object({
  externalId: z.string().trim().min(1).max(120).optional(),
  customer: z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().max(254).refine(isValidEmail, "email no válido"),
    phone: z.string().trim().max(30).optional(),
  }),
  serviceName: z.string().trim().max(160).optional(),
  completedAt: z.coerce.date().optional(),
  metadata: z.record(z.string(), z.union([z.string().max(500), z.number(), z.boolean(), z.null()])).optional(),
});
export type InboundEvent = z.infer<typeof inboundEventSchema>;

export async function ingestEvent(business: Business, ev: InboundEvent, source: "API" | "WEBHOOK") {
  const ent = await getEntitlements(business.id);
  if (!subscriptionAllowsSending(ent.subscription)) throw new AppError("PAYMENT_REQUIRED", "La suscripción del negocio no está activa.");
  if (!ent.features?.apiAccess) throw new AppError("PLAN_FEATURE", "La API y los webhooks están disponibles a partir del plan Pro.");
  if (ev.completedAt && ev.completedAt.getTime() > Date.now() + 86400_000) throw new AppError("VALIDATION", "completedAt no puede estar en el futuro.");

  const email = normalizeEmailAddress(ev.customer.email);
  const customer = await prisma.customer.upsert({
    where: { businessId_email: { businessId: business.id, email } },
    create: {
      businessId: business.id,
      email,
      name: ev.customer.name,
      phone: ev.customer.phone ?? null,
      serviceName: ev.serviceName ?? null,
      completedAt: ev.completedAt ?? new Date(),
      source: source === "API" ? CustomerSource.API : CustomerSource.WEBHOOK,
    },
    update: {
      name: ev.customer.name,
      ...(ev.serviceName ? { serviceName: ev.serviceName } : {}),
      completedAt: ev.completedAt ?? new Date(),
    },
  });
  const result = await createReviewRequest(business.id, {
    customerId: customer.id,
    source: source === "API" ? EventSource.API : EventSource.WEBHOOK,
    externalId: ev.externalId ?? null,
    serviceName: ev.serviceName ?? null,
    completedAt: ev.completedAt ?? new Date(),
    payload: (ev.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
  });
  return { customerId: customer.id, ...result };
}
