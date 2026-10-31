import { prisma } from "@/server/db";
import { userRoute } from "@/server/http/tenant";
import { audit } from "@/server/modules/audit";

export const DELETE = userRoute(async (req, { user }, { id }) => {
  await prisma.session.deleteMany({ where: { id, userId: user.id } });
  await audit({ action: "auth.session_revoked", userId: user.id, targetId: id, req });
  return Response.json({ ok: true });
});
