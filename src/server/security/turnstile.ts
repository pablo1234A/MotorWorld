import "server-only";

/**
 * Cloudflare Turnstile (anti-robots de los formularios públicos):
 * https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 * Sin TURNSTILE_SECRET_KEY no se exige (lo indica `enabled: false`); la
 * página sigue protegida por límite de peticiones y campo trampa. Si está
 * configurado y Cloudflare no responde, se rechaza (no se deja pasar a ciegas).
 */
export function turnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

export async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  if (!turnstileEnabled()) return true;
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY!, response: token });
    if (ip !== "unknown") body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
