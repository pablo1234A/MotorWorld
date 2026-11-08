import "server-only";

import { headers } from "next/headers";

/**
 * IP del cliente detrás del proxy del hosting. Se usa para rate limiting y,
 * truncada, en auditoría. Si no hay cabecera fiable, devuelve "unknown"
 * (el límite se aplica igualmente a ese grupo).
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || h.get("x-real-ip")?.trim();
  return ip && /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : "unknown";
}

/**
 * Ruta interna segura para redirigir tras login/registro. Evita redirecciones
 * abiertas: solo rutas relativas de la propia aplicación.
 */
export function safeNextPath(value: unknown, fallback = "/app"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\r\n]/.test(value) || value.length > 300) return fallback;
  return value;
}

/** IP truncada para registros (IPv4 /24, IPv6 /48): suficiente para seguridad, sin identificar a la persona. */
export function truncateIp(ip: string): string | null {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return `${ip.split(".").slice(0, 3).join(".")}.0`;
  if (ip.includes(":")) {
    const parts = ip.split("::")[0].split(":").filter(Boolean).slice(0, 3);
    return parts.length ? `${parts.join(":")}::` : null;
  }
  return null;
}
