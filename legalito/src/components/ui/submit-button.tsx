"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";
import { Button } from "./button";
import { Spinner } from "./feedback";

/** Botón de envío con estado de carga automático dentro de un <form>. */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending && <Spinner className="h-4 w-4" />}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
