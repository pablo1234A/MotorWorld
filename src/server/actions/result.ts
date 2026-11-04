import "server-only";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { errorMessage } from "@/lib/error-messages";
import { DomainError, mapDatabaseError } from "@/server/db/errors";
import { logger } from "@/server/logger";

/**
 * Resultado uniforme de las Server Actions usadas con `useActionState`.
 * El servidor siempre valida y autoriza; el cliente solo pinta el estado.
 */
export type ActionState<T = undefined> =
  | { status: "idle" }
  | { status: "success"; message?: string; data?: T }
  | {
      status: "error";
      code: string;
      message: string;
      fieldErrors?: Record<string, string[]>;
      /** Valores enviados (sin contraseñas) para repintar el formulario. */
      values?: Record<string, string>;
    };

export const idle: ActionState<never> = { status: "idle" };

/** Campos que nunca se devuelven al cliente para repintar el formulario. */
const NEVER_ECHO = /password|contrasena|token/i;

function echoValues(formData?: FormData): Record<string, string> | undefined {
  if (!formData) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string" && !NEVER_ECHO.test(k) && !k.startsWith("$ACTION")) out[k] = v;
  }
  return out;
}

export function parseForm<S extends z.ZodType>(schema: S, formData: FormData): z.infer<S> {
  const raw: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    const all = formData.getAll(key);
    raw[key] = all.length > 1 || key.endsWith("[]") ? all : all[0];
  }
  return schema.parse(raw);
}

/**
 * Ejecuta la acción traduciendo errores a un estado seguro para el cliente.
 * Los redirect()/notFound() de Next.js se relanzan.
 */
export async function runAction<T>(
  action: string,
  fn: () => Promise<ActionState<T>>,
  formData?: FormData,
): Promise<ActionState<T>> {
  try {
    return await fn();
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof z.ZodError) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of err.issues) {
        const key = issue.path.join(".") || "_form";
        (fieldErrors[key] ??= []).push(issue.message);
      }
      return {
        status: "error",
        code: "validation_error",
        message: errorMessage("validation_error"),
        fieldErrors,
        values: echoValues(formData),
      };
    }
    const domain = err instanceof DomainError ? err : mapDatabaseError(err);
    if (domain.code === "internal_error") {
      logger.error("action_failed", { action, error: domain.cause ?? err });
    } else {
      logger.info("action_rejected", { action, code: domain.code, detail: domain.detail });
    }
    return {
      status: "error",
      code: domain.code,
      message: errorMessage(domain.code, domain.detail),
      values: echoValues(formData),
    };
  }
}
