import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { env } from "@/lib/env";

/** IP del cliente según las cabeceras del proxy de la plataforma de despliegue. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-real-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("cf-connecting-ip") ??
    "0.0.0.0"
  );
}

/** Seudonimiza un valor (IP, email) con sal: permite limitar abusos sin guardar el dato. */
export function hashValue(value: string): string {
  const salt = env().HASH_SALT ?? "legalito-dev-salt-change-me";
  return createHash("sha256").update(`${salt}:${value}`).digest("hex").slice(0, 32);
}

export async function ipHash(): Promise<string> {
  return hashValue(await clientIp());
}
