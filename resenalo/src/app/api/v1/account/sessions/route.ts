import { prisma } from "@/server/db";
import { userRoute } from "@/server/http/tenant";

export const GET = userRoute(async (_req, { user, session }) => {
  const sessions = await prisma.session.findMany({
    where: { userId: user.id, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true, ip: true, userAgent: true, createdAt: true, lastSeenAt: true },
  });
  return Response.json({ sessions: sessions.map((s) => ({ ...s, current: s.id === session.id })) });
});
