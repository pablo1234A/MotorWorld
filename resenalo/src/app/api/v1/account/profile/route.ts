import { z } from "zod";
import { prisma } from "@/server/db";
import { userRoute } from "@/server/http/tenant";
import { readJson } from "@/server/http/request";
import { normalizePhone } from "@/lib/phone";

export const PATCH = userRoute(async (req, { user }) => {
  const b = await readJson(
    req,
    z.object({
      name: z.string().trim().min(2).max(100),
      phone: z
        .string()
        .trim()
        .max(30)
        .transform((v, ctx) => {
          const n = normalizePhone(v);
          if (!n) {
            ctx.addIssue({ code: "custom", message: "Teléfono no válido (ej. +34 600 000 000)" });
            return z.NEVER;
          }
          return n;
        })
        .optional(),
    }),
  );
  const u = await prisma.user.update({ where: { id: user.id }, data: { name: b.name, ...(b.phone ? { phone: b.phone } : {}) } });
  return Response.json({ user: { id: u.id, name: u.name, email: u.email, phone: u.phone } });
});
