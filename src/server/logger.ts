import "server-only";

/**
 * Logger estructurado (JSON por línea) con redacción de datos sensibles.
 * Nunca registra contraseñas, tokens, cookies, cabeceras de autorización ni
 * datos personales de contacto (SEGURIDAD §1).
 */

type Level = "debug" | "info" | "warn" | "error";

const SENSITIVE_KEY = /pass(word)?|token|secret|authorization|cookie|api[-_]?key|email|phone|telefono|nonce|auth_?code|otp/i;
const MAX_DEPTH = 5;

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > MAX_DEPTH) return "[…]";
  if (value instanceof Error) {
    return { name: value.name, message: value.message, ...(("code" in value) ? { code: (value as { code: unknown }).code } : {}) };
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? "[redactado]" : redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string") {
    // Emails sueltos dentro de textos.
    return value.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email]");
  }
  return value;
}

function write(level: Level, event: string, data?: Record<string, unknown>) {
  if (level === "debug" && process.env.NODE_ENV === "production") return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...(redact(data ?? {}) as object) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (event: string, data?: Record<string, unknown>) => write("debug", event, data),
  info: (event: string, data?: Record<string, unknown>) => write("info", event, data),
  warn: (event: string, data?: Record<string, unknown>) => write("warn", event, data),
  error: (event: string, data?: Record<string, unknown>) => write("error", event, data),
};
