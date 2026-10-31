import { z } from "zod";
import { EventSource } from "@prisma/client";
import { prisma } from "../../db";
import { AppError, notFound } from "../../http/errors";
import { getEntitlements } from "../billing/entitlements";
import { audit } from "../audit";

export const ruleSchema = z
  .object({
    name: z.string().trim().min(1, "Pon un nombre").max(80),
    active: z.boolean().default(true),
    templateId: z.string().min(1, "Elige una plantilla"),
    delayMinutes: z.coerce.number().int().min(0).max(43200, "Máximo 30 días"),
    serviceFilter: z.string().trim().max(80).optional().nullable().transform((v) => v || null),
    sources: z.array(z.nativeEnum(EventSource)).min(1, "Elige al menos un origen").refine((s) => !s.includes(EventSource.CAMPAIGN), "Las campañas no usan reglas"),
    sendWindowStart: z.coerce.number().int().min(0).max(23).optional().nullable(),
    sendWindowEnd: z.coerce.number().int().min(1).max(24).optional().nullable(),
    priority: z.coerce.number().int().min(0).max(100).default(0),
  })
  .refine((r) => (r.sendWindowStart == null) === (r.sendWindowEnd == null), { message: "Indica inicio y fin de la ventana", path: ["sendWindowEnd"] })
  .refine((r) => r.sendWindowStart == null || r.sendWindowEnd! > r.sendWindowStart, { message: "El fin debe ser posterior al inicio", path: ["sendWindowEnd"] });
export type RuleInput = z.infer<typeof ruleSchema>;

async function checkPlan(businessId: string, input: RuleInput) {
  const ent = await getEntitlements(businessId);
  if (input.serviceFilter && !ent.features?.serviceFilters) throw new AppError("PLAN_FEATURE", "Las reglas por servicio están disponibles a partir del plan Pro.");
  if (input.sendWindowStart != null && !ent.features?.sendWindow) throw new AppError("PLAN_FEATURE", "Las ventanas horarias de envío están disponibles en el plan Business.");
  const tpl = await prisma.emailTemplate.findFirst({ where: { id: input.templateId, businessId } });
  if (!tpl) throw new AppError("VALIDATION", "La plantilla seleccionada no existe.");
  return ent;
}

export const listRules = (businessId: string) =>
  prisma.automationRule.findMany({ where: { businessId }, orderBy: [{ priority: "desc" }, { createdAt: "asc" }], include: { template: { select: { id: true, name: true } } } });

export async function createRule(businessId: string, userId: string, input: RuleInput, req?: Request) {
  const ent = await checkPlan(businessId, input);
  const count = await prisma.automationRule.count({ where: { businessId } });
  const max = ent.plan?.maxAutomationRules ?? 1;
  if (count >= max) throw new AppError("PLAN_FEATURE", `Tu plan permite ${max} automatización${max > 1 ? "es" : ""}. Mejora tu plan para añadir más.`);
  const r = await prisma.automationRule.create({ data: { ...input, businessId } });
  await audit({ action: "automation_rule.created", userId, businessId, targetId: r.id, req });
  return r;
}

export async function updateRule(businessId: string, userId: string, id: string, input: RuleInput, req?: Request) {
  const existing = await prisma.automationRule.findFirst({ where: { id, businessId } });
  if (!existing) throw notFound("Automatización");
  await checkPlan(businessId, input);
  const r = await prisma.automationRule.update({ where: { id }, data: input });
  await audit({ action: "automation_rule.updated", userId, businessId, targetId: id, req });
  return r;
}

export async function deleteRule(businessId: string, userId: string, id: string, req?: Request) {
  const res = await prisma.automationRule.deleteMany({ where: { id, businessId } });
  if (!res.count) throw notFound("Automatización");
  await audit({ action: "automation_rule.deleted", userId, businessId, targetId: id, req });
}
