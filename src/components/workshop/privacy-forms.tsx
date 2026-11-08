"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { fieldErrors, FormMessage } from "@/components/ui/form-state";
import { eraseCustomerAction } from "@/server/modules/privacy/actions";

export function EraseCustomerForm({ id, name }: { id: string; name: string }) {
  const [state, action] = useActionState(eraseCustomerAction, { status: "idle" as const });
  return (
    <form action={action} className="flex flex-col gap-3 sm:max-w-sm">
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <Field label={`Escribe BORRAR para eliminar a ${name}`} name="confirm" autoComplete="off" required errors={fieldErrors(state, "confirm")} />
      <SubmitButton variant="danger" pendingLabel="Borrando…">
        Borrar definitivamente ahora
      </SubmitButton>
    </form>
  );
}
