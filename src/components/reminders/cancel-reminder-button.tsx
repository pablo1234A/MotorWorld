"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/button";
import type { ActionState } from "@/server/actions/result";
import { cancelReminderAction } from "@/server/modules/reminders/actions";

export function CancelReminderButton({ id, label }: { id: string; label: string }) {
  const [state, action] = useActionState(cancelReminderAction, { status: "idle" } as ActionState);
  return (
    <form
      action={action}
      className="flex flex-col items-end gap-1"
      onSubmit={(e) => {
        if (!window.confirm("¿Cancelar este aviso? No se enviará.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="ghost" pendingLabel="Cancelando…" aria-label={`Cancelar aviso de ${label}`}>
        Cancelar
      </SubmitButton>
      {state.status === "error" ? <p className="max-w-xs text-right text-sm text-[var(--danger)]">{state.message}</p> : null}
    </form>
  );
}
