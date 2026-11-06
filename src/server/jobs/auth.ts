import "server-only";

import { timingSafeEqual } from "node:crypto";

/**
 * Autenticación de los endpoints internos de jobs: `Authorization: Bearer
 * <CRON_SECRET>` (formato que usa Vercel Cron). Comparación en tiempo
 * constante. Sin CRON_SECRET configurado, los endpoints están desactivados.
 */
export function isAuthorizedJobRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return false;
  const header = request.headers.get("authorization") ?? "";
  const given = Buffer.from(header.startsWith("Bearer ") ? header.slice(7) : "");
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
