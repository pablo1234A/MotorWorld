import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';

function sameToken(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Supervisión para un monitor externo (uptime, alertas): estado de la base de datos, del
 * proceso de envío y de la cola. Solo cifras agregadas: ni empresas, ni personas, ni emails.
 * Exige `Authorization: Bearer <OPS_STATUS_TOKEN>`; sin token configurado, la ruta no existe.
 */
export async function opsRoutes(app: FastifyInstance) {
  app.get(
    '/status',
    { config: { auth: 'none', rateLimit: { max: 60, timeWindow: 60_000 } } },
    async (req, reply) => {
      const expected = app.config.opsStatusToken;
      const notFound = () => reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada.', requestId: req.id } });
      if (!expected) return notFound();
      const header = req.headers.authorization ?? '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : '';
      if (!token || !sameToken(token, expected)) return notFound();

      const { rows } = await sql<{ status: Record<string, any> }>`select app_ops_status() as status`.execute(app.db);
      const status = rows[0]!.status;
      const dispatcher = status.jobs?.dispatcher as { startedAt?: string } | undefined;
      const intervalMs = app.config.automation.workerIntervalMs;
      const workerHealthy = !!dispatcher?.startedAt && Date.now() - Date.parse(dispatcher.startedAt) < intervalMs * 3 + 60_000;
      // Alertas que merecen atención humana (el monitor puede avisar si la lista no está vacía).
      const alerts: string[] = [];
      if (status.automationCompanies > 0 && !workerHealthy) alerts.push('worker_not_running');
      if (status.deliveries.stuckSending > 0) alerts.push('deliveries_stuck_sending');
      if (status.followUps.dueApprovedOver15m > 0) alerts.push('approved_emails_delayed');
      if (status.jobErrorsLast24h > 0) alerts.push('job_errors_last_24h');
      // Informativa: respuestas fechadas antes de un seguimiento ya registrado (revisar con `npm run ops -- backdated`).
      const review = status.recoveries?.notCountedBackdatedLast30d > 0 ? ['recoveries_backdated_review'] : [];
      return { status: alerts.length ? 'degraded' : 'ok', database: 'ok', worker: { healthy: workerHealthy }, alerts, review, ...status };
    },
  );
}
