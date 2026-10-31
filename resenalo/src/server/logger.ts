import pino from "pino";

const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info");

/**
 * Logger estructurado (JSON). Los campos sensibles se ocultan automáticamente.
 */
export const logger = pino({
  level,
  base: { service: process.env.SERVICE_NAME ?? "resenalo-web" },
  redact: {
    paths: [
      "password",
      "*.password",
      "token",
      "*.token",
      "accessToken",
      "refreshToken",
      "*.accessToken",
      "*.refreshToken",
      "authorization",
      "*.authorization",
      "headers.cookie",
      "req.headers.cookie",
    ],
    censor: "[oculto]",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/** Envía errores críticos a un webhook de monitorización si está configurado. */
export async function reportError(err: unknown, context: Record<string, unknown> = {}) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error({ err, ...context }, message);
  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: `[Reseñalo] ${message}`,
        service: process.env.SERVICE_NAME ?? "resenalo-web",
        context,
        stack: err instanceof Error ? err.stack?.split("\n").slice(0, 8).join("\n") : undefined,
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // La monitorización nunca debe tumbar la petición original.
  }
}
