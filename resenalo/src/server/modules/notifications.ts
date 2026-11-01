import { prisma } from "../db";
import { env } from "../env";
import { logger } from "../logger";
import { sendSystemEmail } from "../email/system-mailer";
import { subscriptionAllowsSending } from "./billing/entitlements";

/**
 * Avisos de consumo al propietario: uno al llegar al 80 % y otro al 100 % del
 * cupo de correos, como máximo una vez por ventana de consumo (marca atómica).
 */
export async function checkUsageAlerts(businessId: string) {
  try {
    const usage = await prisma.monthlyUsage.findFirst({ where: { businessId }, orderBy: { periodStart: "desc" } });
    if (!usage || usage.emailLimit <= 0) return;
    const pct = usage.sent / usage.emailLimit;
    const level = pct >= 1 ? 100 : pct >= 0.8 ? 80 : null;
    if (!level) return;
    const field = level === 100 ? "alert100At" : "alert80At";
    const claimed = await prisma.monthlyUsage.updateMany({ where: { id: usage.id, [field]: null }, data: { [field]: new Date() } });
    if (!claimed.count) return;
    const b = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, include: { owner: true } });
    const reset = usage.periodEnd.toLocaleDateString("es-ES", { dateStyle: "long" });
    await sendSystemEmail({
      to: b.owner.email,
      subject: level === 100 ? "Has agotado los correos de tu plan este mes" : "Has usado el 80 % de los correos de tu plan",
      heading: level === 100 ? "Cupo mensual agotado" : "Te queda poco cupo este mes",
      paragraphs:
        level === 100
          ? [`${b.name} ha enviado ${usage.sent} de ${usage.emailLimit} correos. Las nuevas solicitudes se bloquearán hasta el ${reset}.`, "Si quieres seguir pidiendo reseñas sin esperar, puedes mejorar tu plan: el nuevo límite se aplica al instante."]
          : [`${b.name} lleva ${usage.sent} de ${usage.emailLimit} correos este periodo. El contador se reinicia el ${reset}.`],
      action: { label: level === 100 ? "Ampliar mi plan" : "Ver mi consumo", url: `${env().APP_URL}/app/facturacion` },
    });
  } catch (err) {
    logger.warn({ err, businessId }, "no se pudo enviar el aviso de consumo");
  }
}

/** Resumen semanal (lunes por la mañana) con datos reales de los últimos 7 días. Solo si hubo actividad. */
export async function sendWeeklyDigests(now = new Date()) {
  const since = new Date(now.getTime() - 7 * 86400_000);
  const businesses = await prisma.business.findMany({
    where: { weeklyDigest: true, onboardingCompletedAt: { not: null } },
    include: { owner: true, subscription: true, reviewSource: true },
  });
  let sent = 0;
  for (const b of businesses) {
    if (!subscriptionAllowsSending(b.subscription, now) || b.owner.deletedAt) continue;
    const [emails, failed, clicked, reviews] = await Promise.all([
      prisma.emailJob.count({ where: { businessId: b.id, sentAt: { gte: since } } }),
      prisma.emailJob.count({ where: { businessId: b.id, failedAt: { gte: since }, status: { in: ["FAILED", "BOUNCED"] } } }),
      prisma.emailJob.count({ where: { businessId: b.id, firstClickedAt: { gte: since } } }),
      prisma.review.findMany({ where: { businessId: b.id, createTime: { gte: since } }, select: { starRating: true } }),
    ]);
    if (!emails && !failed && !reviews.length) continue;
    const avg = reviews.length ? (reviews.reduce((a, r) => a + r.starRating, 0) / reviews.length).toLocaleString("es-ES", { maximumFractionDigits: 1 }) : null;
    const lines = [
      `Solicitudes enviadas: ${emails}`,
      `Clientes que abrieron el enlace de reseña: ${clicked}`,
      ...(b.reviewSource ? [`Reseñas nuevas en Google: ${reviews.length}${avg ? ` (media ${avg} ★)` : ""}`] : []),
      ...(failed ? [`Envíos fallidos que conviene revisar: ${failed}`] : []),
    ];
    try {
      await sendSystemEmail({
        to: b.owner.email,
        subject: `Tu semana en Reseñalo: ${emails} solicitudes${reviews.length ? ` y ${reviews.length} reseñas nuevas` : ""}`,
        heading: `Resumen semanal de ${b.name}`,
        paragraphs: lines,
        action: { label: "Ver mi panel", url: `${env().APP_URL}/app` },
        footnote: "Puedes desactivar este resumen en Configuración del negocio.",
      });
      sent++;
    } catch (err) {
      logger.warn({ err, businessId: b.id }, "no se pudo enviar el resumen semanal");
    }
  }
  return { sent };
}
