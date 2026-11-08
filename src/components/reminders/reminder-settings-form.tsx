"use client";

import Link from "next/link";
import { useActionState, useId } from "react";

import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Alert, Card } from "@/components/ui/feedback";
import { fieldErrors, FormMessage, sentValue } from "@/components/ui/form-state";
import { formatDate } from "@/lib/dates";
import { WEEKDAY_LABELS } from "@/lib/validation/reminders";
import type { ActionState } from "@/server/actions/result";
import { addBlackoutAction, removeBlackoutAction, updateReminderSettingsAction } from "@/server/modules/reminders/actions";

const idle: ActionState = { status: "idle" };

export interface ReminderSettingsValues {
  branchId: string;
  remindersEnabled: boolean;
  offsetsDays: number[];
  sendWindowStart: string;
  sendWindowEnd: string;
  sendWeekdays: number[];
  defaultIntervalMonths: number;
  defaultIntervalKm: number;
  kmRemindersEnabled: boolean;
  kmOffsetBefore: number;
  replyToEmail: string | null;
  timezone: string;
  kmFeature: boolean;
}

export function ReminderSettingsForm({ values, readOnly }: { values: ReminderSettingsValues; readOnly: boolean }) {
  const [state, action] = useActionState(updateReminderSettingsAction, idle);
  const v = (name: string, fallback: string) => sentValue(state, name) ?? fallback;
  const uid = useId();

  return (
    <form action={action} className="flex flex-col gap-6" aria-describedby={`help-${uid}`}>
      <input type="hidden" name="branchId" value={values.branchId} />
      <FormMessage state={state} />

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Avisos de vencimiento por correo</h2>
        <label className="flex items-start gap-3 text-[15px]">
          <input type="checkbox" name="remindersEnabled" defaultChecked={values.remindersEnabled} disabled={readOnly} className="mt-1 size-4" />
          <span>
            <span className="font-medium">Enviar avisos automáticos a los clientes</span>
            <span id={`help-${uid}`} className="block text-sm text-[var(--muted)]">
              Cada día, RevisaYa avisa a los clientes cuya revisión se acerca. Solo a quienes tienen correo y no se han dado de baja.
            </span>
          </span>
        </label>
        <Field
          label="Días de antelación"
          name="offsets"
          defaultValue={v("offsets", values.offsetsDays.join(", "))}
          errors={fieldErrors(state, "offsets")}
          hint="Separados por comas. Por ejemplo, «30, 7» envía un aviso 30 días antes y otro 7 días antes. Hasta 5 avisos."
          disabled={readOnly}
          inputMode="numeric"
        />
        <Field
          label="Responder a"
          name="replyToEmail"
          type="email"
          defaultValue={v("replyToEmail", values.replyToEmail ?? "")}
          errors={fieldErrors(state, "replyToEmail")}
          hint="Dirección de la empresa a la que llegan las respuestas de los clientes. Sin ella, el correo no lleva botón para pedir cita."
          disabled={readOnly}
        />
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Cuándo se envían</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Desde"
            name="sendWindowStart"
            type="time"
            defaultValue={v("sendWindowStart", values.sendWindowStart)}
            errors={fieldErrors(state, "sendWindowStart")}
            disabled={readOnly}
          />
          <Field
            label="Hasta"
            name="sendWindowEnd"
            type="time"
            defaultValue={v("sendWindowEnd", values.sendWindowEnd)}
            errors={fieldErrors(state, "sendWindowEnd")}
            disabled={readOnly}
          />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Días de envío</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {WEEKDAY_LABELS.map((label, i) => (
              <label key={label} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="weekdays[]"
                  value={i + 1}
                  defaultChecked={values.sendWeekdays.includes(i + 1)}
                  disabled={readOnly}
                  className="size-4"
                />
                {label}
              </label>
            ))}
          </div>
          {fieldErrors(state, "weekdays[]") ? <p className="text-sm text-[var(--danger)]">{fieldErrors(state, "weekdays[]")![0]}</p> : null}
        </fieldset>
        <p className="text-sm text-[var(--muted)]">
          Hora de {values.timezone.replace("_", " ")} (la zona horaria de la delegación). Si el día del aviso no es de envío o es festivo, se adelanta al
          último día hábil anterior.
        </p>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Vehículos (etapa anterior): intervalo de revisión por defecto</h2>
        <p className="text-sm text-[var(--muted)]">
          Se usa para calcular la próxima revisión cuando registras una sin indicar fecha ni kilómetros recomendados.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Cada (meses)"
            name="defaultIntervalMonths"
            type="number"
            min={1}
            max={60}
            defaultValue={v("defaultIntervalMonths", String(values.defaultIntervalMonths))}
            errors={fieldErrors(state, "defaultIntervalMonths")}
            disabled={readOnly}
          />
          <Field
            label="Cada (km)"
            name="defaultIntervalKm"
            type="number"
            min={1000}
            max={100000}
            step={500}
            defaultValue={v("defaultIntervalKm", String(values.defaultIntervalKm))}
            errors={fieldErrors(state, "defaultIntervalKm")}
            disabled={readOnly}
          />
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Avisos por kilometraje</h2>
        {values.kmFeature ? (
          <>
            <label className="flex items-start gap-3 text-[15px]">
              <input type="checkbox" name="kmRemindersEnabled" defaultChecked={values.kmRemindersEnabled} disabled={readOnly} className="mt-1 size-4" />
              <span>
                <span className="font-medium">Vehículos (etapa anterior): avisar también cuando el coche se acerque a los kilómetros de su revisión</span>
                <span className="block text-sm text-[var(--muted)]">
                  Se estima el ritmo de cada vehículo con sus lecturas de kilómetros (al menos dos, separadas un mes). Un aviso por revisión, y solo
                  si llega antes que el aviso por fecha.
                </span>
              </span>
            </label>
            <Field
              label="Avisar con antelación de (km)"
              name="kmOffsetBefore"
              type="number"
              min={0}
              max={10000}
              step={100}
              defaultValue={v("kmOffsetBefore", String(values.kmOffsetBefore))}
              errors={fieldErrors(state, "kmOffsetBefore")}
              disabled={readOnly}
            />
          </>
        ) : (
          <>
            <input type="hidden" name="kmOffsetBefore" value={values.kmOffsetBefore} />
            <Alert tone="info">
              Los avisos por kilometraje están incluidos desde el plan Max. Tu plan actual solo envía avisos por fecha.
            </Alert>
          </>
        )}
      </Card>

      {readOnly ? null : (
        <div>
          <SubmitButton>Guardar configuración</SubmitButton>
        </div>
      )}
    </form>
  );
}

export function BlackoutManager({
  branchId,
  blackouts,
  readOnly,
  today,
}: {
  branchId: string;
  blackouts: Array<{ day: string; reason: string | null }>;
  readOnly: boolean;
  today: string;
}) {
  const [state, action] = useActionState(addBlackoutAction, idle);
  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Festivos y días de cierre</h2>
        <p className="text-sm text-[var(--muted)]">Esos días no se envían avisos: los que tocaban se adelantan al día hábil anterior.</p>
      </div>
      {blackouts.length ? (
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          {blackouts.map((b) => (
            <BlackoutItem key={b.day} branchId={branchId} day={b.day} reason={b.reason} readOnly={readOnly} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--muted)]">No hay días sin envíos programados.</p>
      )}
      {readOnly ? null : (
        <form action={action} className="flex flex-col gap-3">
          <FormMessage state={state} />
          <input type="hidden" name="branchId" value={branchId} />
          <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
            <Field label="Día" name="day" type="date" min={today} required errors={fieldErrors(state, "day")} />
            <Field label="Motivo (opcional)" name="reason" maxLength={120} placeholder="Fiesta local" errors={fieldErrors(state, "reason")} />
            <SubmitButton variant="secondary" pendingLabel="Añadiendo…">
              Añadir día
            </SubmitButton>
          </div>
        </form>
      )}
    </Card>
  );
}

function BlackoutItem({ branchId, day, reason, readOnly }: { branchId: string; day: string; reason: string | null; readOnly: boolean }) {
  const [state, action] = useActionState(removeBlackoutAction, idle);
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <span>
        <span className="font-medium tabular-nums">{formatDate(day)}</span>
        {reason ? <span className="text-[var(--muted)]"> · {reason}</span> : null}
      </span>
      {readOnly ? null : (
        <form action={action} className="flex items-center gap-2">
          <input type="hidden" name="branchId" value={branchId} />
          <input type="hidden" name="day" value={day} />
          {state.status === "error" ? <span className="text-[var(--danger)]">{state.message}</span> : null}
          <SubmitButton variant="ghost" pendingLabel="Quitando…" aria-label={`Quitar ${formatDate(day)}`}>
            Quitar
          </SubmitButton>
        </form>
      )}
    </li>
  );
}

export function RemindersLink() {
  return (
    <Link href="/app/recordatorios" className="text-sm font-medium text-[var(--accent)]">
      Ver los avisos programados y enviados →
    </Link>
  );
}
