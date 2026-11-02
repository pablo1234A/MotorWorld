import {
  Channel,
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
import { enqueueEmailJob, isStillQueued } from "../../queue/queues";
import { getAccessToken, markAuthFailure } from "../email-connection";
import { getCurrentUsage, subscriptionAllowsSending } from "../billing/entitlements";
import { lockBusiness, refreshCustomerRequestStatus, scheduleDueReminders, trackingUrls } from "./requests";
import { getSmsGateway, type GatewayState } from "../../sms/smsgate";
import { credsOf, markSmsDeviceAuthFailure } from "../sms-device";
import { checkUsageAlerts } from "../notifications";

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
async function releaseReservation(tx: Tx, job: Pick<EmailJob, "id" | "businessId" | "usagePeriodStart" | "channel">, opts: { countFailed?: boolean } = {}) {
  if (!job.usagePeriodStart) return;
  if (job.channel === Channel.SMS)
    await tx.$executeRaw`
      UPDATE monthly_usage SET sms_reserved = GREATEST(sms_reserved - 1, 0), updated_at = now()
      WHERE business_id = ${job.businessId} AND period_start = ${job.usagePeriodStart}`;
  else
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
      const usage = await getCurrentUsage(job.businessId, tx);
      if (!usage) return block(EmailJobStatus.BLOCKED, "SUBSCRIPTION_INACTIVE", EmailLogEvent.BLOCKED, "Bloqueado: sin periodo de facturación.", "blocked");

      if (job.channel === Channel.SMS) {
        if (job.customer.phoneInvalidAt || !job.toPhone)
          return block(EmailJobStatus.BLOCKED, "INVALID_PHONE", EmailLogEvent.BLOCKED, "Bloqueado: el número del cliente no es válido.", "blocked");
        const device = await tx.smsDevice.findUnique({ where: { businessId: job.businessId } });
        if (!device || !device.deviceId)
          return block(EmailJobStatus.ON_HOLD, "NO_SMS_DEVICE", EmailLogEvent.ON_HOLD, "En espera: no hay ningún móvil vinculado para los SMS.", "on_hold");
        if (device.status !== ConnectionStatus.ACTIVE)
          return block(EmailJobStatus.ON_HOLD, "SMS_DEVICE_AUTH", EmailLogEvent.ON_HOLD, "En espera: hay que volver a vincular el móvil.", "on_hold");
        const reserved = await tx.$executeRaw`
          UPDATE monthly_usage SET sms_reserved = sms_reserved + 1, updated_at = now()
          WHERE id = ${usage.id} AND sms_sent + sms_reserved < sms_limit`;
        if (!reserved)
          return block(EmailJobStatus.BLOCKED, "SMS_LIMIT_REACHED", EmailLogEvent.BLOCKED_LIMIT, "Bloqueado: límite mensual de SMS alcanzado. No se ha enviado.", "blocked");
        const updated = await tx.emailJob.update({ where: { id: job.id }, data: { usagePeriodStart: usage.periodStart } });
        await log(tx, job, EmailLogEvent.SEND_ATTEMPT, `Intento de envío nº ${updated.attempts} por SMS.`);
        return { kind: "go", job: updated };
      }

      if (job.customer.emailStatus !== CustomerEmailStatus.VALID)
        return block(EmailJobStatus.BLOCKED, "INVALID_EMAIL", EmailLogEvent.BLOCKED, "Bloqueado: el correo del cliente no es válido o fue rechazado.", "blocked");
      const conn = await tx.emailConnection.findUnique({ where: { businessId: job.businessId } });
      if (!conn || conn.status === ConnectionStatus.DISCONNECTED)
        return block(EmailJobStatus.ON_HOLD, "EMAIL_DISCONNECTED", EmailLogEvent.ON_HOLD, "En espera: no hay cuenta de correo conectada.", "on_hold");
      if (conn.status === ConnectionStatus.NEEDS_REAUTH)
        return block(EmailJobStatus.ON_HOLD, "NEEDS_REAUTH", EmailLogEvent.ON_HOLD, "En espera: la cuenta de correo necesita volver a autorizarse.", "on_hold");

      // Reserva atómica de cupo: solo tiene éxito si sent + reserved < límite.
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
 * Registra un envío ya aceptado por el proveedor. Un fallo transitorio de BD no debe
 * dejar el correo como "resultado desconocido" (contaría como fallido, no como enviado,
 * e invitaría a reintentarlo a mano → duplicado), así que se reintenta unas veces.
 */
async function withBookkeepingRetry(emailJobId: string, providerMessageId: string | null, fn: () => Promise<unknown>) {
  for (let i = 1; ; i++) {
    try {
      await fn();
      return;
    } catch (err) {
      logger.error({ err, emailJobId, providerMessageId, attempt: i }, "envío aceptado por el proveedor pero no se pudo registrar");
      if (i >= 3) throw err;
      await new Promise((r) => setTimeout(r, 500 * i));
    }
  }
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
  if (job.channel === Channel.SMS) return processSms(job);
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
  // registro falla, el correo ya salió y NO debe reenviarse (evita duplicados). Se
  // reintenta el registro; si aun así falla, el trabajo sigue en SENDING y el barrido
  // lo marcará como resultado desconocido.
  await withBookkeepingRetry(job.id, providerMessageId, () => prisma.$transaction(async (tx) => {
    // Condicional: si un intento anterior sí llegó a confirmarse, no se contabiliza dos veces.
    const marked = await tx.emailJob.updateMany({
      where: { id: job.id, status: EmailJobStatus.SENDING },
      data: { status: EmailJobStatus.SENT, sentAt: new Date(), providerMessageId, lastError: null, statusReason: null, sendingStartedAt: null },
    });
    if (!marked.count) return;
    if (job.usagePeriodStart) {
      await tx.$executeRaw`
        UPDATE monthly_usage SET reserved = GREATEST(reserved - 1, 0), sent = sent + 1, updated_at = now()
        WHERE business_id = ${job.businessId} AND period_start = ${job.usagePeriodStart}`;
    }
    await tx.customer.update({ where: { id: job.customerId }, data: { lastRequestAt: new Date(), lastRequestStatus: RequestStatus.SENT } });
    await log(tx, job, EmailLogEvent.SENT, `Aceptado por ${conn.provider === "GOOGLE" ? "Gmail" : "Outlook"}${providerMessageId ? ` (id ${providerMessageId})` : ""}.`, {
      providerMessageId,
    });
  }));
  await checkUsageAlerts(job.businessId);
  return "sent";
}

/** Tiempo máximo que un SMS puede esperar a que el móvil del negocio lo envíe (p. ej. si está apagado). */
export const SMS_DEVICE_TTL_SECONDS = 24 * 3600;

/**
 * SMS desde el móvil Android del negocio (SMS Gate). La API acepta el mensaje y el
 * móvil lo envía después: aquí el trabajo queda en SENDING esperando al móvil, y solo
 * se contabiliza como enviado cuando el móvil confirma que salió (estado «Sent»).
 */
async function processSms(job: EmailJob): Promise<SendOutcome> {
  const device = await prisma.smsDevice.findUnique({ where: { businessId: job.businessId } });
  if (!device || device.status !== "ACTIVE" || !device.deviceId) {
    await prisma.$transaction(async (tx) => {
      await releaseReservation(tx, job);
      await tx.emailJob.update({ where: { id: job.id }, data: { status: EmailJobStatus.ON_HOLD, statusReason: "NO_SMS_DEVICE", sendingStartedAt: null, attempts: { decrement: 1 } } });
      await log(tx, job, EmailLogEvent.ON_HOLD, "En espera: no hay ningún móvil vinculado para los SMS.");
    });
    return "on_hold";
  }
  let res: { messageId: string; state: GatewayState };
  try {
    // El id del mensaje es el del trabajo: si se repite la petición, SMS Gate no lo duplica.
    res = await getSmsGateway().send(credsOf(device), { to: job.toPhone!, text: job.bodyText, id: job.id, ttlSeconds: SMS_DEVICE_TTL_SECONDS });
  } catch (err) {
    return handleSendError(job, null, err);
  }
  await withBookkeepingRetry(job.id, res.messageId, () =>
    prisma.$transaction(async (tx) => {
      const upd = await tx.emailJob.updateMany({
        where: { id: job.id, status: EmailJobStatus.SENDING },
        data: { providerMessageId: res.messageId, providerStatus: res.state, statusReason: "WAITING_DEVICE", lastError: null },
      });
      if (upd.count) await log(tx, job, EmailLogEvent.SEND_ATTEMPT, `SMS entregado a tu móvil (${device.deviceName ?? "Android"}) para que lo envíe.`, { providerMessageId: res.messageId });
    }),
  );
  if (res.state !== "Pending" && res.state !== "Processed") await applyGatewayState(job.id, res.state, null);
  return "sent";
}

/**
 * Aplica el estado real del SMS informado por el móvil. Idempotente: cada transición
 * es condicional, así que avisos repetidos o desordenados no cuentan dos veces.
 */
export async function applyGatewayState(jobId: string, state: GatewayState, error: string | null) {
  const job = await prisma.emailJob.findUnique({ where: { id: jobId } });
  if (!job || job.channel !== Channel.SMS) return;
  await prisma.$transaction(async (tx) => {
    const commit = async () => {
      if (job.usagePeriodStart)
        await tx.$executeRaw`
          UPDATE monthly_usage SET sms_reserved = GREATEST(sms_reserved - 1, 0), sms_sent = sms_sent + 1, updated_at = now()
          WHERE business_id = ${job.businessId} AND period_start = ${job.usagePeriodStart}`;
      await tx.customer.update({ where: { id: job.customerId }, data: { lastRequestAt: new Date(), lastRequestStatus: RequestStatus.SENT } });
    };
    if (state === "Sent" || state === "Delivered") {
      const delivered = state === "Delivered";
      const fromSending = await tx.emailJob.updateMany({
        where: { id: job.id, status: EmailJobStatus.SENDING },
        data: {
          status: delivered ? EmailJobStatus.DELIVERED : EmailJobStatus.SENT,
          sentAt: new Date(),
          ...(delivered ? { deliveredAt: new Date() } : {}),
          providerStatus: state,
          statusReason: null,
          sendingStartedAt: null,
        },
      });
      if (fromSending.count) {
        await commit();
        await log(tx, job, EmailLogEvent.SENT, "Tu móvil ha enviado el SMS.");
      }
      if (delivered) {
        const d = await tx.emailJob.updateMany({ where: { id: job.id, status: EmailJobStatus.SENT }, data: { status: EmailJobStatus.DELIVERED, deliveredAt: new Date(), providerStatus: state } });
        if (d.count || fromSending.count) await log(tx, job, EmailLogEvent.DELIVERED, "El operador confirmó la entrega del SMS.");
      }
    } else if (state === "Failed" || state === "Cancelled") {
      const msg = error ? `El móvil no pudo enviar el SMS: ${error}` : state === "Cancelled" ? "Envío cancelado en el móvil." : "El móvil no pudo enviar el SMS.";
      // Aún no salió del móvil → no cuenta en el cupo.
      const fromSending = await tx.emailJob.updateMany({
        where: { id: job.id, status: EmailJobStatus.SENDING },
        data: { status: EmailJobStatus.FAILED, statusReason: "SMS_FAILED", providerStatus: state, lastError: msg.slice(0, 500), failedAt: new Date(), sendingStartedAt: null },
      });
      if (fromSending.count) {
        await releaseReservation(tx, job, { countFailed: true });
        await log(tx, job, EmailLogEvent.FAILED, msg);
      } else {
        // Ya había salido del móvil pero el operador no lo entregó: sigue contando (la SIM lo envió).
        const after = await tx.emailJob.updateMany({
          where: { id: job.id, status: { in: [EmailJobStatus.SENT, EmailJobStatus.DELIVERED] } },
          data: { status: EmailJobStatus.BOUNCED, statusReason: "UNDELIVERED", providerStatus: state, lastError: msg.slice(0, 500), failedAt: new Date() },
        });
        if (after.count) await log(tx, job, EmailLogEvent.BOUNCED, msg);
      }
    } else {
      await tx.emailJob.updateMany({ where: { id: job.id, status: EmailJobStatus.SENDING }, data: { providerStatus: state } });
    }
  });
  await refreshCustomerRequestStatus(job.customerId);
  if (state === "Sent" || state === "Delivered") await checkUsageAlerts(job.businessId);
}

/** Confirma con la API de SMS Gate el estado real de un SMS (nunca se confía en el contenido de un aviso). */
export async function confirmSmsState(jobId: string) {
  const job = await prisma.emailJob.findUnique({ where: { id: jobId } });
  if (!job?.providerMessageId) return null;
  const device = await prisma.smsDevice.findUnique({ where: { businessId: job.businessId } });
  if (!device) return null;
  const st = await getSmsGateway().getState(credsOf(device), job.providerMessageId);
  await applyGatewayState(job.id, st.state, st.error);
  return st.state;
}

/** Barrido de SMS que esperan al móvil: consulta su estado y caduca los que el móvil no envió en 24 h. */
export async function pollPendingSms(now = new Date()) {
  const waiting = await prisma.emailJob.findMany({
    where: { channel: Channel.SMS, status: EmailJobStatus.SENDING, providerMessageId: { not: null }, updatedAt: { lte: new Date(now.getTime() - 2 * 60_000) } },
    take: 100,
    orderBy: { updatedAt: "asc" },
  });
  let expired = 0;
  for (const j of waiting) {
    try {
      const state = await confirmSmsState(j.id);
      if ((state === "Pending" || state === "Processed") && j.sendingStartedAt && now.getTime() - j.sendingStartedAt.getTime() > SMS_DEVICE_TTL_SECONDS * 1000) {
        const device = await prisma.smsDevice.findUnique({ where: { businessId: j.businessId } });
        if (device) await getSmsGateway().cancel(credsOf(device), j.providerMessageId!);
        await applyGatewayState(j.id, "Failed", "el móvil no estuvo conectado en 24 horas");
        expired++;
      } else {
        await prisma.emailJob.updateMany({ where: { id: j.id, status: EmailJobStatus.SENDING }, data: { updatedAt: new Date() } });
      }
    } catch (err) {
      logger.warn({ err, emailJobId: j.id }, "no se pudo consultar el estado del SMS");
      if (err instanceof ProviderError && err.kind === "auth") await markSmsDeviceAuthFailure(j.businessId, err.message);
      await prisma.emailJob.updateMany({ where: { id: j.id, status: EmailJobStatus.SENDING }, data: { updatedAt: new Date() } });
    }
  }
  return { polled: waiting.length, expired };
}

async function handleSendError(job: EmailJob, connectionId: string | null, err: unknown): Promise<SendOutcome> {
  const perr =
    err instanceof ProviderError ? err : new ProviderError("transient", `Error interno al preparar el envío: ${(err as Error)?.message ?? String(err)}`);
  if (!(err instanceof ProviderError)) void reportError(err, { emailJobId: job.id });
  logger.warn({ emailJobId: job.id, kind: perr.kind, status: perr.status }, perr.message);

  if (perr.kind === "auth" && job.channel === Channel.SMS) {
    await prisma.$transaction(async (tx) => {
      await releaseReservation(tx, job);
      await tx.emailJob.update({
        where: { id: job.id },
        data: { status: EmailJobStatus.ON_HOLD, statusReason: "SMS_DEVICE_AUTH", lastError: perr.message, sendingStartedAt: null, attempts: { decrement: 1 } },
      });
      await log(tx, job, EmailLogEvent.AUTH_ERROR, perr.message);
    });
    await markSmsDeviceAuthFailure(job.businessId, perr.message);
    await refreshCustomerRequestStatus(job.customerId);
    return "on_hold";
  }

  if (perr.kind === "auth" && connectionId) {
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
      where: { businessId: job.businessId, channel: Channel.EMAIL, status: { in: [EmailJobStatus.QUEUED] }, id: { not: job.id } },
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
      if (bounced)
        await tx.customer.update({
          where: { id: job.customerId },
          data: job.channel === Channel.SMS ? { phoneInvalidAt: new Date() } : { emailStatus: CustomerEmailStatus.BOUNCED },
        });
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
    // Con la automatización en pausa solo avanzan los envíos explícitos (manuales y campañas).
    where: {
      status: EmailJobStatus.SCHEDULED,
      scheduledFor: { lte: now },
      OR: [{ business: { automationPaused: false } }, { campaignId: { not: null } }, { event: { source: "MANUAL" } }],
    },
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
    select: { id: true, attempts: true, lastEnqueuedAt: true },
    take: 500,
  });
  let reEnqueued = 0;
  for (const j of orphan) {
    // Si sigue en la cola de Redis (esperando turno por el límite de velocidad) no se duplica.
    if (j.lastEnqueuedAt && (await isStillQueued(j.id, j.lastEnqueuedAt))) continue;
    await enqueueEmailJob(j.id);
    reEnqueued++;
  }

  const stale = await prisma.emailJob.findMany({
    // Los SMS ya entregados al móvil (con providerMessageId) se gestionan en pollPendingSms.
    where: { status: EmailJobStatus.SENDING, sendingStartedAt: { lte: new Date(now.getTime() - 10 * 60_000) }, OR: [{ channel: Channel.EMAIL }, { providerMessageId: null }] },
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
  const reminders = await scheduleDueReminders(now);
  await pollPendingSms(now);
  return { due: due.length, orphan: reEnqueued, stale: stale.length, reminders: reminders.created };
}
