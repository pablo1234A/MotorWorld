import "server-only";

import { sql } from "kysely";

import { withRls } from "@/server/db/client";

import type { ServiceCtx } from "../branches/service";

/**
 * Agenda del mes: órdenes de trabajo programadas, visitas confirmadas y
 * vencimientos de equipos agrupados por instalación y día. Todo con la RLS
 * del usuario (un técnico solo ve sus órdenes).
 */
export type CalendarEntry =
  | { kind: "work_order"; date: string; time: string | null; id: string; label: string; detail: string; status: string }
  | { kind: "visit"; date: string; time: string; id: string; label: string; detail: string; status: string }
  | { kind: "due"; date: string; id: string; label: string; detail: string; count: number; overdue: boolean };

const day = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d));

export async function calendarEntries(ctx: ServiceCtx, from: string, to: string, opts: { visits: boolean; due: boolean }): Promise<CalendarEntry[]> {
  const orgId = ctx.membership.organizationId;
  return withRls(ctx.auth, async (tx) => {
    const orders = await sql<{ id: string; number: string; status: string; scheduled_for: Date; time: string | null; installation: string; technician: string | null }>`
      select w.id, w.number, w.status, w.scheduled_for, to_char(w.scheduled_time, 'HH24:MI') as time, i.name as installation, t.full_name as technician
        from work_orders w
        join installations i on i.id = w.installation_id
        left join technicians t on t.id = w.technician_id
       where w.organization_id = ${orgId} and w.scheduled_for between ${from}::date and ${to}::date and w.status <> 'canceled'
       order by w.scheduled_for, w.scheduled_time nulls last
       limit 1000
    `.execute(tx);
    const visits = opts.visits
      ? await sql<{ id: string; status: string; starts: Date; requester_name: string; tz: string; installation: string | null }>`
          select a.id, a.status, a.confirmed_start as starts, a.requester_name, coalesce(b.timezone, o.timezone) as tz, i.name as installation
            from appointments a
            join organizations o on o.id = a.organization_id
            join branches b on b.id = a.branch_id
            left join installations i on i.id = a.installation_id
           where a.organization_id = ${orgId} and a.status in ('confirmed', 'rescheduled')
             and a.confirmed_start >= ${from}::date - 1 and a.confirmed_start < ${to}::date + 2
           order by a.confirmed_start
           limit 1000
        `.execute(tx)
      : { rows: [] };
    const due = opts.due
      ? await sql<{ installation_id: string; installation: string; customer: string; next_due_on: Date; n: string }>`
          select i.id as installation_id, i.name as installation, trim(c.first_name || ' ' || c.last_name) as customer, s.next_due_on, count(*) as n
            from equipment_action_schedules s
            join equipment e on e.id = s.equipment_id and e.deleted_at is null and e.status = 'in_service'
            join installations i on i.id = e.installation_id and i.deleted_at is null and i.status = 'active'
            join customers c on c.id = i.customer_id
           where s.organization_id = ${orgId} and s.next_due_on between ${from}::date and ${to}::date
           group by i.id, i.name, c.first_name, c.last_name, s.next_due_on
           order by s.next_due_on
           limit 1000
        `.execute(tx)
      : { rows: [] };

    const today = new Date().toISOString().slice(0, 10);
    const out: CalendarEntry[] = [];
    for (const o of orders.rows)
      out.push({ kind: "work_order", date: day(o.scheduled_for), time: o.time, id: o.id, label: o.number, detail: `${o.installation}${o.technician ? ` · ${o.technician}` : ""}`, status: o.status });
    for (const v of visits.rows) {
      const parts = new Intl.DateTimeFormat("en-CA", { timeZone: v.tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(v.starts);
      const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
      const date = `${get("year")}-${get("month")}-${get("day")}`;
      if (date < from || date > to) continue;
      out.push({ kind: "visit", date, time: `${get("hour")}:${get("minute")}`, id: v.id, label: v.requester_name, detail: v.installation ?? "Visita", status: v.status });
    }
    for (const d of due.rows) {
      const date = day(d.next_due_on);
      out.push({ kind: "due", date, id: d.installation_id, label: d.installation, detail: d.customer, count: Number(d.n), overdue: date < today });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || ("time" in a && a.time ? a.time : "99").localeCompare("time" in b && b.time ? b.time : "99"));
  });
}
