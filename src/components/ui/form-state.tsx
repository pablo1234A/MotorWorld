import type { ActionState } from "@/server/actions/result";

import { Alert } from "./feedback";

/** Errores de un campo devueltos por el servidor. */
export function fieldErrors(state: ActionState<unknown>, name: string): string[] | undefined {
  return state.status === "error" ? state.fieldErrors?.[name] : undefined;
}

/** Valor enviado (para repintar tras un error; nunca contraseñas). */
export function sentValue(state: ActionState<unknown>, name: string): string | undefined {
  return state.status === "error" ? state.values?.[name] : undefined;
}

export function FormMessage({ state }: { state: ActionState<unknown> }) {
  if (state.status === "error") {
    const formError = state.fieldErrors?._form?.[0];
    if (formError) return <Alert tone="error">{formError}</Alert>;
    return <Alert tone="error">{state.message}</Alert>;
  }
  if (state.status === "success" && state.message) return <Alert tone="success">{state.message}</Alert>;
  return null;
}
