"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import type { ActionState } from "@/server/actions/result";
import { acceptInvitationAction } from "@/server/modules/members/actions";

export function AcceptInvitationForm({ token }: { token: string }) {
  const [state, action] = useActionState(acceptInvitationAction, { status: "idle" } as ActionState);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.status === "error" ? <Alert tone="error">{state.message}</Alert> : null}
      <input type="hidden" name="token" value={token} />
      <SubmitButton pendingLabel="Uniéndote…">Aceptar invitación</SubmitButton>
    </form>
  );
}
