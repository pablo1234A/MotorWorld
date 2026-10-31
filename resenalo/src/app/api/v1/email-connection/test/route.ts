import { z } from "zod";
import { prisma } from "@/server/db";
import { AppError } from "@/server/http/errors";
import { tenantRoute } from "@/server/http/tenant";
import { readJson } from "@/server/http/request";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { sendTestEmail } from "@/server/modules/email-connection";

export const POST = tenantRoute(async (req, { user, business }) => {
  await enforceRateLimit(`test-email:${business.id}`, 10, 3600, "Has enviado demasiados correos de prueba. Inténtalo más tarde.");
  const body = await readJson(req, z.object({ to: z.string().trim().toLowerCase().email().optional(), templateId: z.string().optional() }));
  const conn = await prisma.emailConnection.findUnique({ where: { businessId: business.id } });
  // Solo se permiten pruebas a direcciones del propio usuario (evita usar la prueba como envío a terceros).
  const allowed = new Set([user.email, conn?.emailAddress].filter(Boolean) as string[]);
  const to = body.to ?? user.email;
  if (!allowed.has(to)) throw new AppError("VALIDATION", "Los correos de prueba solo pueden enviarse a tu propio correo o a la cuenta conectada.");
  return Response.json(await sendTestEmail({ businessId: business.id, userId: user.id, to, templateId: body.templateId }, req));
});
