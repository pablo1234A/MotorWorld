"use client";

import { useActionState } from "react";
import { Checkbox, Field, FormMessage, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { changeEmail, requestAccountDeletion, updateBusiness, updateProfile } from "@/lib/actions/account";
import { initialFormState } from "@/lib/actions/types";
import type { OrganizationRow, ProfileRow } from "@/lib/db/types";

export function BusinessForm({ org }: { org: OrganizationRow }) {
  const [state, action] = useActionState(updateBusiness, initialFormState);
  const fe = state.fieldErrors ?? {};
  const f = (id: keyof OrganizationRow, label: string, opts: { type?: string; autoComplete?: string; className?: string } = {}) => (
    <Field id={id} label={label} error={fe[id]} className={opts.className} required={false}>
      <Input id={id} name={id} type={opts.type ?? "text"} autoComplete={opts.autoComplete} defaultValue={(org[id] as string) ?? ""} aria-invalid={!!fe[id]} />
    </Field>
  );
  return (
    <form action={action} className="space-y-5" noValidate>
      <Field id="owner_type" label="Titular" required={false}>
        <Select id="owner_type" name="owner_type" defaultValue={org.owner_type ?? ""}>
          <option value="">Sin indicar</option>
          <option value="persona_fisica">Persona física (autónomo)</option>
          <option value="persona_juridica">Sociedad o entidad</option>
        </Select>
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        {f("legal_name", "Nombre o razón social", { autoComplete: "organization" })}
        {f("trade_name", "Nombre comercial")}
        {f("nif", "NIF / NIE")}
        {f("contact_email", "Email de contacto", { type: "email", autoComplete: "email" })}
        {f("phone", "Teléfono", { type: "tel", autoComplete: "tel" })}
        {f("website_url", "Página web", { type: "url", autoComplete: "url" })}
      </div>
      {f("address_line", "Domicilio", { autoComplete: "street-address" })}
      <div className="grid gap-5 sm:grid-cols-3">
        {f("postal_code", "Código postal", { autoComplete: "postal-code" })}
        {f("city", "Municipio", { autoComplete: "address-level2" })}
        {f("province", "Provincia", { autoComplete: "address-level1" })}
      </div>
      <Field id="activity" label="Actividad" error={fe.activity} required={false}>
        <Textarea id="activity" name="activity" defaultValue={org.activity ?? ""} maxLength={500} rows={3} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Guardando…">Guardar datos del negocio</SubmitButton>
    </form>
  );
}

export function ProfileForm({ profile }: { profile: ProfileRow }) {
  const [state, action] = useActionState(updateProfile, initialFormState);
  return (
    <form action={action} className="space-y-5" noValidate>
      <Field id="full_name" label="Tu nombre" required error={state.fieldErrors?.full_name}>
        <Input id="full_name" name="full_name" autoComplete="name" defaultValue={profile.full_name ?? ""} />
      </Field>
      <div className="space-y-3">
        <Checkbox name="notify_legal_updates" defaultChecked={profile.notify_legal_updates} label="Avisarme por email de actualizaciones relevantes de mis documentos" description="Comunicaciones del servicio contratado." />
        <Checkbox name="marketing_consent" defaultChecked={profile.marketing_consent} label="Recibir novedades y consejos de Legalito" description="Comunicaciones comerciales. Puedes retirar tu consentimiento cuando quieras." />
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Guardando…">Guardar preferencias</SubmitButton>
    </form>
  );
}

export function EmailForm({ email }: { email: string }) {
  const [state, action] = useActionState(changeEmail, initialFormState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <p className="text-sm text-muted">Email actual: <strong className="text-ink">{email}</strong></p>
      <Field id="email" label="Nuevo email" required error={state.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" />
      </Field>
      <FormMessage state={state} />
      <SubmitButton variant="secondary" pendingLabel="Enviando…">Cambiar email</SubmitButton>
    </form>
  );
}

export function DeletionForm() {
  const [state, action] = useActionState(requestAccountDeletion, initialFormState);
  if (state.ok) return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-4">
      <p className="text-sm text-muted">
        Solicita la supresión de tu cuenta y de tus datos personales. Los datos de facturación se conservarán bloqueados durante los plazos legales. Escribe <strong>ELIMINAR</strong> para confirmar.
      </p>
      <Input name="confirm" aria-label="Confirmación" placeholder="ELIMINAR" className="max-w-xs" autoComplete="off" />
      <FormMessage state={state.error ? { error: state.error } : null} />
      <SubmitButton variant="danger" pendingLabel="Enviando…">Solicitar supresión</SubmitButton>
    </form>
  );
}
