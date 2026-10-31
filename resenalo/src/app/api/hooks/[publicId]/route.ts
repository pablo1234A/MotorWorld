import { route } from "@/server/http/handler";
import { parseWith } from "@/server/http/request";
import { AppError } from "@/server/http/errors";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { verifyInboundWebhook } from "@/server/modules/integrations";
import { inboundEventSchema, ingestEvent } from "@/server/modules/events-ingest";
import { clientIp } from "@/server/http/request";

/** Webhook entrante firmado con HMAC-SHA256 (cabecera X-Resenalo-Signature). */
export const POST = route(
  async (req, ctx) => {
    const { publicId } = await ctx.params;
    // Límite por IP antes de verificar la firma (frena abusos sin consumir el cupo del negocio)…
    await enforceRateLimit(`hook-ip:${publicId}:${clientIp(req)}`, 120, 60);
    const raw = await req.text();
    if (raw.length > 32_000) throw new AppError("BAD_REQUEST", "Payload demasiado grande");
    const business = await verifyInboundWebhook(publicId, raw, req.headers.get("x-resenalo-signature"));
    // …y límite por negocio solo para peticiones correctamente firmadas.
    await enforceRateLimit(`hook:${business.id}`, 120, 60);
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new AppError("BAD_REQUEST", "JSON no válido");
    }
    const result = await ingestEvent(business, parseWith(inboundEventSchema, json), "WEBHOOK");
    return Response.json(result, { status: result.status === "CREATED" ? 201 : 200 });
  },
  { csrf: false },
);
