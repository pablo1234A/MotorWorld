import { prisma } from "@/server/db";
import { route } from "@/server/http/handler";
import { AppError } from "@/server/http/errors";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { confirmSmsState } from "@/server/modules/automation/sender";

/**
 * Aviso de SMS Gate (sms:sent / sms:delivered / sms:failed). La URL lleva un token secreto
 * por negocio y, además, el estado NO se toma del cuerpo: se confirma consultando la API de
 * SMS Gate con las credenciales del negocio. Un aviso falsificado no puede cambiar nada.
 */
export const POST = route(
  async (req, ctx) => {
    const { token } = await ctx.params;
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new AppError("NOT_FOUND", "No encontrado");
    await enforceRateLimit(`smsgate-hook:${token}`, 600, 60);
    const device = await prisma.smsDevice.findUnique({ where: { webhookToken: token }, select: { businessId: true } });
    if (!device) throw new AppError("NOT_FOUND", "No encontrado");
    const raw = await req.text();
    let messageId: string | null = null;
    try {
      const j = JSON.parse(raw);
      messageId = typeof j?.payload?.messageId === "string" ? j.payload.messageId.slice(0, 100) : null;
    } catch {
      throw new AppError("BAD_REQUEST", "JSON no válido");
    }
    if (messageId) {
      const job = await prisma.emailJob.findFirst({ where: { businessId: device.businessId, channel: "SMS", providerMessageId: messageId }, select: { id: true } });
      if (job) await confirmSmsState(job.id);
    }
    return new Response(null, { status: 204 });
  },
  { csrf: false },
);
