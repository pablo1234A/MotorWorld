import { Queue } from "bullmq";
import { redis } from "../redis";
import { logger } from "../logger";
import { prisma } from "../db";

export const EMAIL_QUEUE = "email-send";
export const MAINTENANCE_QUEUE = "maintenance";

const g = globalThis as unknown as { emailQueue?: Queue; maintenanceQueue?: Queue };

export function emailQueue(): Queue {
  g.emailQueue ??= new Queue(EMAIL_QUEUE, {
    connection: redis(),
    defaultJobOptions: { removeOnComplete: { age: 7 * 86400, count: 5000 }, removeOnFail: { age: 30 * 86400 }, attempts: 1 },
  });
  return g.emailQueue;
}

export function maintenanceQueue(): Queue {
  g.maintenanceQueue ??= new Queue(MAINTENANCE_QUEUE, { connection: redis(), defaultJobOptions: { removeOnComplete: 100, removeOnFail: 500 } });
  return g.maintenanceQueue;
}

/**
 * Encola el envío de un EmailJob. La BD es la fuente de verdad: si Redis
 * falla, el barrido periódico del worker vuelve a encolar los trabajos
 * pendientes. Encolar dos veces el mismo trabajo es inocuo: el worker lo
 * reclama de forma atómica (QUEUED → SENDING) y solo uno llega a enviarlo.
 */
export async function enqueueEmailJob(emailJobId: string, delayMs = 0) {
  try {
    const jobId = `${emailJobId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    await emailQueue().add("send", { emailJobId }, { jobId, delay: Math.max(0, Math.round(delayMs)) });
    await prisma.emailJob.update({ where: { id: emailJobId }, data: { lastEnqueuedAt: new Date(Date.now() + Math.max(0, delayMs)) } }).catch(() => undefined);
  } catch (err) {
    logger.warn({ err, emailJobId }, "no se pudo encolar en Redis; lo recogerá el barrido periódico");
  }
}
