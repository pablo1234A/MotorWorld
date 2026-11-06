import type { Metadata } from "next";
import Link from "next/link";

import { buttonClass } from "@/components/ui/button-styles";
import { Alert } from "@/components/ui/feedback";
import { Pagination } from "@/components/ui/pagination";
import { formatDate, formatDateTime } from "@/lib/dates";
import { PAGE_SIZE, param, parsePage } from "@/lib/pagination";
import { APPOINTMENT_SOURCE_LABELS, APPOINTMENT_STATUS_LABELS, isAppointmentFilter } from "@/lib/validation/appointments";
import { can, isAdmin } from "@/server/auth/context";
import { requireOrgPage } from "@/server/auth/guards";
import { listAppointments, pendingRequestsCount } from "@/server/modules/appointments/service";

export const metadata: Metadata = { title: "Citas · RevisaYa" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const BADGE = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";
const TONE: Record<string, string> = {
  requested: "bg-[var(--warning-soft)] text-[var(--foreground)]",
  confirmed: "bg-[var(--success-soft)] text-[var(--success-strong)]",
  completed: "bg-[var(--surface-2)] text-[var(--foreground)]",
  rejected: "bg-[var(--danger-soft)] text-[var(--danger-strong)]",
  canceled: "bg-[var(--surface-2)] text-[var(--muted)]",
  no_show: "bg-[var(--danger-soft)] text-[var(--danger-strong)]",
};

export default async function AppointmentsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireOrgPage("/app/citas");
  if (!can(ctx, "appointments.manage")) {
    return <Alert tone="error" title="Sin permiso">No tienes permiso para gestionar citas. Pídeselo a un administrador del taller.</Alert>;
  }
  const sp = await searchParams;
  const estado = param(sp.estado, 20);
  const pending = await pendingRequestsCount(ctx);
  const filter = isAppointmentFilter(estado) ? estado : estado === "todas" ? undefined : pending ? "solicitudes" : "proximas";
  const q = param(sp.q);
  const page = parsePage(param(sp.pagina));
  const result = await listAppointments(ctx, { filter, q, page, pageSize: PAGE_SIZE });

  const tabs: Array<[string, string]> = [
    ["solicitudes", `Solicitudes${pending ? ` (${pending})` : ""}`],
    ["proximas", "Próximas"],
    ["historial", "Historial"],
    ["todas", "Todas"],
  ];
  const current = filter ?? "todas";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Citas</h1>
          <p className="text-sm text-[var(--muted)]">Solicitudes de tus clientes y citas confirmadas. Una solicitud no es una cita hasta que la confirmas.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin(ctx) ? (
            <Link href="/app/configuracion/citas" className={buttonClass("ghost")}>
              Configurar
            </Link>
          ) : null}
          {ctx.subscription.active ? (
            <Link href="/app/citas/nueva" className={buttonClass("primary")}>
              Nueva cita
            </Link>
          ) : null}
        </div>
      </div>

      <nav aria-label="Estado" className="flex flex-wrap gap-1">
        {tabs.map(([key, label]) => (
          <Link
            key={key}
            href={`/app/citas?estado=${key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            aria-current={current === key ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm ${current === key ? "bg-[var(--surface-2)] font-semibold" : "hover:bg-[var(--surface-2)]"}`}
          >
            {label}
          </Link>
        ))}
        <form method="get" className="ml-auto flex gap-2">
          <input type="hidden" name="estado" value={current} />
          <input name="q" type="search" aria-label="Buscar" defaultValue={q} placeholder="Cliente o matrícula" className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm" />
        </form>
      </nav>

      {result.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-10 text-center">
          <p className="font-medium">{current === "solicitudes" ? "No hay solicitudes pendientes." : current === "proximas" ? "No hay citas próximas." : "No hay citas."}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Las solicitudes llegan desde el botón «Pedir cita» de los avisos y desde tu enlace de citas.</p>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          {result.rows.map((a) => {
            const when = a.confirmedStart
              ? formatDateTime(a.confirmedStart, a.timezone)
              : a.requestedStart
                ? `Pide: ${formatDateTime(a.requestedStart, a.timezone)}`
                : a.requestedDate
                  ? `Pide: ${formatDate(a.requestedDate)}`
                  : "Sin fecha";
            return (
              <li key={a.id}>
                <Link href={`/app/citas/${a.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--surface-2)]">
                  <span className="flex flex-col">
                    <span className="font-medium">{a.requesterName}</span>
                    <span className="text-xs text-[var(--muted)]">
                      {[a.plate, a.vehicleName, APPOINTMENT_SOURCE_LABELS[a.source]].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-sm tabular-nums">{when}</span>
                    <span className={`${BADGE} ${TONE[a.status] ?? ""}`}>{APPOINTMENT_STATUS_LABELS[a.status] ?? a.status}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination page={result} basePath="/app/citas" params={{ estado: current, q }} />
    </div>
  );
}
