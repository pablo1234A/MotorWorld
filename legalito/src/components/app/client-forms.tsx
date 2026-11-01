"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";
import { Field, FormMessage, Input, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { createClient, updateClient } from "@/lib/actions/clients";
import { initialFormState } from "@/lib/actions/types";

export function NewClientForm() {
  const [state, action] = useActionState(createClient, initialFormState);
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field id="client-name" label="Nombre del cliente" required error={fe.name} hint="Tal como lo reconoces tú; los datos legales se piden en el formulario.">
        <Input id="client-name" name="name" maxLength={120} required placeholder="Ej.: Panadería Sol" aria-invalid={!!fe.name} />
      </Field>
      <Field id="client-notes" label="Notas internas" error={fe.notes} hint="Solo las ves tú. Por ejemplo, la plataforma de su web.">
        <Input id="client-notes" name="notes" maxLength={500} placeholder="Ej.: WordPress · contacto: Ana" aria-invalid={!!fe.notes} />
      </Field>
      <FormMessage state={state.error ? { error: state.error } : null} />
      <SubmitButton pendingLabel="Creando…">
        <Plus className="h-4 w-4" /> Añadir y rellenar su formulario
      </SubmitButton>
    </form>
  );
}

export function EditClientForm({ id, name, notes }: { id: string; name: string; notes: string | null }) {
  const [state, action] = useActionState(updateClient, initialFormState);
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-3" noValidate>
      <input type="hidden" name="id" value={id} />
      <Field id={`name-${id}`} label="Nombre" required error={fe.name}>
        <Input id={`name-${id}`} name="name" defaultValue={name} maxLength={120} required aria-invalid={!!fe.name} />
      </Field>
      <Field id={`notes-${id}`} label="Notas internas" error={fe.notes}>
        <Textarea id={`notes-${id}`} name="notes" defaultValue={notes ?? ""} maxLength={500} className="min-h-20" aria-invalid={!!fe.notes} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton size="sm" variant="secondary" pendingLabel="Guardando…">
        Guardar
      </SubmitButton>
    </form>
  );
}
