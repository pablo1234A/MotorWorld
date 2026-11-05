"use client";

import { useActionState, useId, useState } from "react";

import { SubmitButton } from "@/components/ui/button";
import { Field, SelectField } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { fieldErrors, FormMessage, sentValue } from "@/components/ui/form-state";
import { formatPhone } from "@/lib/phone";
import { CUSTOMER_SOURCE_LABELS, SELECTABLE_SOURCES } from "@/lib/validation/workshop";
import type { ActionState } from "@/server/actions/result";
import { createCustomerAction, deleteCustomerAction, updateCustomerAction } from "@/server/modules/workshop/actions";

const idle: ActionState = { status: "idle" };

interface CustomerValues {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  source?: string;
  notes?: string | null;
  remindersOptOut?: boolean;
}

function CustomerFields({ state, values }: { state: ActionState<unknown>; values: CustomerValues }) {
  const v = (name: keyof CustomerValues, fallback?: string) => sentValue(state, name) ?? fallback;
  const uid = useId();
  const systemSource = values.source && !(SELECTABLE_SOURCES as readonly string[]).includes(values.source);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" name="firstName" required defaultValue={v("firstName", values.firstName)} errors={fieldErrors(state, "firstName")} />
        <Field label="Apellidos" name="lastName" defaultValue={v("lastName", values.lastName)} errors={fieldErrors(state, "lastName")} />
        <Field
          label="Correo electrónico"
          name="email"
          type="email"
          defaultValue={v("email", values.email ?? "")}
          errors={fieldErrors(state, "email")}
          hint="Necesario para que reciba los avisos de revisión."
        />
        <Field
          label="Teléfono"
          name="phone"
          type="tel"
          defaultValue={v("phone", formatPhone(values.phone))}
          errors={fieldErrors(state, "phone")}
          placeholder="600 123 456"
        />
      </div>
      {systemSource ? (
        <input type="hidden" name="source" value={values.source} />
      ) : (
        <SelectField label="Origen del cliente" name="source" defaultValue={v("source", values.source ?? "manual")} errors={fieldErrors(state, "source")}>
          {SELECTABLE_SOURCES.map((s) => (
            <option key={s} value={s}>
              {CUSTOMER_SOURCE_LABELS[s]}
            </option>
          ))}
        </SelectField>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`notes-${uid}`} className="text-sm font-medium">
          Notas internas
        </label>
        <textarea
          id={`notes-${uid}`}
          name="notes"
          rows={3}
          maxLength={5000}
          defaultValue={v("notes", values.notes ?? "")}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[15px] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)]"
        />
        <p className="text-sm text-[var(--muted)]">Solo las ve el taller. No anotes datos de salud ni otros datos sensibles.</p>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="remindersOptOut" defaultChecked={values.remindersOptOut} className="mt-0.5" />
        No quiere recibir avisos de revisión por correo
      </label>
    </>
  );
}

export function CreateCustomerForm({ branches }: { branches: Array<{ id: string; name: string }> }) {
  const [state, action] = useActionState(createCustomerAction, idle);
  const duplicate = state.status === "error" && state.code === "possible_duplicate";
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {duplicate ? (
        <Alert tone="warning" title="Posible cliente repetido">
          {state.message}
          <label className="mt-2 flex items-center gap-2 font-medium">
            <input type="checkbox" name="confirmDuplicate" /> Es otra persona: crear igualmente
          </label>
        </Alert>
      ) : (
        <FormMessage state={state} />
      )}
      {branches.length > 1 ? (
        <SelectField label="Taller" name="branchId" defaultValue={sentValue(state, "branchId") ?? branches[0]?.id} errors={fieldErrors(state, "branchId")}>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </SelectField>
      ) : (
        <input type="hidden" name="branchId" value={branches[0]?.id ?? ""} />
      )}
      <CustomerFields state={state} values={{}} />
      <div>
        <SubmitButton pendingLabel="Guardando…">Crear cliente</SubmitButton>
      </div>
    </form>
  );
}

export function EditCustomerForm({ customer, disabled }: { customer: CustomerValues & { id: string }; disabled?: boolean }) {
  const [state, action] = useActionState(updateCustomerAction, idle);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="id" value={customer.id} />
      <fieldset disabled={disabled} className="flex flex-col gap-4">
        <CustomerFields state={state} values={customer} />
        {!disabled ? (
          <div>
            <SubmitButton>Guardar cambios</SubmitButton>
          </div>
        ) : null}
      </fieldset>
    </form>
  );
}

export function DeleteCustomerForm({ id, name, vehicleCount, canDeleteVehicles }: { id: string; name: string; vehicleCount: number; canDeleteVehicles: boolean }) {
  const [state, action] = useActionState(deleteCustomerAction, idle);
  const [withVehicles, setWithVehicles] = useState(false);
  const blocked = vehicleCount > 0 && (!withVehicles || !canDeleteVehicles);
  return (
    <form
      action={action}
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        const text = withVehicles
          ? `¿Borrar a ${name} y sus ${vehicleCount} vehículos? Dejarán de recibir avisos. Podrás restaurarlos desde la papelera durante 30 días.`
          : `¿Borrar a ${name}?`;
        if (!window.confirm(text)) e.preventDefault();
      }}
    >
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      {vehicleCount > 0 ? (
        canDeleteVehicles ? (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="withVehicles" checked={withVehicles} onChange={(e) => setWithVehicles(e.target.checked)} className="mt-0.5" />
            Borrar también sus {vehicleCount} {vehicleCount === 1 ? "vehículo" : "vehículos"}
          </label>
        ) : (
          <p className="text-sm text-[var(--muted)]">Tiene vehículos: para borrarlo necesitas también permiso para borrar vehículos.</p>
        )
      ) : null}
      <div>
        <SubmitButton variant="danger" disabled={blocked} pendingLabel="Borrando…">
          Borrar cliente
        </SubmitButton>
      </div>
    </form>
  );
}
