"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/button";
import { Field, SelectField } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import type { ActionState } from "@/server/actions/result";
import { createOrganizationAction } from "@/server/modules/organizations/actions";

const initial: ActionState = { status: "idle" };

export function CreateOrganizationForm() {
  const [state, action] = useActionState(createOrganizationAction, initial);
  const errors = state.status === "error" ? state.fieldErrors : undefined;
  const values = state.status === "error" ? state.values : undefined;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && !state.fieldErrors ? <Alert tone="error">{state.message}</Alert> : null}
      <Field
        label="Nombre del taller"
        name="tradeName"
        required
        placeholder="Taller Sur"
        defaultValue={values?.tradeName}
        errors={errors?.tradeName}
        hint="Es el nombre que verán tus clientes en los avisos."
      />
      <Field
        label="Dirección pública (opcional)"
        name="slug"
        placeholder="taller-sur"
        defaultValue={values?.slug}
        errors={errors?.slug}
        hint="Se usa en el enlace para pedir cita. Si la dejas vacía la creamos a partir del nombre."
      />
      <SelectField label="Zona horaria" name="timezone" defaultValue={values?.timezone ?? "Europe/Madrid"} errors={errors?.timezone}>
        <option value="Europe/Madrid">Península y Baleares</option>
        <option value="Atlantic/Canary">Canarias</option>
      </SelectField>
      <SubmitButton pendingLabel="Creando taller…">Crear taller</SubmitButton>
    </form>
  );
}
