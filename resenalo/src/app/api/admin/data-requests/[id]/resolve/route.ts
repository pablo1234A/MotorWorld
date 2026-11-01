import { prisma } from "@/server/db";
import { route } from "@/server/http/handler";
import { AppError } from "@/server/http/errors";
import { requireUser } from "@/server/auth/context";
import { audit } from "@/server/modules/audit";

function isAdmin(email: string) {
  return (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
}

export const POST = route(async (req, ctx) => {
  const { user } = await requireUser(req);
  if (!isAdmin(user.email)) throw new AppError("NOT_FOUND", "No encontrado");
  const { id } = await ctx.params;
  await prisma.dataRightsRequest.update({ where: { id }, data: { status: "RESOLVED", resolvedAt: new Date() } });
  await audit({ action: "admin.data_request_resolved", userId: user.id, targetId: id, req });
  return Response.json({ ok: true });
});
