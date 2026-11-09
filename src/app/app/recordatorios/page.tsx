import type { Metadata } from "next";
import Link from "next/link";

import { CancelReminderButton } from "@/components/reminders/cancel-reminder-button";
import { buttonClass } from "@/components/ui/button-styles";
import { Alert } from "@/components/ui/feedback";
import { Pagination } from "@/components/ui/pagination";
import { formatDate, formatDateTime } from "@/lib/dates";
import { PAGE_SIZE, param, parsePage } from "@/lib/pagination";
import {
  isReminderFilter,
  REMINDER_FILTER_LABELS,
  REMINDER_FILTERS,
  REMINDER_STATUS_LABELS,
  SKIP_REASON_LABELS,
} from "@/lib/validation/reminders";
import { can, isAdmin } from "@/server/auth/context";
import { requireOrgPage } from "@/server/auth/guards";
import { listAccessibleBranches } from "@/server/modules/branches/service";
import {
  listReminders,
  reminderSummary,
} from "@/server/modules/reminders/service";

export const metadata: Metadata = { title: "Recordatorios · RevisaYa" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const BADGE =
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";
const TONE: Record<string, string> = {
  sent: "bg-[var(--success-soft)] text-[var(--success-strong)]",
  delivered: "bg-[var(--success-soft)] text-[var(--success-strong)]",
  failed: "bg-[var(--danger-soft)] text-[var(--danger-strong)]",
  bounced: "bg-[var(--danger-soft)] text-[var(--danger-strong)]",
  complained: "bg-[var(--danger-soft)] text-[var(--danger-strong)]",
  retrying: "bg-[var(--warning-soft)] text-[var(--foreground)]",
  scheduled: "bg-[var(--accent-soft)] text-[var(--foreground)]",
  processing: "bg-[var(--accent-soft)] text-[var(--foreground)]",
};

export default async function RemindersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ctx = await requireOrgPage("/app/recordatorios");
  if (!can(ctx, "reminders.read")) {
    return (
      <Alert tone="error" title="Sin permiso">
        No tienes permiso para ver los recordatorios. Pídeselo a un
        administrador de la empresa.
      </Alert>
    );
  }
  const sp = await searchParams;
  const estado = param(sp.estado, 20);
  const filter = isReminderFilter(estado) ? estado : undefined;
  const q = param(sp.q);
  const branchId = param(sp.taller, 40);
  const page = parsePage(param(sp.pagina));
  const admin = isAdmin(ctx);
  const canCancel = admin && ctx.subscription.active;

  const [result, summary, branches] = await Promise.all([
    listReminders(ctx, {
      filter,
      q,
      branchId:
        branchId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(branchId) ? branchId : undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    reminderSummary(ctx),
    listAccessibleBranches(ctx),
  ]);
  const tz = summary.timezone;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Avisos de vencimiento
          </h1>
          <p className="text-sm text-[var(--muted)]">
            Avisos de mantenimiento programados y enviados a tus clientes cuando
            se acercan los vencimientos de sus instalaciones.
          </p>
        </div>
        {admin ? (
          <Link
            href="/app/configuracion/avisos"
            className={buttonClass("secondary")}
          >
            Configurar avisos
          </Link>
        ) : null}
      </div>

      <dl className="grid gap-3 sm:grid-cols-4">
        {[
          ["Pendientes", summary.pending.toLocaleString("es-ES")],
          ["Enviados este mes", summary.sentThisMonth.toLocaleString("es-ES")],
          ["Con problemas (30 días)", summary.problems.toLocaleString("es-ES")],
          [
            "Correos usados este mes",
            summary.emailsLimit === null
              ? summary.emailsUsed.toLocaleString("es-ES")
              : `${summary.emailsUsed.toLocaleString("es-ES")} de ${summary.emailsLimit.toLocaleString("es-ES")}`,
          ],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
          >
            <dt className="text-sm text-[var(--muted)]">{label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <form
        method="get"
        className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-[1fr_auto_auto_auto]"
      >
        <input
          name="q"
          type="search"
          aria-label="Buscar"
          defaultValue={q}
          placeholder="Instalación o cliente"
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
        />
        <select
          name="estado"
          defaultValue={filter ?? ""}
          aria-label="Estado"
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-sm"
        >
          <option value="">Todos los estados</option>
          {(
            Object.keys(REMINDER_FILTERS) as Array<
              keyof typeof REMINDER_FILTERS
            >
          ).map((k) => (
            <option key={k} value={k}>
              {REMINDER_FILTER_LABELS[k]}
            </option>
          ))}
        </select>
        {branches.length > 1 ? (
          <select
            name="taller"
            defaultValue={branchId ?? ""}
            aria-label="Delegación"
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-sm"
          >
            <option value="">Todas las delegaciones</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="hidden sm:block" />
        )}
        <button type="submit" className={buttonClass("secondary")}>
          Filtrar
        </button>
      </form>

      {result.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-10 text-center">
          <p className="font-medium">
            {q || filter
              ? "No hay avisos que coincidan con los filtros."
              : "Todavía no hay avisos."}
          </p>
          {!q && !filter ? (
            <p className="mt-1 text-sm text-[var(--muted)]">
              Se crean solos cuando se acerca la próxima actuación de los
              equipos de una instalación y los avisos están activados.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="relative overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Envío</th>
                <th className="px-4 py-3 font-medium">Instalación</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Aviso</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                {canCancel ? (
                  <th className="px-4 py-3 font-medium">
                    <span className="sr-only">Acciones</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {result.rows.map((r) => (
                <tr
                  key={r.id}
                  className="align-top hover:bg-[var(--surface-2)]"
                >
                  <td className="px-4 py-3 tabular-nums">
                    {formatDateTime(r.sentAt ?? r.scheduledFor, tz)}
                    {branches.length > 1 ? (
                      <div className="text-xs text-[var(--muted)]">
                        {r.branchName}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {r.installationId ? (
                      <Link
                        href={`/app/instalaciones/${r.installationId}`}
                        className="font-semibold text-[var(--accent)]"
                      >
                        {r.installationName}
                      </Link>
                    ) : (
                      <>
                        <Link
                          href={`/app/vehiculos/${r.vehicleId}`}
                          className="font-mono font-semibold text-[var(--accent)]"
                        >
                          {r.plate}
                        </Link>
                        <div className="text-xs text-[var(--muted)]">
                          Vehículo (etapa anterior) · {r.vehicleName}
                        </div>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/app/clientes/${r.customerId}`}
                      className="hover:text-[var(--accent)]"
                    >
                      {r.customerName}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {r.type === "service_km"
                      ? "Por kilometraje"
                      : `${r.offsetDays} días antes`}
                    <div className="text-xs text-[var(--muted)]">
                      Vence: {formatDate(r.dueDate)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`${BADGE} ${TONE[r.status] ?? "bg-[var(--surface-2)] text-[var(--muted)]"}`}
                    >
                      {REMINDER_STATUS_LABELS[r.status] ?? r.status}
                    </span>
                    {r.skipReason ? (
                      <div className="mt-1 text-xs text-[var(--muted)]">
                        {SKIP_REASON_LABELS[r.skipReason] ?? r.skipReason}
                      </div>
                    ) : null}
                    {r.status === "retrying" ? (
                      <div className="mt-1 text-xs text-[var(--muted)]">
                        Intento {r.attempts}. Se volverá a intentar.
                      </div>
                    ) : null}
                    {r.appointmentId ? (
                      <div className="mt-1">
                        <Link
                          href={`/app/citas/${r.appointmentId}`}
                          className={`${BADGE} bg-[var(--accent-soft)] text-[var(--foreground)]`}
                        >
                          Visita pedida
                        </Link>
                      </div>
                    ) : null}
                    {r.lastError &&
                    ["failed", "retrying"].includes(r.status) ? (
                      <div
                        className="mt-1 max-w-xs truncate text-xs text-[var(--muted)]"
                        title={r.lastError}
                      >
                        {r.lastError}
                      </div>
                    ) : null}
                  </td>
                  {canCancel ? (
                    <td className="px-4 py-3 text-right">
                      {r.status === "scheduled" || r.status === "retrying" ? (
                        <CancelReminderButton
                          id={r.id}
                          label={r.installationName ?? r.plate ?? ""}
                        />
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        page={result}
        basePath="/app/recordatorios"
        params={{ q, estado: filter, taller: branchId }}
      />
    </div>
  );
}
