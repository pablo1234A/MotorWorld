export const SESSION_COOKIE = "rsn_session";

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) {
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}

export function serializeCookie(name: string, value: string, opts: { maxAge?: number; secure: boolean; httpOnly?: boolean; sameSite?: "Lax" | "Strict" }) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", `SameSite=${opts.sameSite ?? "Lax"}`];
  if (opts.httpOnly !== false) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  return parts.join("; ");
}
