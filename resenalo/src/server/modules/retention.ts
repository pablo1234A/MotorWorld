import { prisma } from "../db";
import { logger } from "../logger";

/**
 * Política de retención (ver docs/SEGURIDAD_Y_DATOS.md):
 *  - Sesiones caducadas, tokens de auth y estados OAuth: se eliminan al caducar.
 *  - Registros de envío (email_logs): 13 meses.
 *  - Contenido de los correos (asunto/cuerpo) de envíos finalizados: se vacía a los 13 meses
 *    (se mantienen los metadatos para las estadísticas).
 *  - Eventos de automatización: 13 meses.
 *  - Auditoría: 24 meses.
 *  - Eventos de facturación Stripe: 6 años (art. 30 Código de Comercio). Facturas: no se borran.
 */
export async function runRetention(now = new Date()) {
  const months = (n: number) => new Date(now.getTime() - n * 30 * 86400_000);
  const r = {
    sessions: (await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } })).count,
    authTokens: (await prisma.authToken.deleteMany({ where: { OR: [{ expiresAt: { lt: months(1) } }, { usedAt: { lt: months(1) } }] } })).count,
    oauthStates: (await prisma.oAuthState.deleteMany({ where: { expiresAt: { lt: now } } })).count,
    emailLogs: (await prisma.emailLog.deleteMany({ where: { createdAt: { lt: months(13) } } })).count,
    events: (await prisma.automationEvent.deleteMany({ where: { createdAt: { lt: months(13) }, job: null } })).count,
    scrubbedJobs: (
      await prisma.emailJob.updateMany({
        where: { createdAt: { lt: months(13) }, status: { in: ["SENT", "DELIVERED", "FAILED", "BOUNCED", "CANCELED", "BLOCKED"] }, bodyText: { not: "" } },
        data: { bodyText: "", bodyHtml: "", subject: "[contenido eliminado por política de retención]" },
      })
    ).count,
    audit: (await prisma.auditLog.deleteMany({ where: { createdAt: { lt: months(24) } } })).count,
    billingEvents: (await prisma.billingEvent.deleteMany({ where: { createdAt: { lt: months(72) } } })).count,
  };
  logger.info({ retention: r }, "política de retención aplicada");
  return r;
}
