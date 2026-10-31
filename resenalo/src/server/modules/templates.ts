import { z } from "zod";
import { prisma } from "../db";
import { AppError, notFound } from "../http/errors";
import { detectIncentiveLanguage, findUnknownVariables, FIELD_LIMITS, templateHasReviewLink, type TemplateFields } from "@/lib/template";
import { getEntitlements } from "./billing/entitlements";
import { audit } from "./audit";

const field = (k: keyof TemplateFields, min = 0) => z.string().max(FIELD_LIMITS[k], `Máximo ${FIELD_LIMITS[k]} caracteres`).refine((v) => v.trim().length >= min, "Campo obligatorio");

export const templateSchema = z.object({
  name: z.string().trim().min(1, "Pon un nombre a la plantilla").max(80),
  subject: field("subject", 3),
  greeting: field("greeting"),
  body: field("body", 10),
  closing: field("closing"),
  signature: field("signature"),
  buttonLabel: field("buttonLabel", 2),
});
export type TemplateInput = z.infer<typeof templateSchema>;

/** Validaciones de contenido: variables conocidas, enlace presente y solicitud neutral. */
export function validateTemplateContent(t: TemplateFields) {
  const unknown = findUnknownVariables(t);
  if (unknown.length) throw new AppError("VALIDATION", `Variables desconocidas: ${unknown.map((u) => `{{${u}}}`).join(", ")}`);
  if (!templateHasReviewLink(t)) throw new AppError("VALIDATION", "El mensaje principal debe incluir {{enlace_resena}}.", { details: { fields: { body: "Falta {{enlace_resena}}" } } });
  const incentives = detectIncentiveLanguage(t);
  if (incentives.length)
    throw new AppError(
      "VALIDATION",
      `Reseñalo solo permite solicitudes neutrales: no se pueden ofrecer incentivos ni condicionar la opinión (detectado: «${incentives.join("», «")}»).`,
    );
}

export const listTemplates = (businessId: string) => prisma.emailTemplate.findMany({ where: { businessId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });

export async function getTemplate(businessId: string, id: string) {
  const t = await prisma.emailTemplate.findFirst({ where: { id, businessId } });
  if (!t) throw notFound("Plantilla");
  return t;
}

export async function createTemplate(businessId: string, userId: string, input: TemplateInput, req?: Request) {
  validateTemplateContent(input);
  const ent = await getEntitlements(businessId);
  const max = ent.plan?.maxTemplates ?? 1;
  const count = await prisma.emailTemplate.count({ where: { businessId } });
  if (ent.plan?.maxTemplates !== null && count >= max)
    throw new AppError("PLAN_FEATURE", max === 1 ? "Tu plan incluye una plantilla. Edita la existente o mejora a Pro para crear plantillas personalizadas." : `Tu plan permite hasta ${max} plantillas.`);
  const t = await prisma.emailTemplate.create({ data: { ...input, businessId, isDefault: count === 0 } });
  await audit({ action: "template.created", userId, businessId, targetId: t.id, req });
  return t;
}

export async function updateTemplate(businessId: string, userId: string, id: string, input: TemplateInput, req?: Request) {
  await getTemplate(businessId, id);
  validateTemplateContent(input);
  const t = await prisma.emailTemplate.update({ where: { id }, data: input });
  await audit({ action: "template.updated", userId, businessId, targetId: id, req });
  return t;
}

export async function deleteTemplate(businessId: string, userId: string, id: string, req?: Request) {
  const t = await getTemplate(businessId, id);
  if (t.isDefault) throw new AppError("CONFLICT", "No puedes eliminar la plantilla por defecto.");
  const inUse = await prisma.automationRule.count({ where: { templateId: id } });
  const inCampaign = await prisma.campaign.count({ where: { templateId: id } });
  if (inUse || inCampaign) throw new AppError("CONFLICT", "La plantilla está en uso por una automatización o campaña.");
  await prisma.emailTemplate.delete({ where: { id } });
  await audit({ action: "template.deleted", userId, businessId, targetId: id, req });
}

export async function setDefaultTemplate(businessId: string, id: string) {
  await getTemplate(businessId, id);
  await prisma.$transaction([
    prisma.emailTemplate.updateMany({ where: { businessId, isDefault: true }, data: { isDefault: false } }),
    prisma.emailTemplate.update({ where: { id }, data: { isDefault: true } }),
  ]);
}
