"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-state";
import type { ActionState } from "@/server/actions/result";
import { connectGoogleAction, disconnectGoogleAction } from "@/server/modules/integrations/actions";

const idle: ActionState = { status: "idle" };

export function ConnectGoogleButton({ reconnect = false }: { reconnect?: boolean }) {
  const [state, action] = useActionState(connectGoogleAction, idle);
  return (
    <form action={action} className="flex flex-col gap-2">
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Abriendo Google…" className="self-start">
        {reconnect ? "Volver a conectar con Google" : "Conectar con Google Calendar"}
      </SubmitButton>
    </form>
  );
}

export function DisconnectGoogleButton() {
  const [state, action] = useActionState(disconnectGoogleAction, idle);
  return (
    <form
      action={action}
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        if (!window.confirm("¿Desconectar Google Calendar? Las citas ya creadas en tu agenda se quedan, pero no se actualizarán más.")) e.preventDefault();
      }}
    >
      <FormMessage state={state} />
      <SubmitButton variant="ghost" pendingLabel="Desconectando…" className="self-start">
        Desconectar
      </SubmitButton>
    </form>
  );
}
