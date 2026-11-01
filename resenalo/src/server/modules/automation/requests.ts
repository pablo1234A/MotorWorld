import {
  AutomationEventStatus,
  Channel,
  ConnectionStatus,
  CustomerEmailStatus,
  EmailJobStatus,
  EmailLogEvent,
  EventSource,
  RequestStatus,
  type Prisma,
} from "@prisma/client";
import { prisma, type Tx } from "../../db";
import { env } from "../../env";
import { randomToken, sha256 } from "../../crypto";
import { AppError } from "../../http/errors";
import { enqueueEmailJob } from "../../queue/queues";
import { getCurrentUsage, getEntitlements } from "../billing/entitlements";
import { DEFAULT_REMINDER, renderTemplate, type TemplateFields } from "@/lib/template";
import { DEFAULT_SMS, renderSms } from "@/lib/sms";
import { isMobileForSms, normalizePhone } from "@/lib/phone";
import { getSmsProvider } from "../../sms/twilio";
import { checkUsageAlerts } from "../notifications";
import { isValidEmail } from "@/lib/email";
import { applySendWindow } from "./schedule";
import { footerPreview } from "@/lib/footer-preview";
import { reasonMessage } from "./reasons";

export const PENDING_JOB_STATUSES: EmailJobStatus[] = [
  EmailJobStatus.SCHEDULED,
  EmailJobStatus.QUEUED,
  EmailJobStatus.SENDING,
  EmailJobStatus.ON_HOLD,
];
const COOLDOWN_STATUSES: EmailJobStatus[] = [...PENDING_JOB_STATUSES, EmailJobStatus.SENT, EmailJobStatus.DELIVERED];
const MAX_COMPLETION_AGE_MS = 90 * 86400_000;

export type CreateRequestInput = {
  customerId: string;
  source: EventSource;
  externalId?: string | null;
  serviceName?: string | null;
  completedAt?: Date | null;
  /** Envío manual inmediato (ignora el retardo configurado). */
  sendNow?: boolean;
  campaignId?: string | null;
  payload?: Prisma.InputJsonValue;
};

export type CreateRequestResult = {
  status: "CREATED" | "DUPLICATE" | "SKIPPED" | "REJECTED";
  reason?: string;
  message: string;
  eventId?: string;
  jobId?: string;
  jobStatus?: EmailJobStatus;
  scheduledFor?: Date;
};

/** Bloqueo transaccional por negocio: serializa las operaciones de cupo (pestañas múltiples, peticiones concurrentes). */
export async function lockBusiness(tx: Tx, businessId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${businessId}, 0))`;
}

export async function countPendingJobs(tx: Tx, businessId: string, channel: Channel = Channel.EMAIL) {
  return tx.emailJob.count({ where: { businessId, channel, status: { in: PENDING_JOB_STATUSES } } });
}

export function trackingUrls(publicToken: string) {
  const base = env().APP_URL;
  return {
    click: `${base}/r/${publicToken}`,
    unsubscribe: `${base}/baja/${publicToken}`,
    // RFC 8058 (List-Unsubscribe-Post): baja en un clic desde el cliente de correo
    oneClick: `${base}/api/public/unsubscribe/${publicToken}`,
  };
}

export const footerLinesFor = footerPreview;

type TemplateRow = TemplateFields & { reminderSubject: string | null; reminderBody: string | null; smsBody: string | null };

/** Genera el contenido final (correo o SMS) de una solicitud o recordatorio. */
function renderFor(
  channel: Channel,
  template: TemplateRow,
  ctx: { customerName: string; businessName: string; serviceName: string | null; reviewUrl: string; publicToken: string; business: Parameters<typeof footerPreview>[0] },
  reminder: boolean,
) {
  const urls = trackingUrls(ctx.publicToken);
  if (channel === Channel.SMS) {
    const text = renderSms(template.smsBody || DEFAULT_SMS, { ...ctx, unsubscribeUrl: urls.unsubscribe });
    return { subject: reminder ? "SMS (recordatorio)" : "SMS", text, html: "" };
  }
  const fields: TemplateFields = reminder
    ? { ...template, subject: template.reminderSubject || DEFAULT_REMINDER.subject, body: template.reminderBody || DEFAULT_REMINDER.body }
    : template;
  return renderTemplate(fields, {
    customerName: ctx.customerName,
    businessName: ctx.businessName,
    serviceName: ctx.serviceName,
    reviewUrl: ctx.reviewUrl,
    unsubscribeUrl: urls.unsubscribe,
    footerLines: footerLinesFor(ctx.business),
  });
}

/** Comprueba que hay cupo del canal: enviados + pendientes < límite (dentro del bloqueo del negocio). */
async function hasQuota(tx: Tx, businessId: string, channel: Channel) {
  const usage = await getCurrentUsage(businessId, tx);
  if (!usage) return { ok: false as const, reason: "SUBSCRIPTION_INACTIVE" };
  const pending = await countPendingJobs(tx, businessId, channel);
  if (channel === Channel.SMS) return usage.smsSent + pending >= usage.smsLimit ? { ok: false as const, reason: "SMS_LIMIT_REACHED" } : { ok: true as const };
  return usage.sent + pending >= usage.emailLimit ? { ok: false as const, reason: "LIMIT_REACHED" } : { ok: true as const };
}

/**
 * Crea una solicitud de reseña a partir de un evento "servicio finalizado".
 * Ejecuta todas las comprobaciones (suscripción, cupo, conexión, email/teléfono,
 * duplicados), genera el mensaje final y lo deja en la cola. Todo dentro de una
 * transacción con bloqueo por negocio para que el cupo no pueda superarse por concurrencia.
 */
export async function createReviewRequest(businessId: string, input: CreateRequestInput): Promise<CreateRequestResult> {
  const result = await prisma.$transaction(
    async (tx) => {
      await lockBusiness(tx, businessId);
      const now = new Date();

      if (input.externalId) {
        const existing = await tx.automationEvent.findUnique({
          where: { businessId_externalId: { businessId, externalId: input.externalId } },
          include: { job: true },
        });
        if (existing)
          return {
            status: "DUPLICATE" as const,
            reason: "DUPLICATE",
            message: "Este evento ya se había recibido (idempotencia por externalId).",
            eventId: existing.id,
            jobId: existing.job?.id,
            jobStatus: existing.job?.status,
          };
      }

      const customer = await tx.customer.findFirst({ where: { id: input.customerId, businessId } });
      if (!customer) throw new AppError("NOT_FOUND", "Cliente no encontrado");
      const business = await tx.business.findUniqueOrThrow({ where: { id: businessId } });
      const completedAt = input.completedAt ?? customer.completedAt ?? now;
      const serviceName = (input.serviceName ?? customer.serviceName ?? null)?.trim() || null;

      const finish = async (status: "SKIPPED" | "REJECTED", reason: string): Promise<CreateRequestResult> => {
        const ev = await tx.automationEvent.create({
          data: {
            businessId,
            customerId: customer.id,
            source: input.source,
            campaignId: input.campaignId ?? null,
            serviceName,
            completedAt,
            status: status === "SKIPPED" ? AutomationEventStatus.SKIPPED : AutomationEventStatus.REJECTED,
            reason,
            payload: { ...(input.payload ? { data: input.payload } : {}), externalId: input.externalId ?? null } as Prisma.InputJsonValue,
          },
        });
        if (reason === "LIMIT_REACHED" || reason === "SMS_LIMIT_REACHED" || reason === "SUBSCRIPTION_INACTIVE")
          await tx.customer.update({ where: { id: customer.id }, data: { lastRequestStatus: RequestStatus.BLOCKED } });
        return { status, reason, message: reasonMessage(reason)!, eventId: ev.id };
      };

      // 1. Suscripción activa
      const ent = await getEntitlements(businessId, tx);
      if (!ent.canSend || !ent.plan) return finish("REJECTED", "SUBSCRIPTION_INACTIVE");
      if (!business.reviewUrl) return finish("REJECTED", "NO_REVIEW_URL");
      if (customer.unsubscribedAt) return finish("SKIPPED", "UNSUBSCRIBED");

      // Regla / plantilla / canal
      let templateId: string;
      let ruleId: string | null = null;
      let delayMinutes = 0;
      let windowStart: number | null = null;
      let windowEnd: number | null = null;
      let channel: Channel = Channel.EMAIL;

      if (input.campaignId) {
        const campaign = await tx.campaign.findFirst({ where: { id: input.campaignId, businessId } });
        if (!campaign) throw new AppError("NOT_FOUND", "Campaña no encontrada");
        templateId = campaign.templateId;
      } else {
        if (business.automationPaused && input.source !== EventSource.MANUAL) return finish("SKIPPED", "AUTOMATION_PAUSED");
        if (!input.sendNow && now.getTime() - completedAt.getTime() > MAX_COMPLETION_AGE_MS) return finish("SKIPPED", "COMPLETION_TOO_OLD");
        const rules = await tx.automationRule.findMany({
          where: { businessId, active: true },
          orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
        });
        const svc = (serviceName ?? "").toLowerCase();
        const rule = rules.find(
          (r) =>
            r.sources.includes(input.source) &&
            (!r.serviceFilter || !ent.features?.serviceFilters || svc.includes(r.serviceFilter.toLowerCase())),
        );
        if (!rule) return finish("SKIPPED", "NO_MATCHING_RULE");
        templateId = rule.templateId;
        ruleId = rule.id;
        delayMinutes = rule.delayMinutes;
        channel = rule.channel === Channel.SMS && ent.features?.sms ? Channel.SMS : Channel.EMAIL;
        if (ent.features?.sendWindow) {
          windowStart = rule.sendWindowStart;
          windowEnd = rule.sendWindowEnd;
        }
      }

      // 3-4. Canal: conexión de correo + email válido, o proveedor SMS + móvil válido
      let connection: Awaited<ReturnType<typeof tx.emailConnection.findUnique>> = null;
      let phone: string | null = null;
      if (channel === Channel.EMAIL) {
        connection = await tx.emailConnection.findUnique({ where: { businessId } });
        if (!connection || connection.status === ConnectionStatus.DISCONNECTED) return finish("REJECTED", "NO_EMAIL_CONNECTION");
        if (customer.emailStatus === CustomerEmailStatus.BOUNCED) return finish("SKIPPED", "BOUNCED");
        if (customer.emailStatus !== CustomerEmailStatus.VALID || !isValidEmail(customer.email)) return finish("SKIPPED", "INVALID_EMAIL");
      } else {
        if (!getSmsProvider().isConfigured()) return finish("REJECTED", "SMS_NOT_CONFIGURED");
        phone = normalizePhone(customer.phone, business.country);
        if (!phone || !isMobileForSms(phone) || customer.phoneInvalidAt) return finish("SKIPPED", "INVALID_PHONE");
      }

      // 5. Duplicados: misma clave o solicitud reciente al mismo cliente
      const dedupeKey = input.externalId
        ? `ext:${sha256(input.externalId)}`
        : input.campaignId
          ? `cmp:${input.campaignId}:${customer.id}`
          : `evt:${sha256(`${customer.id}|${(serviceName ?? "").toLowerCase()}|${completedAt.toISOString().slice(0, 10)}`)}`;
      const dup = await tx.emailJob.findUnique({ where: { businessId_dedupeKey: { businessId, dedupeKey } } });
      if (dup) return finish("SKIPPED", "DUPLICATE");
      if (business.resendCooldownDays > 0) {
        const recent = await tx.emailJob.findFirst({
          where: {
            businessId,
            customerId: customer.id,
            isReminder: false,
            status: { in: COOLDOWN_STATUSES },
            createdAt: { gte: new Date(now.getTime() - business.resendCooldownDays * 86400_000) },
          },
          select: { id: true },
        });
        if (recent) return finish("SKIPPED", "COOLDOWN");
      }

      // 2. Cupo disponible del canal
      const quota = await hasQuota(tx, businessId, channel);
      if (!quota.ok) return finish("REJECTED", quota.reason);

      // 6-8. Plantilla + variables + mensaje final
      const template = await tx.emailTemplate.findFirst({ where: { id: templateId, businessId } });
      if (!template) throw new AppError("NOT_FOUND", "La plantilla asociada ya no existe");
      const publicToken = randomToken(18);
      const urls = trackingUrls(publicToken);
      const rendered = renderFor(
        channel,
        template,
        { customerName: customer.name, businessName: business.name, serviceName, reviewUrl: business.trackClicks ? urls.click : business.reviewUrl, publicToken, business },
        false,
      );

      let scheduledFor = input.sendNow || input.campaignId ? now : new Date(Math.max(now.getTime(), completedAt.getTime() + delayMinutes * 60_000));
      scheduledFor = applySendWindow(scheduledFor, business.timezone, windowStart, windowEnd);
      const immediate = scheduledFor.getTime() <= now.getTime() + 5_000;
      const onHold = channel === Channel.EMAIL && connection?.status === ConnectionStatus.NEEDS_REAUTH;
      const status = onHold ? EmailJobStatus.ON_HOLD : immediate ? EmailJobStatus.QUEUED : EmailJobStatus.SCHEDULED;

      const event = await tx.automationEvent.create({
        data: {
          businessId,
          customerId: customer.id,
          ruleId,
          campaignId: input.campaignId ?? null,
          source: input.source,
          externalId: input.externalId ?? null,
          serviceName,
          completedAt,
          status: AutomationEventStatus.PROCESSED,
          payload: input.payload,
        },
      });
      const job = await tx.emailJob.create({
        data: {
          businessId,
          customerId: customer.id,
          eventId: event.id,
          ruleId,
          templateId,
          campaignId: input.campaignId ?? null,
          connectionId: connection?.id ?? null,
          channel,
          dedupeKey,
          publicToken,
          toEmail: customer.email,
          toPhone: phone,
          toName: customer.name,
          subject: rendered.subject,
          bodyText: rendered.text,
          bodyHtml: rendered.html,
          reviewUrl: business.reviewUrl,
          status,
          statusReason: onHold ? "NEEDS_REAUTH" : null,
          scheduledFor,
        },
      });
      await tx.emailLog.create({
        data: {
          emailJobId: job.id,
          businessId,
          event: onHold ? EmailLogEvent.ON_HOLD : immediate ? EmailLogEvent.QUEUED : EmailLogEvent.SCHEDULED,
          message: onHold
            ? "En espera: la cuenta de correo necesita volver a autorizarse."
            : `${channel === Channel.SMS ? "SMS" : "Solicitud"} ${immediate ? "creada y añadida a la cola de envío." : `programada para ${scheduledFor.toISOString()}.`}`,
          meta: { source: input.source, ruleId, campaignId: input.campaignId ?? null, channel },
        },
      });
      await tx.customer.update({ where: { id: customer.id }, data: { lastRequestStatus: RequestStatus.PENDING } });

      return {
        status: "CREATED" as const,
        message: immediate ? "Solicitud creada y en cola de envío." : "Solicitud programada.",
        eventId: event.id,
        jobId: job.id,
        jobStatus: job.status,
        scheduledFor,
      };
    },
    { isolationLevel: "ReadCommitted", timeout: 15_000, maxWait: 10_000 },
  );

  if (result.status === "CREATED" && result.jobStatus === EmailJobStatus.QUEUED && result.jobId) {
    await enqueueEmailJob(result.jobId);
  }
  if (result.reason === "LIMIT_REACHED") await checkUsageAlerts(businessId);
  return result;
}

/**
 * Recordatorio único: si una solicitud enviada no ha tenido ningún clic tras los
 * días configurados en su regla, se envía un segundo mensaje (nunca más de uno).
 * Cuenta en el cupo del plan y respeta bajas, rebotes y suscripción.
 */
export async function createReminder(parentId: string): Promise<CreateRequestResult> {
  const out = await prisma.$transaction(
    async (tx) => {
      const pre = await tx.emailJob.findUnique({ where: { id: parentId }, select: { businessId: true } });
      if (!pre) return { status: "SKIPPED" as const, reason: "NOT_FOUND", message: "Envío no encontrado" };
      await lockBusiness(tx, pre.businessId);
      const parent = await tx.emailJob.findUniqueOrThrow({ where: { id: parentId }, include: { customer: true, business: true, rule: true, reminder: true } });
      const skip = (reason: string) => ({ status: "SKIPPED" as const, reason, message: reasonMessage(reason) ?? reason });
      if (parent.reminder || parent.isReminder) return skip("DUPLICATE");
      if (!([EmailJobStatus.SENT, EmailJobStatus.DELIVERED] as EmailJobStatus[]).includes(parent.status) || parent.firstClickedAt) return skip("NOT_NEEDED");
      if (!parent.rule?.reminderEnabled) return skip("NOT_NEEDED");
      const ent = await getEntitlements(parent.businessId, tx);
      if (!ent.canSend || !ent.features?.reminders) return skip("SUBSCRIPTION_INACTIVE");
      if (parent.customer.unsubscribedAt) return skip("UNSUBSCRIBED");
      if (parent.business.automationPaused) return skip("AUTOMATION_PAUSED");
      const channel = parent.channel;
      let connectionId: string | null = null;
      if (channel === Channel.EMAIL) {
        if (parent.customer.emailStatus !== CustomerEmailStatus.VALID) return skip("INVALID_EMAIL");
        const conn = await tx.emailConnection.findUnique({ where: { businessId: parent.businessId } });
        if (!conn || conn.status !== ConnectionStatus.ACTIVE) return skip("NO_EMAIL_CONNECTION");
        connectionId = conn.id;
      } else if (parent.customer.phoneInvalidAt || !parent.toPhone) return skip("INVALID_PHONE");
      const quota = await hasQuota(tx, parent.businessId, channel);
      if (!quota.ok) return skip(quota.reason);
      const template = parent.templateId ? await tx.emailTemplate.findUnique({ where: { id: parent.templateId } }) : null;
      if (!template) return skip("NOT_FOUND");
      const publicToken = randomToken(18);
      const urls = trackingUrls(publicToken);
      const ev = parent.eventId ? await tx.automationEvent.findUnique({ where: { id: parent.eventId }, select: { serviceName: true } }) : null;
      const rendered = renderFor(
        channel,
        template,
        {
          customerName: parent.customer.name,
          businessName: parent.business.name,
          serviceName: ev?.serviceName ?? parent.customer.serviceName,
          reviewUrl: parent.business.trackClicks ? urls.click : parent.reviewUrl,
          publicToken,
          business: parent.business,
        },
        true,
      );
      const now = new Date();
      const scheduledFor = applySendWindow(now, parent.business.timezone, parent.rule.sendWindowStart, parent.rule.sendWindowEnd);
      const immediate = scheduledFor.getTime() <= now.getTime() + 5_000;
      const job = await tx.emailJob.create({
        data: {
          businessId: parent.businessId,
          customerId: parent.customerId,
          ruleId: parent.ruleId,
          templateId: parent.templateId,
          connectionId,
          channel,
          isReminder: true,
          reminderOfId: parent.id,
          dedupeKey: `rem:${parent.id}`,
          publicToken,
          toEmail: parent.toEmail,
          toPhone: parent.toPhone,
          toName: parent.toName,
          subject: rendered.subject,
          bodyText: rendered.text,
          bodyHtml: rendered.html,
          reviewUrl: parent.reviewUrl,
          status: immediate ? EmailJobStatus.QUEUED : EmailJobStatus.SCHEDULED,
          scheduledFor,
        },
      });
      await tx.emailLog.create({ data: { emailJobId: parent.id, businessId: parent.businessId, event: EmailLogEvent.REMINDER_CREATED, message: "Sin clics en el enlace: se ha programado un recordatorio." } });
      await tx.emailLog.create({ data: { emailJobId: job.id, businessId: parent.businessId, event: immediate ? EmailLogEvent.QUEUED : EmailLogEvent.SCHEDULED, message: "Recordatorio creado (único)." } });
      return { status: "CREATED" as const, message: "Recordatorio creado.", jobId: job.id, jobStatus: job.status, scheduledFor };
    },
    { timeout: 15_000, maxWait: 10_000 },
  );
  if (out.status === "CREATED" && out.jobStatus === EmailJobStatus.QUEUED && out.jobId) await enqueueEmailJob(out.jobId);
  return out;
}

/** Barrido de recordatorios: solicitudes enviadas sin clic cuyo plazo ha vencido (máx. 30 días atrás). */
export async function scheduleDueReminders(now = new Date()) {
  const candidates = await prisma.$queryRaw<{ id: string }[]>`
    SELECT j.id FROM email_jobs j
    JOIN automation_rules r ON r.id = j.rule_id
    WHERE j.status IN ('SENT','DELIVERED') AND j.is_reminder = false AND j.first_clicked_at IS NULL
      AND r.reminder_enabled = true
      AND j.sent_at <= ${now}::timestamp - make_interval(days => r.reminder_delay_days)
      AND j.sent_at >= ${now}::timestamp - interval '30 days'
      AND NOT EXISTS (SELECT 1 FROM email_jobs x WHERE x.reminder_of_id = j.id)
    LIMIT 200`;
  let created = 0;
  for (const c of candidates) if ((await createReminder(c.id)).status === "CREATED") created++;
  return { candidates: candidates.length, created };
}

/** Cancela un envío pendiente. */
export async function cancelJob(businessId: string, jobId: string) {
  const res = await prisma.$executeRaw`
    UPDATE email_jobs SET status = 'CANCELED', status_reason = 'CANCELED_BY_USER',
      dedupe_key = dedupe_key || ':cancelado:' || id, updated_at = now()
    WHERE id = ${jobId} AND business_id = ${businessId} AND status IN ('SCHEDULED','QUEUED','ON_HOLD','BLOCKED')`;
  // La clave de duplicado se libera para poder volver a crear la solicitud si se desea.
  if (!res) throw new AppError("CONFLICT", "Este envío ya no se puede cancelar.");
  await prisma.emailLog.create({ data: { emailJobId: jobId, businessId, event: EmailLogEvent.CANCELED, message: "Cancelado por el usuario." } });
  const job = await prisma.emailJob.findUniqueOrThrow({ where: { id: jobId } });
  await refreshCustomerRequestStatus(job.customerId);
}

/** Reintenta manualmente un envío fallido o bloqueado, volviendo a comprobar cupo y suscripción. */
export async function retryJob(businessId: string, jobId: string) {
  const out = await prisma.$transaction(async (tx) => {
    await lockBusiness(tx, businessId);
    const job = await tx.emailJob.findFirst({ where: { id: jobId, businessId }, include: { customer: true } });
    if (!job) throw new AppError("NOT_FOUND", "Envío no encontrado");
    if (!([EmailJobStatus.FAILED, EmailJobStatus.BOUNCED, EmailJobStatus.BLOCKED] as EmailJobStatus[]).includes(job.status))
      throw new AppError("CONFLICT", "Solo se pueden reintentar envíos fallidos o bloqueados.");
    if (job.customer.unsubscribedAt) throw new AppError("CONFLICT", "El cliente se dio de baja; no se puede reenviar.");
    const ent = await getEntitlements(businessId, tx);
    if (!ent.canSend) throw new AppError("PAYMENT_REQUIRED", "Necesitas una suscripción activa.");
    let connectionId: string | null = null;
    if (job.channel === Channel.EMAIL) {
      if (job.customer.emailStatus !== CustomerEmailStatus.VALID) throw new AppError("CONFLICT", "El correo del cliente está marcado como no válido o rechazado.");
      const conn = await tx.emailConnection.findUnique({ where: { businessId } });
      if (!conn || conn.status !== ConnectionStatus.ACTIVE) throw new AppError("CONFLICT", "Conecta tu cuenta de correo antes de reintentar.");
      connectionId = conn.id;
    } else if (job.customer.phoneInvalidAt) throw new AppError("CONFLICT", "El número del cliente fue rechazado. Corrígelo antes de reintentar.");
    const quota = await hasQuota(tx, businessId, job.channel);
    if (!quota.ok) throw new AppError("PLAN_LIMIT", reasonMessage(quota.reason)!);
    await tx.emailJob.update({
      where: { id: job.id },
      data: { status: EmailJobStatus.QUEUED, statusReason: null, scheduledFor: new Date(), attempts: 0, lastError: null, connectionId },
    });
    await tx.emailLog.create({ data: { emailJobId: job.id, businessId, event: EmailLogEvent.REQUEUED, message: "Reintento manual solicitado." } });
    return job;
  });
  await enqueueEmailJob(out.id);
}

/** Recalcula el estado visible de la última solicitud de un cliente. */
export async function refreshCustomerRequestStatus(customerId: string, db: Tx | typeof prisma = prisma) {
  const last = await db.emailJob.findFirst({ where: { customerId }, orderBy: { createdAt: "desc" } });
  let s: RequestStatus = RequestStatus.NONE;
  if (last) {
    if (([EmailJobStatus.SENT, EmailJobStatus.DELIVERED] as EmailJobStatus[]).includes(last.status)) s = RequestStatus.SENT;
    else if (PENDING_JOB_STATUSES.includes(last.status)) s = RequestStatus.PENDING;
    else if (([EmailJobStatus.FAILED, EmailJobStatus.BOUNCED] as EmailJobStatus[]).includes(last.status)) s = RequestStatus.FAILED;
    else if (last.status === EmailJobStatus.BLOCKED) s = RequestStatus.BLOCKED;
  }
  await db.customer.update({ where: { id: customerId }, data: { lastRequestStatus: s, ...(s === RequestStatus.SENT ? { lastRequestAt: last!.sentAt } : {}) } });
}
