"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/button";
import { Field, SelectField } from "@/components/ui/field";
import { fieldErrors, FormMessage, sentValue } from "@/components/ui/form-state";
import { VEHICLE_STATUS_LABELS, VEHICLE_STATUSES } from "@/lib/validation/workshop";
import type { ActionState } from "@/server/actions/result";
import {
  changeOwnerAction,
  createVehicleAction,
  deleteVehicleAction,
  recordMileageAction,
  setNextServiceAction,
  updateVehicleAction,
} from "@/server/modules/workshop/actions";

import { CustomerPicker } from "./customer-picker";

const idle: ActionState = { status: "idle" };

export function CreateVehicleForm({ customerId, canRecordService }: { customerId: string; canRecordService: boolean }) {
  const [state, action] = useActionState(createVehicleAction, idle);
  const v = (n: string) => sentValue(state, n);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="customerId" value={customerId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Matrícula" name="plate" required defaultValue={v("plate")} errors={fieldErrors(state, "plate")} placeholder="1234 BCD" autoCapitalize="characters" />
        <Field label="Bastidor (VIN)" name="vin" defaultValue={v("vin")} errors={fieldErrors(state, "vin")} hint="Opcional. 17 caracteres." autoCapitalize="characters" />
        <Field label="Marca" name="make" defaultValue={v("make")} errors={fieldErrors(state, "make")} placeholder="Seat" />
        <Field label="Modelo" name="model" defaultValue={v("model")} errors={fieldErrors(state, "model")} placeholder="Ibiza" />
        <Field label="Kilómetros actuales" name="currentKm" type="number" inputMode="numeric" min={0} defaultValue={v("currentKm")} errors={fieldErrors(state, "currentKm")} />
      </div>
      {canRecordService ? (
        <fieldset className="flex flex-col gap-4 rounded-lg border border-[var(--border)] p-4">
          <legend className="px-1 text-sm font-medium">Última revisión (opcional)</legend>
          <p className="text-sm text-[var(--muted)]">Se guarda en el historial y sirve para calcular cuándo toca la próxima.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Fecha" name="lastServiceDate" type="date" defaultValue={v("lastServiceDate")} errors={fieldErrors(state, "lastServiceDate")} />
            <Field label="Kilómetros" name="lastServiceKm" type="number" inputMode="numeric" min={0} defaultValue={v("lastServiceKm")} errors={fieldErrors(state, "lastServiceKm")} />
            <Field
              label="Próxima revisión"
              name="nextServiceDate"
              type="date"
              defaultValue={v("nextServiceDate")}
              errors={fieldErrors(state, "nextServiceDate")}
              hint="Si la dejas vacía, se calcula con el intervalo del taller."
            />
          </div>
        </fieldset>
      ) : null}
      <div>
        <SubmitButton pendingLabel="Guardando…">Dar de alta el vehículo</SubmitButton>
      </div>
    </form>
  );
}

export function EditVehicleForm({
  vehicle,
}: {
  vehicle: { id: string; plate: string; make: string | null; model: string | null; vin: string | null; status: string };
}) {
  const [state, action] = useActionState(updateVehicleAction, idle);
  const v = (n: string, f: string | null) => sentValue(state, n) ?? f ?? "";
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="id" value={vehicle.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Matrícula" name="plate" defaultValue={v("plate", vehicle.plate)} errors={fieldErrors(state, "plate")} />
        <Field label="Bastidor (VIN)" name="vin" defaultValue={v("vin", vehicle.vin)} errors={fieldErrors(state, "vin")} />
        <Field label="Marca" name="make" defaultValue={v("make", vehicle.make)} errors={fieldErrors(state, "make")} />
        <Field label="Modelo" name="model" defaultValue={v("model", vehicle.model)} errors={fieldErrors(state, "model")} />
        <SelectField
          label="Estado"
          name="status"
          defaultValue={v("status", vehicle.status)}
          errors={fieldErrors(state, "status")}
          hint="Solo los vehículos activos reciben avisos y cuentan para el límite del plan."
        >
          {VEHICLE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {VEHICLE_STATUS_LABELS[s]}
            </option>
          ))}
        </SelectField>
      </div>
      <div>
        <SubmitButton>Guardar cambios</SubmitButton>
      </div>
    </form>
  );
}

export function MileageForm({ id, today }: { id: string; today: string }) {
  const [state, action] = useActionState(recordMileageAction, idle);
  const lower = state.status === "error" && state.message.includes("menores que los actuales");
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Kilómetros" name="km" type="number" inputMode="numeric" min={0} required defaultValue={sentValue(state, "km")} errors={fieldErrors(state, "km")} />
        <Field label="Fecha de la lectura" name="readOn" type="date" max={today} defaultValue={sentValue(state, "readOn") ?? today} errors={fieldErrors(state, "readOn")} />
      </div>
      {lower ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirmLower" className="mt-0.5" />
          Confirmo que el cuentakilómetros se ha cambiado o la lectura anterior era errónea
        </label>
      ) : null}
      <div>
        <SubmitButton variant="secondary">Actualizar kilómetros</SubmitButton>
      </div>
    </form>
  );
}

export function NextServiceForm({ id, date, km }: { id: string; date: string | null; km: number | null }) {
  const [state, action] = useActionState(setNextServiceAction, idle);
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Fecha" name="nextServiceDate" type="date" defaultValue={sentValue(state, "nextServiceDate") ?? date ?? ""} errors={fieldErrors(state, "nextServiceDate")} />
        <Field label="Kilómetros" name="nextServiceKm" type="number" inputMode="numeric" min={0} defaultValue={sentValue(state, "nextServiceKm") ?? (km ?? "")} errors={fieldErrors(state, "nextServiceKm")} />
      </div>
      <p className="text-sm text-[var(--muted)]">Se mantiene hasta que se registre otra revisión, que volverá a calcularla.</p>
      <div>
        <SubmitButton variant="secondary">Guardar próxima revisión</SubmitButton>
      </div>
    </form>
  );
}

export function ChangeOwnerForm({ id, branchId, currentCustomerId }: { id: string; branchId: string; currentCustomerId: string }) {
  const [state, action] = useActionState(changeOwnerAction, idle);
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <CustomerPicker name="customerId" branchId={branchId} excludeId={currentCustomerId} label="Nuevo propietario" />
      <div>
        <SubmitButton variant="secondary">Cambiar propietario</SubmitButton>
      </div>
    </form>
  );
}

export function DeleteVehicleForm({ id, plate }: { id: string; plate: string }) {
  const [state, action] = useActionState(deleteVehicleAction, idle);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(`¿Borrar el vehículo ${plate}? Dejará de recibir avisos. El historial se conserva.`)) e.preventDefault();
      }}
      className="flex flex-col gap-3"
    >
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <div>
        <SubmitButton variant="danger" pendingLabel="Borrando…">
          Borrar vehículo
        </SubmitButton>
      </div>
    </form>
  );
}
