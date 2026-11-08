"use client";

import { useActionState, useState } from "react";

import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Card } from "@/components/ui/feedback";
import { fieldErrors, FormMessage, sentValue } from "@/components/ui/form-state";
import { formatPhone } from "@/lib/phone";
import type { ActionState } from "@/server/actions/result";
import { removeLogoAction, updateOrganizationProfileAction, uploadLogoAction } from "@/server/modules/organizations/actions";

const idle: ActionState = { status: "idle" };

export interface ProfileValues {
  tradeName: string;
  legalName: string | null;
  taxId: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
  phone: string | null;
  email: string | null;
  brandPrimary: string | null;
}

export function ProfileForm({ values, readOnly }: { values: ProfileValues; readOnly: boolean }) {
  const [state, action] = useActionState(updateOrganizationProfileAction, idle);
  const v = (name: keyof ProfileValues, fallback: string | null) => sentValue(state, name) ?? fallback ?? "";
  const [color, setColor] = useState(values.brandPrimary ?? "#c8102e");
  return (
    <form action={action} className="flex flex-col gap-6">
      <FormMessage state={state} />
      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Nombre y marca</h2>
        <Field label="Nombre comercial" name="tradeName" required defaultValue={v("tradeName", values.tradeName)} errors={fieldErrors(state, "tradeName")} hint="Es el nombre que ven tus clientes en los correos y en la página de citas." disabled={readOnly} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="brandPrimary" className="text-sm font-medium">
            Color principal
          </label>
          <div className="flex items-center gap-3">
            <input id="brandPrimary" type="color" name="brandPrimary" value={color} onChange={(e) => setColor(e.target.value)} disabled={readOnly} className="h-10 w-16 cursor-pointer rounded border border-[var(--border)]" />
            <span className="font-mono text-sm">{color}</span>
          </div>
          {fieldErrors(state, "brandPrimary") ? <p className="text-sm text-[var(--danger)]">{fieldErrors(state, "brandPrimary")![0]}</p> : <p className="text-sm text-[var(--muted)]">Cabecera de los correos, botón de cita y presupuestos.</p>}
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Datos fiscales</h2>
        <p className="text-sm text-[var(--muted)]">Aparecen en los presupuestos.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Razón social" name="legalName" defaultValue={v("legalName", values.legalName)} errors={fieldErrors(state, "legalName")} disabled={readOnly} />
          <Field label="NIF / CIF" name="taxId" defaultValue={v("taxId", values.taxId)} errors={fieldErrors(state, "taxId")} disabled={readOnly} autoComplete="off" />
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Dirección y contacto</h2>
        <Field label="Dirección" name="addressLine1" defaultValue={v("addressLine1", values.addressLine1)} errors={fieldErrors(state, "addressLine1")} disabled={readOnly} />
        <Field label="Dirección (continuación)" name="addressLine2" defaultValue={v("addressLine2", values.addressLine2)} errors={fieldErrors(state, "addressLine2")} disabled={readOnly} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Código postal" name="postalCode" inputMode="numeric" defaultValue={v("postalCode", values.postalCode)} errors={fieldErrors(state, "postalCode")} disabled={readOnly} />
          <Field label="Población" name="city" defaultValue={v("city", values.city)} errors={fieldErrors(state, "city")} disabled={readOnly} />
          <Field label="Provincia" name="province" defaultValue={v("province", values.province)} errors={fieldErrors(state, "province")} disabled={readOnly} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Teléfono" name="phone" type="tel" defaultValue={v("phone", formatPhone(values.phone))} errors={fieldErrors(state, "phone")} disabled={readOnly} />
          <Field label="Correo de contacto" name="email" type="email" defaultValue={v("email", values.email)} errors={fieldErrors(state, "email")} disabled={readOnly} />
        </div>
      </Card>
      {readOnly ? null : (
        <div>
          <SubmitButton>Guardar datos del taller</SubmitButton>
        </div>
      )}
    </form>
  );
}

export function LogoForm({ logoSrc, readOnly }: { logoSrc: string | null; readOnly: boolean }) {
  const [state, upload] = useActionState(uploadLogoAction, idle);
  const [removeState, remove] = useActionState(removeLogoAction, idle);
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Logo</h2>
      <FormMessage state={state} />
      <FormMessage state={removeState} />
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex h-24 w-48 items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-2)]">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagen servida por la ruta pública del logo
            <img src={logoSrc} alt="Logo del taller" className="max-h-20 max-w-44 object-contain" />
          ) : (
            <span className="text-sm text-[var(--muted)]">Sin logo</span>
          )}
        </div>
        {readOnly ? null : (
          <div className="flex flex-col gap-3">
            <form action={upload} className="flex flex-wrap items-center gap-3">
              <label className="text-sm">
                <span className="sr-only">Archivo del logo</span>
                <input type="file" name="logo" accept="image/png,image/jpeg,image/webp" required className="text-sm" />
              </label>
              <SubmitButton variant="secondary" pendingLabel="Subiendo…">
                Subir logo
              </SubmitButton>
            </form>
            {logoSrc ? (
              <form action={remove}>
                <SubmitButton variant="ghost" pendingLabel="Eliminando…">
                  Quitar logo
                </SubmitButton>
              </form>
            ) : null}
            <p className="text-sm text-[var(--muted)]">PNG, JPG o WebP de hasta 1 MB. Mejor con fondo transparente o blanco.</p>
          </div>
        )}
      </div>
    </Card>
  );
}
