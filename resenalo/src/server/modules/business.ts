import { z } from "zod";
import { EventSource } from "@prisma/client";
import { prisma } from "../db";
import { AppError } from "../http/errors";
import { DEFAULT_TEMPLATE } from "@/lib/template";
import { isValidTimeZone } from "./automation/schedule";
import { audit } from "./audit";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const reviewUrlSchema = z
  .string()
  .trim()
  .url("Introduce una URL válida (https://…)")
  .max(500)
  .refine((u) => u.startsWith("https://"), "El enlace debe empezar por https://");

export const businessSchema = z.object({
  name: z.string().trim().min(2, "Indica el nombre del negocio").max(120),
  legalName: optionalText(160),
  taxId: optionalText(30),
  addressLine: optionalText(200),
  city: optionalText(80),
  postalCode: optionalText(12),
  country: z.string().trim().length(2).default("ES"),
  phone: optionalText(30),
  website: z.string().trim().url().max(300).optional().nullable().or(z.literal("")).transform((v) => v || null),
  reviewUrl: reviewUrlSchema.optional().nullable().or(z.literal("")).transform((v) => v || null),
  reviewPlatform: z.enum(["google", "tripadvisor", "trustpilot", "facebook", "otro"]).default("google"),
  senderName: optionalText(80),
  replyToEmail: z.string().trim().toLowerCase().email("Correo de respuesta no válido").optional().nullable().or(z.literal("")).transform((v) => v || null),
  timezone: z.string().refine(isValidTimeZone, "Zona horaria no válida").default("Europe/Madrid"),
  resendCooldownDays: z.coerce.number().int().min(0).max(365).default(30),
  trackClicks: z.boolean().default(true),
});

export type BusinessInput = z.infer<typeof businessSchema>;

/** Onboarding: crea el negocio con una plantilla y una automatización por defecto. */
export async function createBusiness(userId: string, input: BusinessInput & { acceptDpa: boolean }, req?: Request) {
  const existing = await prisma.business.findFirst({ where: { ownerId: userId } });
  if (existing) throw new AppError("CONFLICT", "Ya has creado tu negocio.");
  if (!input.acceptDpa) throw new AppError("VALIDATION", "Debes aceptar el acuerdo de encargo de tratamiento de datos.");
  const { acceptDpa: _acceptDpa, ...data } = input;
  void _acceptDpa;
  const business = await prisma.$transaction(async (tx) => {
    const b = await tx.business.create({ data: { ...data, ownerId: userId, dpaAcceptedAt: new Date() } });
    const t = await tx.emailTemplate.create({ data: { businessId: b.id, name: "Plantilla principal", isDefault: true, ...DEFAULT_TEMPLATE } });
    await tx.automationRule.create({
      data: {
        businessId: b.id,
        name: "Solicitud tras finalizar el servicio",
        templateId: t.id,
        delayMinutes: 120,
        sources: [EventSource.MANUAL, EventSource.CSV, EventSource.API, EventSource.WEBHOOK],
      },
    });
    return b;
  });
  await audit({ action: "business.created", userId, businessId: business.id, req });
  return business;
}

export async function updateBusiness(businessId: string, userId: string, input: Partial<BusinessInput>, req?: Request) {
  const b = await prisma.business.update({ where: { id: businessId }, data: input });
  await audit({ action: "business.updated", userId, businessId, meta: { fields: Object.keys(input) }, req });
  return b;
}

export async function completeOnboarding(businessId: string) {
  return prisma.business.update({ where: { id: businessId }, data: { onboardingCompletedAt: new Date() } });
}

export async function setAutomationPaused(businessId: string, userId: string, paused: boolean, req?: Request) {
  await prisma.business.update({ where: { id: businessId }, data: { automationPaused: paused } });
  await audit({ action: paused ? "automation.paused" : "automation.resumed", userId, businessId, req });
}
