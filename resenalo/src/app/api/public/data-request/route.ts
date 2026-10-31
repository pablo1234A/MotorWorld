import { z } from "zod";
import { DataRequestType } from "@prisma/client";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { route } from "@/server/http/handler";
import { clientIp, readJson } from "@/server/http/request";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { sendSystemEmail } from "@/server/email/system-mailer";

/** Formulario público para ejercer derechos RGPD (acceso, rectificación, supresión…). */
export const POST = route(async (req) => {
  await enforceRateLimit(`dsr:${clientIp(req)}`, 5, 3600);
  const b = await readJson(
    req,
    z.object({
      type: z.nativeEnum(DataRequestType),
      name: z.string().trim().min(2).max(120),
      email: z.string().trim().toLowerCase().email(),
      message: z.string().trim().min(10, "Describe brevemente tu solicitud").max(3000),
    }),
  );
  const r = await prisma.dataRightsRequest.create({ data: b });
  const admin = env().ADMIN_NOTIFICATIONS_EMAIL;
  if (admin)
    await sendSystemEmail({
      to: admin,
      subject: `[RGPD] Nueva solicitud ${b.type} (${r.id})`,
      heading: "Nueva solicitud de derechos de protección de datos",
      paragraphs: [`Tipo: ${b.type}`, `Nombre: ${b.name}`, `Email: ${b.email}`, `Mensaje: ${b.message}`, "Plazo legal de respuesta: 1 mes (art. 12.3 RGPD)."],
    }).catch(() => undefined);
  await sendSystemEmail({
    to: b.email,
    subject: "Hemos recibido tu solicitud de protección de datos",
    heading: "Solicitud recibida",
    paragraphs: [`Referencia: ${r.id}.`, "Responderemos en el plazo máximo de un mes. Podremos pedirte que acredites tu identidad."],
  }).catch(() => undefined);
  return Response.json({ ok: true, reference: r.id }, { status: 201 });
});
