"use client";

import { useActionState, type ReactNode } from "react";
import { FormMessage } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/lib/actions/types";

/** Formulario genérico para acciones de servidor que devuelven FormState. */
export function ActionForm({
  action,
  children,
  submitLabel,
  variant = "primary",
  className,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  children: ReactNode | ((state: FormState) => ReactNode);
  submitLabel: string;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
}) {
  const [state, formAction] = useActionState(action, {} as FormState);
  return (
    <form action={formAction} className={className ?? "space-y-4"} noValidate>
      {typeof children === "function" ? children(state) : children}
      {state.fieldErrors && Object.keys(state.fieldErrors).length > 0 && (
        <ul className="space-y-1 text-[13px] text-danger">
          {Object.entries(state.fieldErrors).map(([k, v]) => (
            <li key={k}>
              <strong>{k}</strong>: {v}
            </li>
          ))}
        </ul>
      )}
      <FormMessage state={state} />
      <SubmitButton variant={variant} pendingLabel="Guardando…">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
