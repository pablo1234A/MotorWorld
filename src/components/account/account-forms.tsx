"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import type { ActionState } from "@/server/actions/result";
import { changePasswordAction, updateProfileAction } from "@/server/modules/auth/actions";

const idle: ActionState = { status: "idle" };

function Message({ state }: { state: ActionState }) {
  if (state.status === "error" && !state.fieldErrors) return <Alert tone="error">{state.message}</Alert>;
  if (state.status === "success" && state.message) return <Alert tone="success">{state.message}</Alert>;
  return null;
}

export function ProfileForm({ firstName, lastName }: { firstName: string; lastName: string }) {
  const [state, action] = useActionState(updateProfileAction, idle);
  const errors = state.status === "error" ? state.fieldErrors : undefined;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Message state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" name="firstName" defaultValue={firstName} autoComplete="given-name" errors={errors?.firstName} />
        <Field label="Apellidos" name="lastName" defaultValue={lastName} autoComplete="family-name" errors={errors?.lastName} />
      </div>
      <div>
        <SubmitButton>Guardar</SubmitButton>
      </div>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePasswordAction, idle);
  const errors = state.status === "error" ? state.fieldErrors : undefined;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate key={state.status === "success" ? "done" : "form"}>
      <Message state={state} />
      <Field label="Contraseña actual" name="currentPassword" type="password" autoComplete="current-password" errors={errors?.currentPassword} />
      <Field
        label="Contraseña nueva"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="Mínimo 10 caracteres, con mayúsculas, minúsculas y números."
        errors={errors?.password}
      />
      <Field label="Repite la contraseña nueva" name="passwordConfirm" type="password" autoComplete="new-password" errors={errors?.passwordConfirm} />
      <div>
        <SubmitButton>Cambiar contraseña</SubmitButton>
      </div>
    </form>
  );
}
