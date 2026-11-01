import { env } from "@/server/env";
import { route } from "@/server/http/handler";
import { AppError } from "@/server/http/errors";
import { verifyTwilioSignature } from "@/server/sms/twilio";
import { applySmsStatus } from "@/server/modules/automation/sender";

/** StatusCallback de Twilio: estado de entrega real del SMS. Firma X-Twilio-Signature verificada. */
export const POST = route(
  async (req, ctx) => {
    const { token } = await ctx.params;
    if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) throw new AppError("NOT_FOUND", "No encontrado");
    const raw = await req.text();
    const params = Object.fromEntries(new URLSearchParams(raw));
    const url = `${env().APP_URL}/api/webhooks/twilio/${token}`;
    if (!verifyTwilioSignature(url, params, req.headers.get("x-twilio-signature"))) throw new AppError("UNAUTHENTICATED", "Firma de Twilio no válida");
    await applySmsStatus(token, String(params.MessageStatus ?? ""), params.ErrorCode ?? null);
    return new Response(null, { status: 204 });
  },
  { csrf: false },
);
