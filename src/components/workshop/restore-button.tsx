"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/button";
import type { ActionState } from "@/server/actions/result";
import { restoreCustomerAction, restoreVehicleAction } from "@/server/modules/workshop/actions";

export function RestoreButton({ id, kind }: { id: string; kind: "customer" | "vehicle" }) {
  const [state, action] = useActionState(kind === "customer" ? restoreCustomerAction : restoreVehicleAction, { status: "idle" } as ActionState);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="secondary" pendingLabel="Restaurando…">
        Restaurar
      </SubmitButton>
      {state.status === "error" ? <p className="max-w-xs text-right text-sm text-[var(--danger)]">{state.message}</p> : null}
    </form>
  );
}
