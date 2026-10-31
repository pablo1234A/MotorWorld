import { prisma } from "@/server/db";
import { env } from "@/server/env";

/**
 * Enlace de reseña con medición de clics. Registra el clic (dato real, no
 * equivale a una reseña publicada) y redirige al perfil de reseñas del negocio.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) return Response.redirect(env().APP_URL, 302);
  const job = await prisma.emailJob.findUnique({ where: { publicToken: token }, select: { id: true, businessId: true, reviewUrl: true, firstClickedAt: true } });
  if (!job) return Response.redirect(env().APP_URL, 302);
  await prisma.emailJob.update({ where: { id: job.id }, data: { clickCount: { increment: 1 }, ...(job.firstClickedAt ? {} : { firstClickedAt: new Date() }) } });
  if (!job.firstClickedAt)
    await prisma.emailLog.create({ data: { emailJobId: job.id, businessId: job.businessId, event: "CLICKED", message: "El destinatario abrió el enlace de reseña." } });
  return new Response(null, { status: 302, headers: { location: job.reviewUrl, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}
