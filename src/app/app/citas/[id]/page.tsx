import type { Metadata } from "next";
import Link from "next/link";

import { SERVICE_TYPE_LABELS } from "@/lib/pci/labels";
import { notFound } from "next/navigation";

import { ConfirmForm, DecisionForm, LinkCustomerForm, NotesForm, OutcomeButtons } from "@/components/appointments/appointment-forms";
import { Alert, Card } from "@/components/ui/feedback";
import { formatDate, formatDateTime, localParts } from "@/lib/dates";
import { param } from "@/lib/pagination";
import { formatPhone } from "@/lib/phone";
import { APPOINTMENT_SOURCE_LABELS, APPOINTMENT_STATUS_LABELS } from "@/lib/validation/appointments";
import { can } from "@/server/auth/context";
import { requireOrgPage } from "@/server/auth/guards";
import { NOTIFY_MESSAGES } from "@/server/modules/appointments/notify";
import { getAppointment } from "@/server/modules/appointments/service";

const OK_MESSAGES: Record<string, string> = {
  confirmed: "Cita confirmada.",
  rescheduled: "Cita cambiada de fecha.",
  rejected: "Solicitud rechazada.",
  canceled: "Cita cancelada.",
  completed: "Cita marcada como realizada.",
  no_show: "Marcada como «no se presentó».",
  linked_new: "Ficha de cliente creada con los datos de la solicitud.",
  linked_existing: "Solicitud vinculada a la ficha del cliente.",
};

export const metadata: Metadata = { title: "Cita · RevisaYa" };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AppointmentPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const ctx = await requireOrgPage(`/app/citas/${id}`);
  if (!can(ctx, "appointments.manage")) {
    return <Alert tone="error" title="Sin permiso">No tienes permiso para gestionar citas.</Alert>;
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const a = await getAppointment(ctx, id);
  if (!a) notFound();
  const tz = a.timezone;
  const writable = ctx.subscription.active;
  const hasEmail = Boolean(a.requesterEmail);
  const ok = param(sp.ok, 30);
  const aviso = param(sp.aviso, 30);
  const okMessage =
    ok && Object.hasOwn(OK_MESSAGES, ok)
      ? `${OK_MESSAGES[ok]}${aviso && Object.hasOwn(NOTIFY_MESSAGES, aviso) ? ` ${NOTIFY_MESSAGES[aviso as keyof typeof NOTIFY_MESSAGES]}` : ""}`
      : null;

  const base = a.confirmedStart ?? a.requestedStart;
  const def = base ? localParts(base, tz) : { date: a.requestedDate ?? localParts(new Date(), tz).date, time: "09:00" };
  const duration = a.confirmedStart && a.confirmedEnd ? Math.round((a.confirmedEnd.getTime() - a.confirmedStart.getTime()) / 60000) : a.slotMinutes;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/app/citas" className="text-sm text-[var(--accent)]">
          ← Citas
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{a.requesterName}</h1>
        <p className="text-sm text-[var(--muted)]">
          {APPOINTMENT_STATUS_LABELS[a.status]} · {APPOINTMENT_SOURCE_LABELS[a.source]} · recibida el {formatDateTime(a.createdAt, tz)}
          {a.branchName ? ` · ${a.branchName}` : ""}
        </p>
      </div>
      {param(sp.creada) ? <Alert tone="success">Cita creada.</Alert> : null}
      {okMessage ? <Alert tone="success">{okMessage}</Alert> : null}
      {a.status === "requested" ? (
        <Alert tone="warning" title="Solicitud pendiente">
          El cliente todavía no tiene cita. Confírmala (puedes cambiar el día y la hora) o recházala.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{a.status === "requested" ? "Lo que pide" : "Cita"}</h2>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {a.confirmedStart ? (
                <div>
                  <dt className="text-[var(--muted)]">Día y hora</dt>
                  <dd className="font-medium">
                    {formatDateTime(a.confirmedStart, tz)} – {a.confirmedEnd ? localParts(a.confirmedEnd, tz).time : ""}
                  </dd>
                </div>
              ) : null}
              {a.requestedStart || a.requestedDate ? (
                <div>
                  <dt className="text-[var(--muted)]">Fecha pedida</dt>
                  <dd className="font-medium">{a.requestedStart ? formatDateTime(a.requestedStart, tz) : formatDate(a.requestedDate)}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-[var(--muted)]">Servicio</dt>
                <dd className="font-medium">{a.serviceType ? (SERVICE_TYPE_LABELS[a.serviceType as keyof typeof SERVICE_TYPE_LABELS] ?? a.serviceType) : "Sin indicar"}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Instalación</dt>
                <dd className="font-medium">
                  {a.installationId ? (
                    <>
                      <Link href={`/app/instalaciones/${a.installationId}`} className="text-[var(--accent)]">
                        {a.installationName}
                      </Link>
                      {can(ctx, "work_orders.manage") ? (
                        <Link href={`/app/ordenes-trabajo/nueva?instalacion=${a.installationId}`} className="ml-2 text-xs font-normal text-[var(--accent)] underline">
                          Crear orden de trabajo
                        </Link>
                      ) : null}
                    </>
                  ) : (
                    (a.requesterAddress ?? "Sin indicar")
                  )}
                  {a.installationId && a.requesterAddress ? <span className="block text-xs font-normal text-[var(--muted)]">{a.requesterAddress}</span> : null}
                </dd>
              </div>
              {a.vehicleId || a.plate ? (
                <div>
                  <dt className="text-[var(--muted)]">Vehículo (etapa anterior)</dt>
                  <dd className="font-medium">
                    {a.vehicleId ? (
                      <Link href={`/app/vehiculos/${a.vehicleId}`} className="text-[var(--accent)]">
                        {[a.plate, a.vehicleName].filter(Boolean).join(" · ")}
                      </Link>
                    ) : (
                      a.plate
                    )}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-[var(--muted)]">Contacto</dt>
                <dd className="font-medium break-all">{[a.requesterEmail, a.requesterPhone ? formatPhone(a.requesterPhone) : null].filter(Boolean).join(" · ") || "—"}</dd>
              </div>
              {a.customerId ? (
                <div>
                  <dt className="text-[var(--muted)]">Ficha del cliente</dt>
                  <dd>
                    <Link href={`/app/clientes/${a.customerId}`} className="font-medium text-[var(--accent)]">
                      {a.customerName}
                    </Link>
                  </dd>
                </div>
              ) : null}
            </dl>
            {a.customerMessage ? <p className="rounded-lg bg-[var(--surface-2)] px-4 py-3 text-sm whitespace-pre-line">{a.customerMessage}</p> : null}
            {!a.customerId && writable ? <LinkCustomerForm id={a.id} suggested={a.suggestedCustomer} /> : null}
          </Card>

          {writable && (a.status === "requested" || a.status === "confirmed") ? (
            <Card className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold">{a.status === "requested" ? "Confirmar la cita" : "Cambiar la fecha"}</h2>
              <ConfirmForm id={a.id} mode={a.status === "requested" ? "confirm" : "reschedule"} date={def.date} time={def.time} duration={duration} hasEmail={hasEmail} />
              {a.status === "confirmed" ? <OutcomeButtons id={a.id} /> : null}
              <DecisionForm id={a.id} kind={a.status === "requested" ? "reject" : "cancel"} hasEmail={hasEmail} />
              {a.status === "requested" ? <DecisionForm id={a.id} kind="cancel" hasEmail={hasEmail} /> : null}
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          <Card>{writable ? <NotesForm id={a.id} notes={a.internalNotes} /> : <p className="text-sm whitespace-pre-line">{a.internalNotes ?? "Sin notas."}</p>}</Card>
          <Card className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Historial</h2>
            <ol className="flex flex-col gap-2 text-sm">
              {a.events.map((e, i) => (
                <li key={i}>
                  <span className="font-medium">{APPOINTMENT_STATUS_LABELS[e.toStatus] ?? e.toStatus}</span>
                  {e.newStart && e.toStatus === "confirmed" ? ` · ${formatDateTime(e.newStart, tz)}` : ""}
                  <span className="block text-xs text-[var(--muted)]">
                    {formatDateTime(e.createdAt, tz)}
                    {e.actor ? ` · ${e.actor}` : e.fromStatus === null ? " · cliente o sistema" : ""}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
