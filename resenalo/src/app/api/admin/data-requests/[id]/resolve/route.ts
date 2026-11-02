import { prisma } from "@/server/db";
import { route } from "@/server/http/handler";
import { AppError } from "@/server/http/errors";
import { requireUser } from "@/server/auth/context";
import { audit } from "@/server/modules/audit";
import { isAdminEmail } from "@/server/auth/page-auth";

export const POST = route(async (req, ctx) => {
  const { user } = await requireUser(req);
  if (!isAdminEmail(user.email)) throw new AppError("NOT_FOUND", "No encontrado");
  const { id } = await ctx.params;
  await prisma.dataRightsRequest.update({ where: { id }, data: { status: "RESOLVED", resolvedAt: new Date() } });
  await audit({ action: "admin.data_request_resolved", userId: user.id, targetId: id, req });
  return Response.json({ ok: true });
});
