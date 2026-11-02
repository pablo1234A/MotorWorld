import { Channel, ConnectionStatus, EmailJobStatus, EmailLogEvent, type SmsDevice } from "@prisma/client";
import { prisma } from "../db";
import { env } from "../env";
import { decrypt, encrypt, randomToken } from "../crypto";
import { AppError } from "../http/errors";
import { logger } from "../logger";
import { ProviderError } from "../email/providers/types";
import { sendSystemEmail } from "../email/system-mailer";
import { getSmsGateway, SMSGATE_CLOUD_URL, type GatewayCreds } from "../sms/smsgate";
import { normalizePhone } from "@/lib/phone";
import { enqueueEmailJob } from "../queue/queues";
import { audit } from "./audit";

export const smsWebhookUrl = (token: string) => `${env().APP_URL}/api/webhooks/smsgate/${token}`;

export function credsOf(d: SmsDevice): GatewayCreds {
  return { apiBaseUrl: d.apiBaseUrl, login: d.login, password: decrypt(d.passwordEnc), deviceId: d.deviceId };
}

export function publicSmsDevice(d: SmsDevice | null) {
  if (!d) return null;
  return {
    status: d.status,
    deviceId: d.deviceId,
    deviceName: d.deviceName,
    phoneNumber: d.phoneNumber,
    usesCloud: d.apiBaseUrl === SMSGATE_CLOUD_URL,
    apiBaseUrl: d.apiBaseUrl,
    lastSeenAt: d.lastSeenAt,
    lastCheckedAt: d.lastCheckedAt,
    lastError: d.lastError,
    connectedAt: d.connectedAt,
    needsDevice: !d.deviceId,
  };
}

function wrap(err: unknown): never {
  if (err instanceof ProviderError) throw new AppError(err.kind === "auth" ? "VALIDATION" : "PROVIDER_ERROR", err.message);
  throw err;
}

/** Solo se aceptan servidores https (o el servidor en la nube oficial). Evita que el backend llame a redes internas. */
function validateBaseUrl(raw: string | null | undefined) {
  const url = (raw?.trim() || SMSGATE_CLOUD_URL).replace(/\/+$/, "");
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new AppError("VALIDATION", "La dirección del servidor no es válida.");
  }
  const privateHost = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0|\[?::1\]?)/i.test(u.hostname);
  if (env().NODE_ENV === "production" && (u.protocol !== "https:" || privateHost)) throw new AppError("VALIDATION", "El servidor privado debe usar https y una dirección pública.");
  return url;
}

/**
 * Vincula el móvil Android del negocio. Comprueba con la API de SMS Gate que las
 * credenciales funcionan antes de guardarlas (cifradas). Nunca se marca como conectado sin esa comprobación.
 */
export async function connectSmsDevice(
  p: { businessId: string; userId: string; login: string; password: string; apiBaseUrl?: string | null; phoneNumber?: string | null; deviceId?: string | null },
  req?: Request,
) {
  const apiBaseUrl = validateBaseUrl(p.apiBaseUrl);
  const creds: GatewayCreds = { apiBaseUrl, login: p.login.trim(), password: p.password.trim() };
  const devices = await getSmsGateway().listDevices(creds).catch(wrap);
  if (!devices.length) throw new AppError("VALIDATION", "Las credenciales son correctas, pero no hay ningún móvil vinculado. Abre la app SMS Gate y activa «Servidor en la nube».");
  const chosen = p.deviceId ? devices.find((d) => d.id === p.deviceId) : devices.length === 1 ? devices[0] : null;
  if (p.deviceId && !chosen) throw new AppError("VALIDATION", "Ese móvil no pertenece a esta cuenta de SMS Gate.");
  const phone = p.phoneNumber ? normalizePhone(p.phoneNumber) : null;
  if (p.phoneNumber && !phone) throw new AppError("VALIDATION", "El número del móvil no es válido (usa +34 600 000 000).");

  const existing = await prisma.smsDevice.findUnique({ where: { businessId: p.businessId } });
  if (existing) await removeWebhooks(existing);
  const data = {
    apiBaseUrl,
    login: creds.login,
    passwordEnc: encrypt(creds.password),
    deviceId: chosen?.id ?? null,
    deviceName: chosen?.name ?? null,
    phoneNumber: phone,
    status: ConnectionStatus.ACTIVE,
    lastSeenAt: chosen?.lastSeen ? new Date(chosen.lastSeen) : null,
    lastCheckedAt: new Date(),
    lastError: null,
    connectedAt: new Date(),
    webhookIds: [] as string[],
  };
  const device = await prisma.smsDevice.upsert({
    where: { businessId: p.businessId },
    create: { businessId: p.businessId, webhookToken: randomToken(24), ...data },
    update: data,
  });
  const withHooks = chosen ? await registerWebhooks(device) : device;
  await audit({ action: "sms_device.connected", userId: p.userId, businessId: p.businessId, meta: { device: chosen?.name ?? null }, req });
  if (chosen) await resumeSmsOnHold(p.businessId);
  return { device: withHooks, devices };
}

export async function listGatewayDevices(businessId: string) {
  const d = await prisma.smsDevice.findUnique({ where: { businessId } });
  if (!d) throw new AppError("NOT_FOUND", "No has vinculado ningún móvil.");
  return getSmsGateway().listDevices(credsOf(d)).catch(wrap);
}

export async function selectSmsDevice(businessId: string, deviceId: string) {
  const d = await prisma.smsDevice.findUnique({ where: { businessId } });
  if (!d) throw new AppError("NOT_FOUND", "No has vinculado ningún móvil.");
  const dev = (await getSmsGateway().listDevices(credsOf(d)).catch(wrap)).find((x) => x.id === deviceId);
  if (!dev) throw new AppError("VALIDATION", "Ese móvil no pertenece a esta cuenta de SMS Gate.");
  await removeWebhooks(d);
  const updated = await prisma.smsDevice.update({
    where: { id: d.id },
    data: { deviceId: dev.id, deviceName: dev.name, lastSeenAt: dev.lastSeen ? new Date(dev.lastSeen) : null, webhookIds: [] },
  });
  await registerWebhooks(updated);
  await resumeSmsOnHold(businessId);
}

/** Webhooks de estado (enviado / entregado / fallido). Si no se pueden registrar, el barrido consulta el estado. */
async function registerWebhooks(d: SmsDevice) {
  const ids: string[] = [];
  for (const ev of ["sms:sent", "sms:delivered", "sms:failed"] as const) {
    try {
      const id = await getSmsGateway().registerWebhook(credsOf(d), ev, smsWebhookUrl(d.webhookToken));
      if (id) ids.push(id);
    } catch (err) {
      logger.warn({ err, ev }, "no se pudo registrar el webhook de SMS Gate; se usará la consulta periódica");
    }
  }
  return prisma.smsDevice.update({ where: { id: d.id }, data: { webhookIds: ids } });
}

async function removeWebhooks(d: SmsDevice) {
  for (const id of d.webhookIds) await getSmsGateway().deleteWebhook(credsOf(d), id);
}

/** Comprueba que las credenciales siguen siendo válidas y cuándo se vio el móvil por última vez. */
export async function checkSmsDevice(businessId: string) {
  const d = await prisma.smsDevice.findUnique({ where: { businessId } });
  if (!d || d.status === ConnectionStatus.DISCONNECTED) throw new AppError("NOT_FOUND", "No has vinculado ningún móvil.");
  try {
    const dev = (await getSmsGateway().listDevices(credsOf(d))).find((x) => x.id === d.deviceId);
    if (!dev) {
      await prisma.smsDevice.update({ where: { id: d.id }, data: { lastCheckedAt: new Date(), lastError: "El móvil ya no aparece en la cuenta de SMS Gate." } });
      return { ok: false, error: "El móvil ya no aparece en la cuenta de SMS Gate. Vuelve a vincularlo." };
    }
    const lastSeen = dev.lastSeen ? new Date(dev.lastSeen) : null;
    await prisma.smsDevice.update({ where: { id: d.id }, data: { status: ConnectionStatus.ACTIVE, lastSeenAt: lastSeen, lastCheckedAt: new Date(), lastError: null } });
    return { ok: true, lastSeenAt: lastSeen, error: null };
  } catch (err) {
    if (err instanceof ProviderError && err.kind === "auth") {
      await markSmsDeviceAuthFailure(businessId, err.message);
      return { ok: false, error: err.message };
    }
    await prisma.smsDevice.update({ where: { id: d.id }, data: { lastCheckedAt: new Date(), lastError: (err as Error).message.slice(0, 300) } });
    return { ok: false, error: (err as Error).message };
  }
}

export async function markSmsDeviceAuthFailure(businessId: string, reason: string) {
  const d = await prisma.smsDevice.findUnique({ where: { businessId }, include: { business: { include: { owner: true } } } });
  if (!d) return;
  await prisma.smsDevice.update({ where: { id: d.id }, data: { status: ConnectionStatus.NEEDS_REAUTH, lastError: reason.slice(0, 300) } });
  await prisma.emailJob.updateMany({
    where: { businessId, channel: Channel.SMS, status: { in: [EmailJobStatus.QUEUED] } },
    data: { status: EmailJobStatus.ON_HOLD, statusReason: "SMS_DEVICE_AUTH" },
  });
  await audit({ action: "sms_device.auth_failed", businessId, meta: { reason: reason.slice(0, 200) } });
  if (d.status === ConnectionStatus.ACTIVE)
    await sendSystemEmail({
      to: d.business.owner.email,
      subject: "Acción necesaria: vuelve a vincular tu móvil para los SMS",
      heading: "Tu móvil ya no está autorizado",
      paragraphs: ["SMS Gate ha rechazado las credenciales de tu móvil. Los SMS pendientes quedan en espera hasta que vuelvas a vincularlo."],
      action: { label: "Vincular mi móvil", url: `${env().APP_URL}/app/conexion-sms` },
    }).catch(() => undefined);
}

/** Reanuda los SMS retenidos al volver a vincular un móvil. */
export async function resumeSmsOnHold(businessId: string) {
  const held = await prisma.emailJob.findMany({ where: { businessId, channel: Channel.SMS, status: EmailJobStatus.ON_HOLD } });
  for (const j of held) {
    const due = j.scheduledFor.getTime() <= Date.now();
    const upd = await prisma.emailJob.updateMany({
      where: { id: j.id, status: EmailJobStatus.ON_HOLD },
      data: { status: due ? EmailJobStatus.QUEUED : EmailJobStatus.SCHEDULED, statusReason: null },
    });
    if (!upd.count) continue;
    await prisma.emailLog.create({ data: { emailJobId: j.id, businessId, event: EmailLogEvent.REQUEUED, message: "Reanudado tras vincular el móvil." } });
    if (due) await enqueueEmailJob(j.id);
  }
}

/** SMS de prueba al propio número del negocio (no consume cupo). */
export async function sendTestSms(businessId: string, userId: string, to: string, req?: Request) {
  const d = await prisma.smsDevice.findUnique({ where: { businessId }, include: { business: true } });
  if (!d || d.status !== ConnectionStatus.ACTIVE || !d.deviceId) throw new AppError("CONFLICT", "Vincula primero tu móvil.");
  const phone = normalizePhone(to);
  if (!phone) throw new AppError("VALIDATION", "Número no válido.");
  const r = await getSmsGateway()
    .send(credsOf(d), { to: phone, text: `Prueba de Reseñalo: los SMS de ${d.business.name} saldrán desde este móvil.`, id: `test-${randomToken(9)}`, ttlSeconds: 3600 })
    .catch(wrap);
  await audit({ action: "sms_device.test_sent", userId, businessId, meta: { to: phone, messageId: r.messageId }, req });
  return r;
}

export async function disconnectSmsDevice(businessId: string, userId: string, req?: Request) {
  const d = await prisma.smsDevice.findUnique({ where: { businessId } });
  if (!d) throw new AppError("NOT_FOUND", "No has vinculado ningún móvil.");
  await removeWebhooks(d).catch(() => undefined);
  await prisma.smsDevice.delete({ where: { id: d.id } });
  await prisma.emailJob.updateMany({
    where: { businessId, channel: Channel.SMS, status: { in: [EmailJobStatus.QUEUED, EmailJobStatus.SCHEDULED] } },
    data: { status: EmailJobStatus.ON_HOLD, statusReason: "NO_SMS_DEVICE" },
  });
  await audit({ action: "sms_device.disconnected", userId, businessId, req });
}
