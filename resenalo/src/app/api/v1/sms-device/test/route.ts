import { z } from "zod";
import { AppError } from "@/server/http/errors";
import { tenantRoute } from "@/server/http/tenant";
import { readJson } from "@/server/http/request";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { normalizePhone } from "@/lib/phone";
import { sendTestSms } from "@/server/modules/sms-device";

/** SMS de prueba: solo al teléfono del propio usuario o del negocio. */
export const POST = tenantRoute(async (req, { user, business }) => {
  await enforceRateLimit(`sms-test:${business.id}`, 5, 3600, "Has enviado demasiados SMS de prueba. Inténtalo más tarde.");
  const { to } = await readJson(req, z.object({ to: z.string().trim().max(30) }));
  const allowed = new Set([normalizePhone(user.phone), normalizePhone(business.phone)].filter(Boolean));
  const n = normalizePhone(to);
  if (!n || !allowed.has(n)) throw new AppError("VALIDATION", "El SMS de prueba solo puede enviarse a tu propio teléfono o al del negocio.");
  return Response.json(await sendTestSms(business.id, user.id, n, req));
});
