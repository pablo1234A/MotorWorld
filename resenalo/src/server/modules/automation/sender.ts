import {
  ConnectionStatus,
  CustomerEmailStatus,
  EmailJobStatus,
  EmailLogEvent,
  RequestStatus,
  type EmailJob,
  type Prisma,
} from "@prisma/client";
import { prisma, type Tx } from "../../db";
import { env } from "../../env";
import { logger, reportError } from "../../logger";
import { getProvider } from "../../email/providers";
import { ProviderError } from "../../email/providers/types";
import { buildMime } from "../../email/mime";
import { enqueueEmailJob } from "../../queue/queues";
import { getAccessToken, markAuthFailure } from "../email-connection";
import { getCurrentUsage, subscriptionAllowsSending } from "../billing/entitlements";
import { lockBusiness, refreshCustomerRequestStatus, trackingUrls } from "./requests";

/** Backoff exponencial con jitter: 1, 4, 16, 64 min… (máx. 6 h). */
export function backoffMs(attempt: number, retryAfterSec?: number) {
  const base = Math.min(60_000 * 4 ** Math.max(0, attempt - 1), 6 * 3600_000);
  const jitter = Math.floor(Math.random() * 0.2 * base);
  return Math.max(base + jitter, (retryAfterSec ?? 0) * 1000);
}

export type SendOutcome =
  | "sent"
  | "retry"
  | "failed"
  | "bounced"
  | "on_hold"
  | "blocked"
  | "skipped"
  | "paused";

async function log(db: Tx | typeof prisma, job: Pick<EmailJob, "id" | "businessId">, event: EmailLogEvent, message: string, meta?: Prisma.InputJsonValue) {
  await db.emailLog.create({ data: { emailJobId: job.id, businessId: job.businessId, event, message: message.slice(0, 1000), meta } });
}

/** Libera la reserva de cupo de un trabajo (si la tenía). */
async function releaseReservation(tx: Tx, job: Pick<EmailJob, "id" | "businessId" | "usagePeriodStart">, opts: { countFailed?: boolean } = {}) {
  if (!job.usagePeriodStart) return;
  await tx.$executeRaw`
    UPDATE monthly_usage SET reserved = GREATEST(reserved - 1, 0), failed = failed + ${opts.countFailed ? 1 : 0}, updated_at = now()
    WHERE business_id = ${job.businessId} AND period_start = ${job.usagePeriodStart}`;
  await tx.emailJob.update({ where: { id: job.id }, data: { usagePeriodStart: null } });
}

type Claim =
  | { kind: "go"; job: EmailJob }
  | { kind: "stop"; outcome: SendOutcome };

/**
 * Paso 1 (transaccional): reclama el trabajo (QUEUED → SENDING), vuelve a
 * validar suscripción / baja / conexión y reserva 1 unidad de cupo de forma
 * atómica. Si el cupo está agotado el trabajo queda BLOCKED y no se envía.
 */
async function claim(emailJobId: string): Promise<Claim> {
  return prisma.$transaction(
    async (tx) => {
      const pre = await tx.emailJob.findUnique({ where: { id: emailJobId }, select: { businessId: true } });
      if (!pre) return { kind: "stop", outcome: "skipped" };
      await lockBusiness(tx, pre.businessId);
      const now = new Date();
      const claimed = await tx.emailJob.updateMany({
        where: { id: emailJobId, status: EmailJobStatus.QUEUED, scheduledFor: { lte: new Date(now.getTime() + 5_000) } },
        data: { status: EmailJobStatus.SENDING, sendingStartedAt: now, attempts: { increment: 1 } },
      });
      if (!claimed.count) return { kind: "stop", outcome: "skipped" }; // otro worker lo tiene o ya no está pendiente
      const job = await tx.emailJob.findUniqueOrThrow({ where: { id: emailJobId }, include: { customer: true, business: true, event: { select: { source: true } } } });

      const block = async (status: EmailJobStatus, reason: string, event: EmailLogEvent, message: string, outcome: SendOutcome): Promise<Claim> => {
        // ON_HOLD no es un intento real: no consume reintentos (igual que la pausa y el error de autorización).
        await tx.emailJob.update({
          where: { id: job.id },
          data: { status, statusReason: reason, sendingStartedAt: null, ...(status === EmailJobStatus.ON_HOLD ? { attempts: { decrement: 1 } } : {}) },
        });
        await log(tx, job, event, message);
        if (status === EmailJobStatus.BLOCKED) await tx.customer.update({ where: { id: job.customerId }, data: { lastRequestStatus: RequestStatus.BLOCKED } });
        return { kind: "stop", outcome };
      };

      const explicitSend = job.campaignId || job.event?.source === "MANUAL";
      if (job.business.automationPaused && !explicitSend) {
        // Pausa global: se devuelve a programado; el barrido no lo recogerá hasta reanudar.
        await tx.emailJob.update({ where: { id: job.id }, data: { status: EmailJobStatus.SCHEDULED, attempts: { decrement: 1 }, sendingStartedAt: null } });
        return { kind: "stop", outcome: "paused" };
      }
      const sub = await tx.subscription.findUnique({ where: { businessId: job.businessId } });
      if (!subscriptionAllowsSending(sub))
        return block(EmailJobStatus.BLOCKED, "SUBSCRIPTION_INACTIVE", EmailLogEvent.BLOCKED, "Bloqueado: la suscripción no está activa.", "blocked");
      if (job.customer.unsubscribedAt)
        return block(EmailJobStatus.BLOCKED, "UNSUBSCRIBED", EmailLogEvent.BLOCKED, "Bloqueado: el cliente se dio de baja.", "blocked");
      if (job.customer.emailStatus !== CustomerEmailStatus.VALID)
        return block(EmailJobStatus.BLOCKED, "INVALID_EMAIL", EmailLogEvent.BLOCKED, "Bloqueado: el correo del cliente no es válido o fue rechazado.", "blocked");

      const conn = await tx.emailConnection.findUnique({ where: { businessId: job.businessId } });
      if (!conn || conn.status === ConnectionStatus.DISCONNECTED)
        return block(EmailJobStatus.ON_HOLD, "EMAIL_DISCONNECTED", EmailLogEvent.ON_HOLD, "En espera: no hay cuenta de correo conectada.", "on_hold");
      if (conn.status === ConnectionStatus.NEEDS_REAUTH)
        return block(EmailJobStatus.ON_HOLD, "NEEDS_REAUTH", EmailLogEvent.ON_HOLD, "En espera: la cuenta de correo necesita volver a autorizarse.", "on_hold");

      // Reserva atómica de cupo: solo tiene éxito si sent + reserved < límite.
      const usage = await getCurrentUsage(job.businessId, tx);
      if (!usage) return block(EmailJobStatus.BLOCKED, "SUBSCRIPTION_INACTIVE", EmailLogEvent.BLOCKED, "Bloqueado: sin periodo de facturación.", "blocked");
      const reserved = await tx.$executeRaw`
        UPDATE monthly_usage SET reserved = reserved + 1, updated_at = now()
        WHERE id = ${usage.id} AND sent + reserved < email_limit`;
      if (!reserved)
        return block(EmailJobStatus.BLOCKED, "LIMIT_REACHED", EmailLogEvent.BLOCKED_LIMIT, "Bloqueado: límite mensual del plan alcanzado. No se ha enviado.", "blocked");

      const updated = await tx.emailJob.update({ where: { id: job.id }, data: { usagePeriodStart: usage.periodStart, connectionId: conn.id } });
      await log(tx, job, EmailLogEvent.SEND_ATTEMPT, `Intento de envío nº ${updated.attempts} vía ${conn.provider === "GOOGLE" ? "Gmail" : "Outlook"}.`);
      return { kind: "go", job: updated };
    },
    { timeout: 15_000, maxWait: 10_000 },
  );
}

/**
 * Procesa un EmailJob de principio a fin. Idempotente: si el trabajo ya no está
 * en cola (enviado, cancelado, en curso en otro worker) no hace nada.
 * Un correo SOLO se contabiliza como enviado cuando el proveedor confirma su aceptación.
 */
export async function processEmailJob(emailJobId: string): Promise<SendOutcome> {
  const c = await claim(emailJobId);
  if (c.kind === "stop") {
    if (c.outcome === "blocked" || c.outcome === "on_hold") {
      const j = await prisma.emailJob.findUnique({ where: { id: emailJobId } });
      if (j) await refreshCustomerRequestStatus(j.customerId);
    }
    return c.outcome;
  }
  const job = c.job;
  const conn = await prisma.emailConnection.findUniqueOrThrow({ where: { id: job.connectionId! } });
  const business = await prisma.business.findUniqueOrThrow({ where: { id: job.businessId } });

  let providerMessageId: string | null;
  try {
    const accessToken = await getAccessToken(conn);
    const urls = trackingUrls(job.publicToken);
    const host = new URL(env().APP_URL).hostname;
    const mime = await buildMime({
      from: { name: business.senderName || business.name, address: conn.emailAddress },
      to: { name: job.toName, address: job.toEmail },
      replyTo: business.replyToEmail,
      subject: job.subject,
      text: job.bodyText,
      html: job.bodyHtml,
      messageId: `<${job.id}.${job.publicToken.slice(0, 8)}@${host}>`,
      unsubscribeUrl: urls.oneClick,
      headers: { "X-Resenalo-Request": job.id },
    });
    ({ providerMessageId } = await getProvider(conn.provider).send(accessToken, mime));
  } catch (err) {
    return handleSendError(job, conn.id, err);
  }

  // Confirmado por el proveedor → se contabiliza. Queda FUERA del try: si este
  // registro falla, el correo ya salió y NO debe reintentarse (evita duplicados);
  // el trabajo sigue en SENDING y el barrido lo marcará como resultado desconocido.
  await prisma.$transaction(async (tx) => {
    await tx.emailJob.update({
      where: { id: job.id },
      data: { status: EmailJobStatus.SENT, sentAt: new Date(), providerMessageId, lastError: null, statusReason: null, sendingStartedAt: null },
    });
    if (job.usagePeriodStart) {
      await tx.$executeRaw`
        UPDATE monthly_usage SET reserved = GREATEST(reserved - 1, 0), sent = sent + 1, updated_at = now()
        WHERE business_id = ${job.businessId} AND period_start = ${job.usagePeriodStart}`;
    }
    await tx.customer.update({ where: { id: job.customerId }, data: { lastRequestAt: new Date(), lastRequestStatus: RequestStatus.SENT } });
    await log(tx, job, EmailLogEvent.SENT, `Aceptado por ${conn.provider === "GOOGLE" ? "Gmail" : "Outlook"}${providerMessageId ? ` (id ${providerMessageId})` : ""}.`, {
      providerMessageId,
    });
  });
  return "sent";
}

async function handleSendError(job: EmailJob, connectionId: string, err: unknown): Promise<SendOutcome> {
  const perr =
    err instanceof ProviderError ? err : new ProviderError("transient", `Error interno al preparar el envío: ${(err as Error)?.message ?? String(err)}`);
  if (!(err instanceof ProviderError)) void reportError(err, { emailJobId: job.id });
  logger.warn({ emailJobId: job.id, kind: perr.kind, status: perr.status }, perr.message);

  if (perr.kind === "auth") {
    await prisma.$transaction(async (tx) => {
      await releaseReservation(tx, job);
      await tx.emailJob.update({
        where: { id: job.id },
        data: { status: EmailJobStatus.ON_HOLD, statusReason: "NEEDS_REAUTH", lastError: perr.message, sendingStartedAt: null, attempts: { decrement: 1 } },
      });
      await log(tx, job, EmailLogEvent.AUTH_ERROR, perr.message, { status: perr.status ?? null });
    });
    await markAuthFailure(connectionId, perr.message);
    await prisma.emailJob.updateMany({
      where: { businessId: job.businessId, status: { in: [EmailJobStatus.QUEUED] }, id: { not: job.id } },
      data: { status: EmailJobStatus.ON_HOLD, statusReason: "NEEDS_REAUTH" },
    });
    await refreshCustomerRequestStatus(job.customerId);
    return "on_hold";
  }

  if (perr.kind === "invalid_recipient" || perr.kind === "permanent") {
    const bounced = perr.kind === "invalid_recipient";
    await prisma.$transaction(async (tx) => {
      await releaseReservation(tx, job, { countFailed: true });
      await tx.emailJob.update({
        where: { id: job.id },
        data: {
          status: bounced ? EmailJobStatus.BOUNCED : EmailJobStatus.FAILED,
          statusReason: bounced ? "INVALID_RECIPIENT" : "PROVIDER_REJECTED",
          lastError: perr.message,
          failedAt: new Date(),
          sendingStartedAt: null,
        },
      });
      if (bounced) await tx.customer.update({ where: { id: job.customerId }, data: { emailStatus: CustomerEmailStatus.BOUNCED } });
      await log(tx, job, bounced ? EmailLogEvent.BOUNCED : EmailLogEvent.FAILED, perr.message, { status: perr.status ?? null });
    });
    await refreshCustomerRequestStatus(job.customerId);
    return bounced ? "bounced" : "failed";
  }

  // transient / rate_limit → reintento controlado
  const exhausted = job.attempts >= job.maxAttempts;
  const delay = backoffMs(job.attempts, perr.retryAfterSec);
  await prisma.$transaction(async (tx) => {
    await releaseReservation(tx, job, { countFailed: exhausted });
    if (exhausted) {
      await tx.emailJob.update({
        where: { id: job.id },
        data: { status: EmailJobStatus.FAILED, statusReason: "MAX_ATTEMPTS", lastError: perr.message, failedAt: new Date(), sendingStartedAt: null },
      });
      await log(tx, job, EmailLogEvent.FAILED, `Fallo definitivo tras ${job.attempts} intentos: ${perr.message}`);
    } else {
      await tx.emailJob.update({
        where: { id: job.id },
        data: { status: EmailJobStatus.QUEUED, lastError: perr.message, nextAttemptAt: new Date(Date.now() + delay), scheduledFor: new Date(Date.now() + delay), sendingStartedAt: null },
      });
      await log(tx, job, EmailLogEvent.RETRY_SCHEDULED, `Reintento ${job.attempts + 1}/${job.maxAttempts} en ${Math.round(delay / 60000)} min: ${perr.message}`);
    }
  });
  if (exhausted) {
    await refreshCustomerRequestStatus(job.customerId);
    return "failed";
  }
  await enqueueEmailJob(job.id, delay);
  return "retry";
}

/**
 * Barrido periódico (fuente de verdad = BD):
 *  - Pasa a cola los trabajos programados que ya han vencido.
 *  - Re-encola trabajos QUEUED huérfanos (p. ej. si Redis perdió datos).
 *  - Marca como fallidos los envíos interrumpidos a mitad (sin reenviarlos para evitar duplicados).
 */
export async function sweep(now = new Date()) {
  const due = await prisma.emailJob.findMany({
    where: { status: EmailJobStatus.SCHEDULED, scheduledFor: { lte: now }, business: { automationPaused: false } },
    select: { id: true, attempts: true },
    take: 500,
  });
  for (const j of due) {
    const upd = await prisma.emailJob.updateMany({ where: { id: j.id, status: EmailJobStatus.SCHEDULED }, data: { status: EmailJobStatus.QUEUED } });
    if (upd.count) await enqueueEmailJob(j.id);
  }

  const orphan = await prisma.emailJob.findMany({
    // Solo los que llevan >10 min encolados sin procesarse (p. ej. Redis perdió datos), no los que
    // simplemente esperan turno por el límite de velocidad.
    where: {
      status: EmailJobStatus.QUEUED,
      scheduledFor: { lte: new Date(now.getTime() - 2 * 60_000) },
      OR: [{ lastEnqueuedAt: null }, { lastEnqueuedAt: { lte: new Date(now.getTime() - 10 * 60_000) } }],
    },
    select: { id: true, attempts: true },
    take: 500,
  });
  for (const j of orphan) await enqueueEmailJob(j.id);

  const stale = await prisma.emailJob.findMany({
    where: { status: EmailJobStatus.SENDING, sendingStartedAt: { lte: new Date(now.getTime() - 10 * 60_000) } },
    take: 100,
  });
  for (const job of stale) {
    await prisma.$transaction(async (tx) => {
      const upd = await tx.emailJob.updateMany({
        where: { id: job.id, status: EmailJobStatus.SENDING },
        data: { status: EmailJobStatus.FAILED, statusReason: "UNKNOWN_OUTCOME", failedAt: new Date(), sendingStartedAt: null },
      });
      if (!upd.count) return;
      await releaseReservation(tx, job, { countFailed: true });
      await log(tx, job, EmailLogEvent.FAILED, "Envío interrumpido sin confirmación del proveedor. No se reintenta automáticamente para evitar duplicados; revisa la bandeja de enviados y reintenta si es necesario.");
    });
    await refreshCustomerRequestStatus(job.customerId);
  }
  return { due: due.length, orphan: orphan.length, stale: stale.length };
}
