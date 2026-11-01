"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormMessage, Input, Select, Textarea, Checkbox } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { submitSupportRequest } from "@/lib/actions/support";
import { initialFormState } from "@/lib/actions/types";

export function SupportForm({ defaultName, defaultEmail }: { defaultName?: string; defaultEmail?: string }) {
  const [state, action] = useActionState(submitSupportRequest, initialFormState);
  const fe = state.fieldErrors ?? {};

  if (state.ok) return <FormMessage state={state} />;

  return (
    <form action={action} className="space-y-5" noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="name" label="Nombre" required error={fe.name}>
          <Input id="name" name="name" autoComplete="name" defaultValue={defaultName} required aria-invalid={!!fe.name} />
        </Field>
        <Field id="email" label="Email" required error={fe.email}>
          <Input id="email" name="email" type="email" autoComplete="email" defaultValue={defaultEmail} required aria-invalid={!!fe.email} />
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-[1fr_2fr]">
        <Field id="category" label="Tema" required>
          <Select id="category" name="category" defaultValue="general">
            <option value="general">Consulta general</option>
            <option value="documentos">Mis documentos</option>
            <option value="pagos">Pagos y facturas</option>
            <option value="cuenta">Mi cuenta</option>
            <option value="privacidad">Privacidad y mis datos</option>
          </Select>
        </Field>
        <Field id="subject" label="Asunto" required error={fe.subject}>
          <Input id="subject" name="subject" required maxLength={160} aria-invalid={!!fe.subject} />
        </Field>
      </div>
      <Field id="message" label="Mensaje" required error={fe.message}>
        <Textarea id="message" name="message" rows={6} required maxLength={5000} aria-invalid={!!fe.message} />
      </Field>
      {/* Campo trampa para bots, oculto a personas y lectores de pantalla. */}
      <div className="hidden" aria-hidden="true">
        <label>
          No rellenar <input name="company_website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div>
        <Checkbox
          name="privacy"
          required
          label={
            <>
              He leído la <Link href="/legal/privacidad" className="text-blue underline underline-offset-2">información sobre privacidad</Link>.
            </>
          }
          description="Usaremos tus datos solo para responder a tu consulta."
        />
        {fe.privacy && <p className="mt-1.5 text-[13px] font-medium text-danger">{fe.privacy}</p>}
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Enviando…">Enviar mensaje</SubmitButton>
    </form>
  );
}
