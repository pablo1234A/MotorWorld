import { ZodError, type ZodTypeAny, type z } from "zod";
import { AppError } from "./errors";

export function clientIp(req: Request): string {
  // Se usa la ÚLTIMA entrada: la añade nuestro proxy inverso y el cliente no puede falsificarla
  // (las anteriores sí). Requiere un proxy que añada X-Forwarded-For (ver README).
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",").pop()!.trim().slice(0, 64);
  return req.headers.get("x-real-ip")?.slice(0, 64) ?? "unknown";
}

export function userAgent(req: Request): string | null {
  return req.headers.get("user-agent")?.slice(0, 300) ?? null;
}

export async function readJson<S extends ZodTypeAny>(req: Request, schema: S, maxBytes = 256_000): Promise<z.infer<S>> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new AppError("BAD_REQUEST", "La petición es demasiado grande.");
  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > maxBytes) throw new AppError("BAD_REQUEST", "La petición es demasiado grande.");
    raw = text ? JSON.parse(text) : {};
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("BAD_REQUEST", "El cuerpo de la petición no es JSON válido.");
  }
  return parseWith(schema, raw);
}

export function parseWith<S extends ZodTypeAny>(schema: S, raw: unknown): z.infer<S> {
  try {
    return schema.parse(raw);
  } catch (e) {
    if (e instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of e.issues) {
        const k = issue.path.join(".") || "_";
        if (!fields[k]) fields[k] = issue.message;
      }
      const first = Object.values(fields)[0] ?? "Datos no válidos";
      throw new AppError("VALIDATION", first, { details: { fields } });
    }
    throw e;
  }
}

export function searchParams(req: Request) {
  return new URL(req.url).searchParams;
}
