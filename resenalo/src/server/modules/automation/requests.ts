import {
  AutomationEventStatus,
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
import { renderTemplate, type TemplateFields } from "@/lib/template";
import { isValidEmail } from "@/lib/email";
import { applySendWindow } from "./schedule";
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

export async function countPendingJobs(tx: Tx, businessId: string) {
  return tx.emailJob.count({ where: { businessId, status: { in: PENDING_JOB_STATUSES } } });
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

export function footerLinesFor(b: { name: string; legalName: string | null; addressLine: string | null; postalCode: string | null; city: string | null }) {
  const addr = [b.addressLine, [b.postalCode, b.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [
    `Has recibido este mensaje porque has sido cliente de ${b.name}.`,
    [b.legalName || b.name, addr].filter(Boolean).join(" · "),
  ];
}

/**
 * Crea una solicitud de reseña a partir de un evento "servicio finalizado".
 * Ejecuta todas las comprobaciones (suscripción, cupo, conexión, email, duplicados),
 * genera el correo final y lo deja en la cola. Todo dentro de una transacción con
 * bloqueo por negocio para que el cupo no pueda superarse por concurrencia.
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
        if (reason === "LIMIT_REACHED" || reason === "SUBSCRIPTION_INACTIVE")
          await tx.customer.update({ where: { id: customer.id }, data: { lastRequestStatus: RequestStatus.BLOCKED } });
        return { status, reason, message: reasonMessage(reason)!, eventId: ev.id };
      };

      // 1. Suscripción activa
      const ent = await getEntitlements(businessId, tx);
      if (!ent.canSend || !ent.plan) return finish("REJECTED", "SUBSCRIPTION_INACTIVE");
      if (!business.reviewUrl) return finish("REJECTED", "NO_REVIEW_URL");

      // 3. Conexión de correo
      const connection = await tx.emailConnection.findUnique({ where: { businessId } });
      if (!connection || connection.status === ConnectionStatus.DISCONNECTED) return finish("REJECTED", "NO_EMAIL_CONNECTION");

      // 4. Email válido y no dado de baja
      if (customer.unsubscribedAt) return finish("SKIPPED", "UNSUBSCRIBED");
      if (customer.emailStatus === CustomerEmailStatus.BOUNCED) return finish("SKIPPED", "BOUNCED");
      if (customer.emailStatus !== CustomerEmailStatus.VALID || !isValidEmail(customer.email)) return finish("SKIPPED", "INVALID_EMAIL");

      // Regla / plantilla
      let templateId: string;
      let ruleId: string | null = null;
      let delayMinutes = 0;
      let windowStart: number | null = null;
      let windowEnd: number | null = null;

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
        if (ent.features?.sendWindow) {
          windowStart = rule.sendWindowStart;
          windowEnd = rule.sendWindowEnd;
        }
      }

      // 5. Duplicados: misma clave o envío reciente al mismo destinatario
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
            toEmail: customer.email,
            status: { in: COOLDOWN_STATUSES },
            createdAt: { gte: new Date(now.getTime() - business.resendCooldownDays * 86400_000) },
          },
          select: { id: true },
        });
        if (recent) return finish("SKIPPED", "COOLDOWN");
      }

      // 2. Cupo disponible (enviados + pendientes < límite)
      const usage = await getCurrentUsage(businessId, tx);
      if (!usage) return finish("REJECTED", "SUBSCRIPTION_INACTIVE");
      const pending = await countPendingJobs(tx, businessId);
      if (usage.sent + pending >= usage.emailLimit) return finish("REJECTED", "LIMIT_REACHED");

      // 6-8. Plantilla + variables + correo final
      const template = await tx.emailTemplate.findFirst({ where: { id: templateId, businessId } });
      if (!template) throw new AppError("NOT_FOUND", "La plantilla asociada ya no existe");
      const publicToken = randomToken(18);
      const urls = trackingUrls(publicToken);
      const rendered = renderTemplate(template as TemplateFields, {
        customerName: customer.name,
        businessName: business.name,
        serviceName,
        reviewUrl: business.trackClicks ? urls.click : business.reviewUrl,
        unsubscribeUrl: urls.unsubscribe,
        footerLines: footerLinesFor(business),
      });

      let scheduledFor = input.sendNow || input.campaignId ? now : new Date(Math.max(now.getTime(), completedAt.getTime() + delayMinutes * 60_000));
      scheduledFor = applySendWindow(scheduledFor, business.timezone, windowStart, windowEnd);
      const immediate = scheduledFor.getTime() <= now.getTime() + 5_000;
      const status =
        connection.status === ConnectionStatus.NEEDS_REAUTH ? EmailJobStatus.ON_HOLD : immediate ? EmailJobStatus.QUEUED : EmailJobStatus.SCHEDULED;

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
          connectionId: connection.id,
          dedupeKey,
          publicToken,
          toEmail: customer.email,
          toName: customer.name,
          subject: rendered.subject,
          bodyText: rendered.text,
          bodyHtml: rendered.html,
          reviewUrl: business.reviewUrl,
          status,
          statusReason: status === EmailJobStatus.ON_HOLD ? "NEEDS_REAUTH" : null,
          scheduledFor,
        },
      });
      await tx.emailLog.create({
        data: {
          emailJobId: job.id,
          businessId,
          event: status === EmailJobStatus.ON_HOLD ? EmailLogEvent.ON_HOLD : immediate ? EmailLogEvent.QUEUED : EmailLogEvent.SCHEDULED,
          message:
            status === EmailJobStatus.ON_HOLD
              ? "En espera: la cuenta de correo necesita volver a autorizarse."
              : immediate
                ? "Solicitud creada y añadida a la cola de envío."
                : `Solicitud programada para ${scheduledFor.toISOString()}.`,
          meta: { source: input.source, ruleId, campaignId: input.campaignId ?? null },
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
  return result;
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
    if (job.customer.emailStatus !== CustomerEmailStatus.VALID) throw new AppError("CONFLICT", "El correo del cliente está marcado como no válido o rechazado.");
    const ent = await getEntitlements(businessId, tx);
    if (!ent.canSend) throw new AppError("PAYMENT_REQUIRED", "Necesitas una suscripción activa.");
    const usage = await getCurrentUsage(businessId, tx);
    const pending = await countPendingJobs(tx, businessId);
    if (!usage || usage.sent + pending >= usage.emailLimit) throw new AppError("PLAN_LIMIT", reasonMessage("LIMIT_REACHED")!);
    const conn = await tx.emailConnection.findUnique({ where: { businessId } });
    if (!conn || conn.status !== ConnectionStatus.ACTIVE) throw new AppError("CONFLICT", "Conecta tu cuenta de correo antes de reintentar.");
    await tx.emailJob.update({
      where: { id: job.id },
      data: { status: EmailJobStatus.QUEUED, statusReason: null, scheduledFor: new Date(), attempts: 0, lastError: null, connectionId: conn.id },
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
