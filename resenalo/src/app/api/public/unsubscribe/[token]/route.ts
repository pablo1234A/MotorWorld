import { route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { clientIp } from "@/server/http/request";
import { unsubscribeByToken } from "@/server/modules/customers";

/** Baja en un clic (RFC 8058) y formulario de la página /baja/[token]. */
export const POST = route(
  async (req, ctx) => {
    await enforceRateLimit(`unsub:${clientIp(req)}`, 30, 3600);
    const { token } = await ctx.params;
    if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) return Response.json({ ok: false }, { status: 404 });
    const r = await unsubscribeByToken(token);
    if (!r) return Response.json({ ok: false }, { status: 404 });
    const accept = req.headers.get("accept") ?? "";
    if (accept.includes("text/html")) return Response.redirect(new URL(`/baja/${token}?hecho=1`, req.url), 303);
    return Response.json({ ok: true });
  },
  { csrf: false },
);
