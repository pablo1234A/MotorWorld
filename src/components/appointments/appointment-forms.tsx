"use client";

import { useActionState, useState } from "react";

import { SubmitButton } from "@/components/ui/button";
import { Field, SelectField } from "@/components/ui/field";
import { Card } from "@/components/ui/feedback";
import { fieldErrors, FormMessage, sentValue } from "@/components/ui/form-state";
import { WEEKDAY_LABELS } from "@/lib/validation/reminders";
import type { ActionState } from "@/server/actions/result";
import {
  addAvailabilityRuleAction,
  cancelAppointmentAction,
  completeAppointmentAction,
  confirmAppointmentAction,
  createManualAppointmentAction,
  linkAppointmentCustomerAction,
  rejectAppointmentAction,
  removeAvailabilityRuleAction,
  saveAppointmentNotesAction,
  updateBookingSettingsAction,
} from "@/server/modules/appointments/actions";

const idle: ActionState = { status: "idle" };
const TEXTAREA =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[15px] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)]";

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240, 480];
const durationLabel = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`);

/** Confirmar una solicitud o cambiar la fecha de una cita confirmada. */
export function ConfirmForm({
  id,
  mode,
  date,
  time,
  duration,
  hasEmail,
}: {
  id: string;
  mode: "confirm" | "reschedule";
  date: string;
  time: string;
  duration: number;
  hasEmail: boolean;
}) {
  const [state, action] = useActionState(confirmAppointmentAction, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Día" name="date" type="date" required defaultValue={sentValue(state, "date") ?? date} errors={fieldErrors(state, "date")} />
        <Field label="Hora" name="time" type="time" required defaultValue={sentValue(state, "time") ?? time} errors={fieldErrors(state, "time")} />
        <SelectField label="Duración" name="durationMinutes" defaultValue={sentValue(state, "durationMinutes") ?? String(duration)}>
          {DURATIONS.map((m) => (
            <option key={m} value={m}>
              {durationLabel(m)}
            </option>
          ))}
        </SelectField>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="notify" defaultChecked={hasEmail} disabled={!hasEmail} className="size-4" />
        {hasEmail ? "Avisar al cliente por correo (con la cita para su calendario)" : "El cliente no tiene correo: avísale por teléfono"}
      </label>
      <div>
        <SubmitButton pendingLabel="Guardando…">{mode === "confirm" ? "Confirmar cita" : "Cambiar fecha"}</SubmitButton>
      </div>
    </form>
  );
}

/** Rechazar (solicitud) o cancelar (solicitud o cita), con mensaje opcional al cliente. */
export function DecisionForm({ id, kind, hasEmail }: { id: string; kind: "reject" | "cancel"; hasEmail: boolean }) {
  const [state, action] = useActionState(kind === "reject" ? rejectAppointmentAction : cancelAppointmentAction, idle);
  const [open, setOpen] = useState(false);
  const label = kind === "reject" ? "Rechazar la solicitud" : "Cancelar la cita";
  if (!open && state.status !== "error") {
    return (
      <button type="button" onClick={() => setOpen(true)} className="self-start text-sm font-medium text-[var(--danger)] hover:underline">
        {label}…
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-[var(--border)] p-4">
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`msg-${kind}`} className="text-sm font-medium">
          Mensaje para el cliente (opcional)
        </label>
        <textarea id={`msg-${kind}`} name="message" rows={2} maxLength={1000} className={TEXTAREA} placeholder={kind === "reject" ? "Ese día estamos completos; ¿te viene bien el jueves?" : ""} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="notify" defaultChecked={hasEmail} disabled={!hasEmail} className="size-4" />
        {hasEmail ? "Avisar al cliente por correo" : "El cliente no tiene correo: avísale por teléfono"}
      </label>
      <div className="flex gap-3">
        <SubmitButton variant="danger" pendingLabel="Guardando…">
          {label}
        </SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="text-sm">
          Volver
        </button>
      </div>
    </form>
  );
}

export function OutcomeButtons({ id }: { id: string }) {
  const [state, action] = useActionState(completeAppointmentAction, idle);
  return (
    <form action={action} className="flex flex-col gap-2">
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap gap-3">
        <SubmitButton name="outcome" value="completed" variant="secondary" pendingLabel="Guardando…">
          Marcar como realizada
        </SubmitButton>
        <SubmitButton name="outcome" value="no_show" variant="ghost" pendingLabel="Guardando…">
          No se presentó
        </SubmitButton>
      </div>
    </form>
  );
}

export function LinkCustomerForm({ id, suggested }: { id: string; suggested: { id: string; name: string } | null }) {
  const [state, action] = useActionState(linkAppointmentCustomerAction, idle);
  return (
    <form action={action} className="flex flex-col gap-2">
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <p className="text-sm text-[var(--muted)]">Esta solicitud no está vinculada a ninguna ficha.</p>
      <div className="flex flex-wrap gap-3">
        {suggested ? (
          <SubmitButton name="customerId" value={suggested.id} variant="secondary" pendingLabel="Vinculando…">
            Vincular a {suggested.name}
          </SubmitButton>
        ) : null}
        <SubmitButton name="customerId" value="" variant={suggested ? "ghost" : "secondary"} pendingLabel="Creando…">
          Crear ficha con estos datos
        </SubmitButton>
      </div>
    </form>
  );
}

export function NotesForm({ id, notes }: { id: string; notes: string | null }) {
  const [state, action] = useActionState(saveAppointmentNotesAction, idle);
  return (
    <form action={action} className="flex flex-col gap-2">
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <label htmlFor="notes" className="text-sm font-medium">
        Notas internas
      </label>
      <textarea id="notes" name="notes" rows={3} maxLength={5000} defaultValue={notes ?? ""} className={TEXTAREA} />
      <div>
        <SubmitButton variant="secondary">Guardar notas</SubmitButton>
      </div>
    </form>
  );
}

export function ManualAppointmentForm({
  customerId,
  vehicles,
  defaultVehicleId,
  date,
  duration,
  hasEmail,
}: {
  customerId: string;
  vehicles: Array<{ id: string; label: string }>;
  defaultVehicleId: string | null;
  date: string;
  duration: number;
  hasEmail: boolean;
}) {
  const [state, action] = useActionState(createManualAppointmentAction, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <input type="hidden" name="customerId" value={customerId} />
      <SelectField label="Vehículo" name="vehicleId" defaultValue={defaultVehicleId ?? vehicles[0]?.id ?? ""}>
        <option value="">Sin vehículo</option>
        {vehicles.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label}
          </option>
        ))}
      </SelectField>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Día" name="date" type="date" required defaultValue={sentValue(state, "date") ?? date} errors={fieldErrors(state, "date")} />
        <Field label="Hora" name="time" type="time" required defaultValue={sentValue(state, "time") ?? "09:00"} errors={fieldErrors(state, "time")} />
        <SelectField label="Duración" name="durationMinutes" defaultValue={String(duration)}>
          {DURATIONS.map((m) => (
            <option key={m} value={m}>
              {durationLabel(m)}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="notes-new" className="text-sm font-medium">
          Notas internas (opcional)
        </label>
        <textarea id="notes-new" name="notes" rows={2} maxLength={5000} className={TEXTAREA} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="notify" defaultChecked={hasEmail} disabled={!hasEmail} className="size-4" />
        {hasEmail ? "Enviar la confirmación al cliente por correo" : "El cliente no tiene correo"}
      </label>
      <div>
        <SubmitButton pendingLabel="Creando…">Crear cita</SubmitButton>
      </div>
    </form>
  );
}

// ------------------------------------------------------------ configuración

export function BookingSettingsForm({
  branchId,
  values,
  readOnly,
}: {
  branchId: string;
  values: { bookingEnabled: boolean; bookingMode: "free_request" | "slots"; slotMinutes: number; bookingNoticeHours: number };
  readOnly: boolean;
}) {
  const [state, action] = useActionState(updateBookingSettingsAction, idle);
  const [mode, setMode] = useState(values.bookingMode);
  return (
    <Card>
      <form action={action} className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Página para pedir cita</h2>
        <FormMessage state={state} />
        <input type="hidden" name="branchId" value={branchId} />
        <label className="flex items-start gap-3 text-[15px]">
          <input type="checkbox" name="bookingEnabled" defaultChecked={values.bookingEnabled} disabled={readOnly} className="mt-1 size-4" />
          <span>
            <span className="font-medium">Aceptar solicitudes de cita en línea</span>
            <span className="block text-sm text-[var(--muted)]">El botón «Pedir cita» de los avisos lleva a esta página. Si la desactivas, abre un correo a la empresa.</span>
          </span>
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Cómo se pide la cita</legend>
          <label className="flex items-start gap-3 text-sm">
            <input type="radio" name="bookingMode" value="free_request" checked={mode === "free_request"} onChange={() => setMode("free_request")} disabled={readOnly} className="mt-1" />
            <span>
              <span className="font-medium">El cliente propone un día</span> y la empresa le confirma la hora.
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input type="radio" name="bookingMode" value="slots" checked={mode === "slots"} onChange={() => setMode("slots")} disabled={readOnly} className="mt-1" />
            <span>
              <span className="font-medium">El cliente elige un hueco libre</span> de tu horario (abajo). Sigue siendo una solicitud hasta que la confirmas.
            </span>
          </label>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Duración de cada hueco" name="slotMinutes" defaultValue={String(values.slotMinutes)} disabled={readOnly}>
            {[15, 30, 45, 60, 90, 120].map((m) => (
              <option key={m} value={m}>
                {durationLabel(m)}
              </option>
            ))}
          </SelectField>
          <Field
            label="Antelación mínima (horas)"
            name="bookingNoticeHours"
            type="number"
            min={0}
            max={336}
            defaultValue={sentValue(state, "bookingNoticeHours") ?? String(values.bookingNoticeHours)}
            errors={fieldErrors(state, "bookingNoticeHours")}
            hint="No se ofrecen huecos antes de este plazo."
            disabled={readOnly}
          />
        </div>
        {readOnly ? null : (
          <div>
            <SubmitButton>Guardar</SubmitButton>
          </div>
        )}
      </form>
    </Card>
  );
}

export function AvailabilityRules({
  branchId,
  rules,
  readOnly,
}: {
  branchId: string;
  rules: Array<{ id: string; weekday: number; startTime: string; endTime: string; capacity: number }>;
  readOnly: boolean;
}) {
  const [state, action] = useActionState(addAvailabilityRuleAction, idle);
  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Horario para citas</h2>
        <p className="text-sm text-[var(--muted)]">
          Solo se usa si el cliente elige un hueco. Puedes poner varias franjas el mismo día (mañana y tarde). Los festivos y días de cierre de
          Avisos tampoco se ofrecen.
        </p>
      </div>
      {rules.length ? (
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          {rules.map((r) => (
            <RuleItem key={r.id} rule={r} readOnly={readOnly} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--muted)]">Todavía no hay franjas: el cliente no verá huecos libres.</p>
      )}
      {readOnly ? null : (
        <form action={action} className="flex flex-col gap-3">
          <FormMessage state={state} />
          <input type="hidden" name="branchId" value={branchId} />
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-end">
            <SelectField label="Día" name="weekday" defaultValue="1">
              {WEEKDAY_LABELS.map((d, i) => (
                <option key={d} value={i + 1}>
                  {d}
                </option>
              ))}
            </SelectField>
            <Field label="Desde" name="startTime" type="time" defaultValue="09:00" required errors={fieldErrors(state, "startTime")} />
            <Field label="Hasta" name="endTime" type="time" defaultValue="13:00" required errors={fieldErrors(state, "endTime")} />
            <Field label="Coches a la vez" name="capacity" type="number" min={1} max={50} defaultValue="1" required errors={fieldErrors(state, "capacity")} />
            <SubmitButton variant="secondary" pendingLabel="Añadiendo…">
              Añadir franja
            </SubmitButton>
          </div>
        </form>
      )}
    </Card>
  );
}

function RuleItem({ rule, readOnly }: { rule: { id: string; weekday: number; startTime: string; endTime: string; capacity: number }; readOnly: boolean }) {
  const [state, action] = useActionState(removeAvailabilityRuleAction, idle);
  const label = `${WEEKDAY_LABELS[rule.weekday - 1]} de ${rule.startTime} a ${rule.endTime}`;
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <span>
        <span className="font-medium">{label}</span>
        <span className="text-[var(--muted)]"> · {rule.capacity} {rule.capacity === 1 ? "coche" : "coches"} a la vez</span>
      </span>
      {readOnly ? null : (
        <form action={action} className="flex items-center gap-2">
          <input type="hidden" name="id" value={rule.id} />
          {state.status === "error" ? <span className="text-[var(--danger)]">{state.message}</span> : null}
          <SubmitButton variant="ghost" pendingLabel="Quitando…" aria-label={`Quitar ${label}`}>
            Quitar
          </SubmitButton>
        </form>
      )}
    </li>
  );
}
