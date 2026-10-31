import { z } from "zod";
import { prisma } from "@/server/db";
import { userRoute } from "@/server/http/tenant";
import { readJson } from "@/server/http/request";

export const PATCH = userRoute(async (req, { user }) => {
  const b = await readJson(req, z.object({ name: z.string().trim().min(2).max(100) }));
  const u = await prisma.user.update({ where: { id: user.id }, data: { name: b.name } });
  return Response.json({ user: { id: u.id, name: u.name, email: u.email } });
});
