/**
 * Proceso en segundo plano de Reseñalo.
 *  - Cola "email-send": envía los EmailJob (Gmail API / Microsoft Graph).
 *  - Cola "maintenance": barrido cada 30 s, salud de conexiones cada 6 h, retención diaria.
 * Ejecutar con: npm run worker  (se pueden lanzar varias réplicas)
 */
process.env.SERVICE_NAME ??= "resenalo-worker";
import { Worker } from "bullmq";
import { ConnectionStatus } from "@prisma/client";
import { prisma } from "../server/db";
import { env } from "../server/env";
import { redis } from "../server/redis";
import { logger, reportError } from "../server/logger";
import { EMAIL_QUEUE, MAINTENANCE_QUEUE, maintenanceQueue } from "../server/queue/queues";
import { processEmailJob, sweep } from "../server/modules/automation/sender";
import { checkConnection } from "../server/modules/email-connection";
import { runRetention } from "../server/modules/retention";

async function connectionHealth() {
  const stale = await prisma.emailConnection.findMany({
    where: { status: ConnectionStatus.ACTIVE, OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(Date.now() - 24 * 3600_000) } }] },
    select: { businessId: true },
    take: 200,
  });
  let failed = 0;
  for (const c of stale) {
    const r = await checkConnection(c.businessId).catch(() => ({ ok: false }));
    if (!r.ok) failed++;
  }
  return { checked: stale.length, failed };
}

async function main() {
  env(); // valida la configuración al arrancar
  const connection = redis();

  const emailWorker = new Worker(
    EMAIL_QUEUE,
    async (job) => {
      const outcome = await processEmailJob(String(job.data.emailJobId));
      logger.info({ emailJobId: job.data.emailJobId, outcome }, "email job procesado");
      return { outcome };
    },
    {
      connection,
      concurrency: env().WORKER_CONCURRENCY,
      // Límite global prudente para no saturar a los proveedores.
      limiter: { max: 10, duration: 1000 },
    },
  );

  const maintenanceWorker = new Worker(
    MAINTENANCE_QUEUE,
    async (job) => {
      if (job.name === "sweep") return sweep();
      if (job.name === "connection-health") return connectionHealth();
      if (job.name === "retention") return runRetention();
      return null;
    },
    { connection, concurrency: 1 },
  );

  for (const w of [emailWorker, maintenanceWorker]) {
    w.on("failed", (job, err) => void reportError(err, { queue: w.name, jobId: job?.id }));
    w.on("error", (err) => void reportError(err, { queue: w.name }));
  }

  const mq = maintenanceQueue();
  await mq.upsertJobScheduler("sweep", { every: 30_000 }, { name: "sweep" });
  await mq.upsertJobScheduler("connection-health", { every: 6 * 3600_000 }, { name: "connection-health" });
  await mq.upsertJobScheduler("retention", { pattern: "17 3 * * *", tz: "Europe/Madrid" }, { name: "retention" });
  await sweep(); // recupera trabajos pendientes al arrancar

  logger.info({ concurrency: env().WORKER_CONCURRENCY }, "worker de Reseñalo iniciado");

  const shutdown = async (sig: string) => {
    logger.info({ sig }, "deteniendo worker…");
    await Promise.allSettled([emailWorker.close(), maintenanceWorker.close()]);
    await prisma.$disconnect();
    connection.disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.fatal({ err }, "el worker no pudo arrancar");
  process.exit(1);
});
