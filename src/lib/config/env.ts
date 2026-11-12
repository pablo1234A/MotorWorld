import "server-only";
import { parseEnv, type Env } from "./env-schema";

export { envSchema, parseEnv, type Env } from "./env-schema";


let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const result = parseEnv(process.env);
  if (!result.success) {
    const details = result.error.issues.map((issue) => `- ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Configuración de entorno no válida:\n${details}\nEjecuta "pnpm check:env" para más detalles.`);
  }
  cached = result.data;
  return cached;
}

export function appUrl(path = ""): string {
  return `${getEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}${path}`;
}

/** Los pagos solo están operativos si el interruptor está activo y la configuración es completa. */
export function paymentsEnabled(): boolean {
  return getEnv().PAYMENTS_ENABLED;
}
