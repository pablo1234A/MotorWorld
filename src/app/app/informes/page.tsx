import type { Metadata } from "next";
import Link from "next/link";

import { buttonClass } from "@/components/ui/button-styles";
import { Alert, Card } from "@/components/ui/feedback";
import { Pagination } from "@/components/ui/pagination";
import { addDays, formatDate, formatDateTime, todayIn } from "@/lib/dates";
import { param, parsePage } from "@/lib/pagination";
import { can, isAdmin } from "@/server/auth/context";
import { requireOrgPage } from "@/server/auth/guards";
import { listAccessibleBranches } from "@/server/modules/branches/service";
import {
  EMAIL_KIND_LABELS,
  EMAIL_STATUS_LABELS,
  emailsSent,
  getSummary,
  notReturned,
  parseRange,
  pendingServices,
  reportsAvailable,
} from "@/server/modules/reports/service";

export const metadata: Metadata = { title: "Informes · RevisaYa" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TABS = [
  ["no-han-vuelto", "Clientes que no han vuelto"],
  ["revisiones-pendientes", "Revisiones pendientes"],
  ["correos", "Correos enviados"],
] as const;
type Tab = (typeof TABS)[number][0];

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : "—");
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireOrgPage("/app/informes");
  if (!can(ctx, "reports.read")) {
    return <Alert tone="error" title="Sin permiso">No tienes permiso para ver los informes. Pídeselo a un administrador del taller.</Alert>;
  }
  if (!reportsAvailable(ctx)) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Informes</h1>
        <Alert tone="info" title="Incluidos a partir del plan Max">
          Clientes que no han vuelto, revisiones pendientes, correos enviados y cuántos clientes vuelven tras un aviso, con filtros por fechas y
          exportación.{" "}
          {isAdmin(ctx) ? (
            <Link href="/app/facturacion" className="font-medium text-[var(--accent)]">
              Cambiar de plan
            </Link>
          ) : (
            "Pídele a un administrador que cambie de plan."
          )}
        </Alert>
      </div>
    );
  }

  const sp = await searchParams;
  const range = parseRange({ desde: param(sp.desde, 10), hasta: param(sp.hasta, 10), sucursal: param(sp.sucursal, 40) });
  const tabParam = param(sp.lista, 30);
  const tab: Tab = TABS.some(([k]) => k === tabParam) ? (tabParam as Tab) : "no-han-vuelto";
  const page = parsePage(param(sp.pagina));
  const until = addDays(todayIn(), 30);
  const [summary, branches, list] = await Promise.all([
    getSummary(ctx, range),
    listAccessibleBranches(ctx),
    tab === "no-han-vuelto"
      ? notReturned(ctx, range, { page })
      : tab === "revisiones-pendientes"
        ? pendingServices(ctx, until, range.branchId, { page })
        : emailsSent(ctx, range, { page }),
  ]);
  const qs = { desde: range.from, hasta: range.to, sucursal: range.branchId ?? undefined };
  const query = (extra: Record<string, string>) => new URLSearchParams(Object.entries({ ...qs, ...extra }).filter(([, v]) => v) as [string, string][]).toString();
  const maxMonth = Math.max(1, ...summary.months.map((m) => m.reminders));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Informes</h1>
        <p className="text-sm text-[var(--muted)]">
          Del {formatDate(range.from)} al {formatDate(range.to)}.
        </p>
      </div>

      <form method="get" className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-[auto_auto_1fr_auto] sm:items-end">
        <label className="flex flex-col gap-1 text-sm">
          Desde
          <input type="date" name="desde" defaultValue={range.from} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Hasta
          <input type="date" name="hasta" defaultValue={range.to} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2" />
        </label>
        {branches.length > 1 ? (
          <label className="flex flex-col gap-1 text-sm">
            Taller
            <select name="sucursal" defaultValue={range.branchId ?? ""} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2">
              <option value="">Todos los talleres</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="hidden sm:block" />
        )}
        <input type="hidden" name="lista" value={tab} />
        <button type="submit" className={buttonClass("secondary")}>
          Ver el periodo
        </button>
      </form>

      <section aria-labelledby="vuelven" className="flex flex-col gap-3">
        <h2 id="vuelven" className="text-lg font-semibold">De los avisos a los clientes que vuelven</h2>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Avisos enviados" value={summary.remindersSent} hint={`${summary.vehiclesReminded.toLocaleString("es-ES")} vehículos`} />
          <Stat label="Citas pedidas desde un aviso" value={summary.appointmentsFromReminders} hint={`${summary.appointmentsRequested.toLocaleString("es-ES")} citas pedidas en total`} />
          <Stat label="Citas confirmadas" value={summary.appointmentsConfirmed} hint={`${summary.appointmentsCompleted.toLocaleString("es-ES")} realizadas`} />
          <Stat
            label="Volvieron tras un aviso"
            value={summary.vehiclesReturned}
            hint={`${pct(summary.vehiclesReturned, summary.vehiclesReminded)} de los vehículos avisados`}
            strong
          />
        </dl>
        <p className="text-xs text-[var(--muted)]">
          «Volvió tras un aviso»: el vehículo tiene una revisión anotada en el historial en los 90 días siguientes al aviso. Indica coincidencia, no que el
          aviso sea la única causa.
        </p>
      </section>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Mes a mes</h2>
        {summary.months.length === 0 ? null : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <caption className="sr-only">Avisos enviados, vehículos que volvieron, citas pedidas y correos por mes</caption>
              <thead className="text-left text-[var(--muted)]">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-medium">Mes</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Avisos enviados</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Volvieron</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Citas pedidas</th>
                  <th scope="col" className="py-2 text-right font-medium">Correos</th>
                </tr>
              </thead>
              <tbody>
                {summary.months.map((m) => (
                  <tr key={m.month} className="border-t border-[var(--border)]">
                    <th scope="row" className="py-2 pr-3 font-medium">{monthLabel(m.month)}</th>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(2, (m.reminders / maxMonth) * 100)}%`, maxWidth: "12rem" }} aria-hidden />
                        <span className="tabular-nums">{m.reminders.toLocaleString("es-ES")}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{m.returned.toLocaleString("es-ES")}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{m.appointments.toLocaleString("es-ES")}</td>
                    <td className="py-2 text-right tabular-nums">{m.emails.toLocaleString("es-ES")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <section aria-labelledby="correos-resumen" className="flex flex-col gap-3">
        <h2 id="correos-resumen" className="text-lg font-semibold">Correos a clientes</h2>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Enviados" value={summary.emailsTotal} />
          <Stat label="Entregados (confirmado por el proveedor)" value={summary.emailsDelivered} hint={pct(summary.emailsDelivered, summary.emailsTotal)} />
          <Stat label="Rebotados" value={summary.emailsBounced} hint={pct(summary.emailsBounced, summary.emailsTotal)} />
          <Stat label="Marcados como spam" value={summary.emailsComplained} hint={pct(summary.emailsComplained, summary.emailsTotal)} />
        </dl>
        {Object.keys(summary.emailsByKind).length ? (
          <ul className="flex flex-wrap gap-2 text-sm">
            {Object.entries(summary.emailsByKind)
              .sort((a, b) => b[1] - a[1])
              .map(([k, n]) => (
                <li key={k} className="rounded-full bg-[var(--surface-2)] px-3 py-1">
                  {EMAIL_KIND_LABELS[k] ?? k}: <span className="font-semibold tabular-nums">{n.toLocaleString("es-ES")}</span>
                </li>
              ))}
          </ul>
        ) : null}
      </section>

      <section aria-labelledby="listas" className="flex flex-col gap-4">
        <h2 id="listas" className="sr-only">Listados</h2>
        <nav aria-label="Listados" className="flex flex-wrap gap-2">
          {TABS.map(([k, label]) => (
            <Link
              key={k}
              href={`/app/informes?${query({ lista: k })}`}
              aria-current={tab === k ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm ${tab === k ? "bg-[var(--accent-soft)] font-semibold" : "hover:bg-[var(--surface-2)]"}`}
            >
              {label}
            </Link>
          ))}
          <a href={`/api/app/reports/${tab}?${query({})}`} className={`${buttonClass("secondary")} ml-auto`} download>
            Descargar CSV
          </a>
        </nav>

        <p className="text-sm text-[var(--muted)]">
          {tab === "no-han-vuelto"
            ? "Vehículos que recibieron un aviso en el periodo y que todavía no tienen ninguna revisión anotada después del aviso."
            : tab === "revisiones-pendientes"
              ? `Revisiones vencidas y las que vencen hasta el ${formatDate(until)} (no depende del periodo elegido).`
              : "Correos enviados a clientes en el periodo, con su estado."}
        </p>

        {list.rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] p-10 text-center text-sm">No hay nada que mostrar en este periodo.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            {tab === "correos" ? (
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="text-left text-[var(--muted)]">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">Fecha</th>
                    <th scope="col" className="px-4 py-3 font-medium">Tipo</th>
                    <th scope="col" className="px-4 py-3 font-medium">Destinatario</th>
                    <th scope="col" className="px-4 py-3 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {(list.rows as Awaited<ReturnType<typeof emailsSent>>["rows"]).map((e, i) => (
                    <tr key={i} className="border-t border-[var(--border)]">
                      <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(e.sentAt)}</td>
                      <td className="px-4 py-3">{EMAIL_KIND_LABELS[e.kind] ?? e.kind}</td>
                      <td className="max-w-[16rem] truncate px-4 py-3">{e.toEmail}</td>
                      <td className="px-4 py-3">{EMAIL_STATUS_LABELS[e.status] ?? e.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="text-left text-[var(--muted)]">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">Vehículo</th>
                    <th scope="col" className="px-4 py-3 font-medium">Cliente</th>
                    <th scope="col" className="px-4 py-3 font-medium">{tab === "no-han-vuelto" ? "Aviso enviado" : "Próxima revisión"}</th>
                    <th scope="col" className="px-4 py-3 font-medium">{tab === "no-han-vuelto" ? "Próxima revisión" : "Último aviso"}</th>
                  </tr>
                </thead>
                <tbody>
                  {(list.rows as Array<{ vehicleId: string; customerId: string; customerName: string; phone: string | null; email: string | null; plate: string; vehicle: string | null; nextServiceDate: string | null; lastReminderOn: string | null; daysSince?: number; overdue?: boolean }>).map((v) => (
                    <tr key={v.vehicleId} className="border-t border-[var(--border)]">
                      <td className="px-4 py-3">
                        <Link href={`/app/vehiculos/${v.vehicleId}`} className="font-medium text-[var(--accent)]">
                          {v.plate}
                        </Link>
                        {v.vehicle ? <span className="block text-xs text-[var(--muted)]">{v.vehicle}</span> : null}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/app/clientes/${v.customerId}`}>{v.customerName}</Link>
                        <span className="block max-w-[14rem] truncate text-xs text-[var(--muted)]">{v.phone ?? v.email ?? "Sin contacto"}</span>
                      </td>
                      {tab === "no-han-vuelto" ? (
                        <>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {formatDate(v.lastReminderOn)} <span className="text-xs text-[var(--muted)]">(hace {v.daysSince} días)</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">{v.nextServiceDate ? formatDate(v.nextServiceDate) : "—"}</td>
                        </>
                      ) : (
                        <>
                          <td className={`px-4 py-3 whitespace-nowrap ${v.overdue ? "font-semibold text-[var(--danger-strong)]" : ""}`}>
                            {formatDate(v.nextServiceDate)}
                            {v.overdue ? " · vencida" : ""}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">{v.lastReminderOn ? formatDate(v.lastReminderOn) : "Sin aviso"}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
        <Pagination page={list} basePath="/app/informes" params={{ ...qs, lista: tab }} />
      </section>
    </div>
  );
}

function Stat({ label, value, hint, strong }: { label: string; value: number; hint?: string; strong?: boolean }) {
  return (
    <div className={`rounded-xl border bg-[var(--surface)] p-4 ${strong ? "border-[var(--accent)]" : "border-[var(--border)]"}`}>
      <dt className="text-sm text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString("es-ES")}</dd>
      {hint ? <dd className="mt-1 text-xs text-[var(--muted)]">{hint}</dd> : null}
    </div>
  );
}
