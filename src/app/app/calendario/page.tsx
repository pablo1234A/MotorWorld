import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/pci/page-parts";
import { buttonClass } from "@/components/ui/button-styles";
import { todayIn } from "@/lib/dates";
import { param } from "@/lib/pagination";
import { WORK_ORDER_STATUS_LABELS, type WorkOrderStatus } from "@/lib/pci/labels";
import { capabilities } from "@/server/auth/capabilities";
import { can } from "@/server/auth/context";
import { requireOrgPage } from "@/server/auth/guards";
import { type CalendarEntry, calendarEntries } from "@/server/modules/calendar/service";

export const metadata: Metadata = { title: "Calendario · RevisaYa" };

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const monthFmt = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
const dayFmt = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

const iso = (d: Date) => d.toISOString().slice(0, 10);

function entryHref(e: CalendarEntry): string {
  return e.kind === "work_order" ? `/app/ordenes-trabajo/${e.id}` : e.kind === "visit" ? `/app/citas/${e.id}` : `/app/instalaciones/${e.id}#vencimientos`;
}

function EntryChip({ e }: { e: CalendarEntry }) {
  const tone =
    e.kind === "work_order"
      ? "border-l-[var(--accent)] bg-[var(--accent-soft)]"
      : e.kind === "visit"
        ? "border-l-[var(--info)] bg-[var(--info-soft)]"
        : e.overdue
          ? "border-l-[var(--danger)] bg-[var(--danger-soft)]"
          : "border-l-[var(--warning)] bg-[var(--warning-soft)]";
  const title =
    e.kind === "work_order"
      ? `${e.time ? `${e.time} · ` : ""}${e.label}`
      : e.kind === "visit"
        ? `${e.time} · Visita: ${e.label}`
        : `${e.count} ${e.count === 1 ? "vencimiento" : "vencimientos"} · ${e.label}`;
  const sub = e.kind === "work_order" ? `${e.detail} · ${WORK_ORDER_STATUS_LABELS[e.status as WorkOrderStatus] ?? e.status}` : e.detail;
  return (
    <Link href={entryHref(e)} className={`block rounded border-l-4 px-1.5 py-1 text-xs leading-tight hover:underline ${tone}`} title={`${title} — ${sub}`}>
      <span className="block truncate font-medium">{title}</span>
      <span className="block truncate text-[var(--muted)]">{sub}</span>
    </Link>
  );
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgPage("/app/calendario");
  const sp = await searchParams;
  const today = todayIn();
  const m = param(sp.mes, 7);
  const month = m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : today.slice(0, 7);
  const first = new Date(`${month}-01T00:00:00Z`);
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
  const gridStart = new Date(first);
  gridStart.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));
  const gridEnd = new Date(last);
  gridEnd.setUTCDate(last.getUTCDate() + (6 - ((last.getUTCDay() + 6) % 7)));
  const caps = capabilities(ctx);
  const entries = await calendarEntries(ctx, iso(gridStart), iso(gridEnd), { visits: can(ctx, "appointments.manage"), due: caps.seeAllWorkOrders || caps.equipmentWrite });
  const byDay = new Map<string, CalendarEntry[]>();
  for (const e of entries) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  const days: string[] = [];
  for (let d = new Date(gridStart); d <= gridEnd; d.setUTCDate(d.getUTCDate() + 1)) days.push(iso(d));
  const prev = iso(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() - 1, 1))).slice(0, 7);
  const next = iso(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1))).slice(0, 7);
  const monthDays = days.filter((d) => d.startsWith(month) && byDay.has(d));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Calendario"
        subtitle="Órdenes de trabajo programadas, visitas confirmadas y vencimientos de los equipos."
        actions={
          <div className="flex items-center gap-2">
            <Link href={`/app/calendario?mes=${prev}`} className={buttonClass("secondary", "!px-3")} aria-label="Mes anterior">
              ←
            </Link>
            <span className="min-w-36 text-center font-semibold capitalize">{monthFmt.format(first)}</span>
            <Link href={`/app/calendario?mes=${next}`} className={buttonClass("secondary", "!px-3")} aria-label="Mes siguiente">
              →
            </Link>
            {month !== today.slice(0, 7) ? (
              <Link href="/app/calendario" className={buttonClass("ghost")}>
                Hoy
              </Link>
            ) : null}
          </div>
        }
      />
      <ul className="flex flex-wrap gap-4 text-xs text-[var(--muted)]" aria-label="Leyenda">
        <li className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-[var(--accent)]" /> Orden de trabajo</li>
        <li className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-[var(--info)]" /> Visita confirmada</li>
        <li className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-[var(--warning)]" /> Vencimientos</li>
        <li className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-[var(--danger)]" /> Vencidos</li>
      </ul>

      {/* Escritorio: rejilla mensual */}
      <div className="hidden overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] md:block">
        <div className="grid grid-cols-7 border-b border-[var(--border)] text-center text-xs font-medium uppercase text-[var(--muted)]">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-2">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const list = byDay.get(d) ?? [];
            const inMonth = d.startsWith(month);
            return (
              <div key={d} className={`min-h-28 border-b border-r border-[var(--border)] p-1.5 ${inMonth ? "" : "bg-[var(--surface-2)] opacity-60"}`}>
                <div className={`mb-1 text-right text-xs ${d === today ? "font-bold text-[var(--accent)]" : "text-[var(--muted)]"}`}>{Number(d.slice(8))}</div>
                <div className="flex flex-col gap-1">
                  {list.slice(0, 4).map((e) => (
                    <EntryChip key={`${e.kind}-${e.id}-${e.date}`} e={e} />
                  ))}
                  {list.length > 4 ? <span className="text-xs text-[var(--muted)]">+{list.length - 4} más</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Móvil: agenda */}
      <div className="flex flex-col gap-4 md:hidden">
        {monthDays.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No hay nada programado este mes.</p>
        ) : (
          monthDays.map((d) => (
            <section key={d}>
              <h2 className={`mb-1 text-sm font-semibold capitalize ${d === today ? "text-[var(--accent)]" : ""}`}>{dayFmt.format(new Date(`${d}T00:00:00Z`))}</h2>
              <div className="flex flex-col gap-1">
                {(byDay.get(d) ?? []).map((e) => (
                  <EntryChip key={`${e.kind}-${e.id}-${e.date}`} e={e} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
