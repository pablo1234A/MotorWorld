import "server-only";

import { randomUUID } from "node:crypto";

import { sql } from "kysely";

import { renderPlatformEmail } from "@/lib/email/platform-email";
import { withRls, withSystem } from "@/server/db/client";
import type { EmailPort } from "@/server/email/port";
import type { SenderConfig } from "@/server/email/provider";
import { platformFrom } from "@/server/email/sender";
import { logger } from "@/server/logger";

/**
 * Correos de la plataforma a los administradores de la empresa (no cuentan en
 * su consumo, P5):
 *  - Aviso de consumo al 80 % y al 100 % del límite mensual de correos.
 *  - Resumen diario o semanal (lunes) por sucursal, a partir de las 08:00
 *    de su zona horaria.
 * Ambos son idempotentes: se "reserva" el envío en la BD antes de mandarlo y
 * se libera si el proveedor no lo acepta (se reintenta en la siguiente
 * ejecución).
 */

interface Deps {
  email: EmailPort | null;
  sender: SenderConfig | null;
}

interface Recipient {
  email: string;
}

const fmt = (n: number) => n.toLocaleString("es-ES");

async function send(
  deps: { email: EmailPort; sender: SenderConfig },
  to: Recipient[],
  msg: { subject: string; html: string; text: string },
  log: { organizationId: string; branchId: string; kind: "digest" | "usage_alert" },
): Promise<number> {
  const { from, address } = platformFrom(deps.sender);
  let accepted = 0;
  for (const r of to) {
    const result = await deps.email
      .send({ from, to: r.email, subject: msg.subject, html: msg.html, text: msg.text, headers: {}, idempotencyKey: `${log.kind}-${randomUUID()}`, tags: { kind: log.kind } })
      .catch((err: Error) => ({ kind: "retryable" as const, code: "adapter_exception", message: err.message }));
    if (result.kind === "accepted") accepted++;
    await withSystem((tx) =>
      tx
        .insertInto("email_logs")
        .values({
          organization_id: log.organizationId,
          branch_id: log.branchId,
          kind: log.kind,
          to_email: r.email,
          from_email: address,
          subject: msg.subject.slice(0, 200),
          provider: deps.email.name,
          provider_message_id: result.kind === "accepted" ? result.messageId : null,
          status: result.kind === "accepted" ? "accepted" : "failed",
          error_code: result.kind === "accepted" ? null : result.code.slice(0, 100),
          sent_at: result.kind === "accepted" ? new Date() : null,
        })
        .execute(),
    ).catch((err) => logger.error("platform_email_log_failed", { error: err }));
  }
  return accepted;
}

async function adminsOf(organizationId: string, branchId?: string): Promise<Recipient[]> {
  return withSystem(async (tx) => {
    const { rows } = await sql<Recipient>`
      select p.email
        from organization_members m
        join profiles p on p.id = m.user_id
       where m.organization_id = ${organizationId} and m.role = 'admin' and m.status = 'active' and p.status = 'active'
         and (${branchId ?? null}::uuid is null or m.branch_scope = 'all'
              or exists (select 1 from member_branches mb where mb.member_id = m.id and mb.branch_id = ${branchId ?? null}::uuid))
       order by m.is_owner desc, m.created_at
       limit 10
    `.execute(tx);
    return rows;
  });
}

// ------------------------------------------------------------ aviso de consumo

export async function notifyUsage(deps: Deps, limit = 100): Promise<{ sent: number; failed: number }> {
  const stats = { sent: 0, failed: 0 };
  if (!deps.email || !deps.sender) return stats;
  const ready = { email: deps.email, sender: deps.sender };

  // Reserva atómica del aviso: dos ejecuciones simultáneas no lo envían dos veces.
  const due = await withSystem(async (tx) => {
    const { rows } = await sql<{ organization_id: string; period_start: string; used: number; lim: number; level: 80 | 100; org_name: string; branch_id: string }>`
      with candidates as (
        select * from (
          select uc.organization_id, uc.period_start, uc.used, p.monthly_emails as lim,
                 case when uc.used >= p.monthly_emails and uc.alert_100_sent_at is null then 100
                      when uc.used >= ceil(p.monthly_emails * 0.8) and uc.alert_80_sent_at is null and uc.alert_100_sent_at is null then 80 end as level
            from usage_counters uc
            join organizations o on o.id = uc.organization_id and o.status = 'active'
            join subscriptions s on s.organization_id = uc.organization_id
            join plans p on p.code = s.plan_code
           where uc.resource = 'emails'
             and app.subscription_is_active(s.status, s.past_due_since)
             and uc.period_start = app.usage_period(uc.organization_id)
             and p.monthly_emails > 0
        ) x
        where x.level is not null
        limit ${limit}
      ),
      claimed as (
        update usage_counters uc
           set alert_100_sent_at = case when c.level = 100 then now() else uc.alert_100_sent_at end,
               alert_80_sent_at = coalesce(uc.alert_80_sent_at, now())
          from candidates c
         where uc.organization_id = c.organization_id and uc.resource = 'emails' and uc.period_start = c.period_start
           -- Otra ejecución simultánea que ya lo reservó: aquí no se reserva.
           and ((c.level = 100 and uc.alert_100_sent_at is null) or (c.level = 80 and uc.alert_80_sent_at is null))
        returning uc.organization_id, c.period_start::text, c.used, c.lim, c.level
      )
      select c.*, o.trade_name as org_name, b.id as branch_id
        from claimed c
        join organizations o on o.id = c.organization_id
        join branches b on b.organization_id = c.organization_id and b.is_primary
    `.execute(tx);
    return rows;
  });

  for (const d of due) {
    const full = d.level === 100;
    const msg = renderPlatformEmail({
      title: full ? "Has alcanzado el límite de correos de este mes" : "Has usado el 80 % de los correos de este mes",
      intro: full
        ? `${d.org_name} ha enviado ${fmt(d.used)} de los ${fmt(d.lim)} correos que incluye su plan este mes. Los avisos que tocan a partir de ahora no se enviarán hasta el mes que viene.`
        : `${d.org_name} ha enviado ${fmt(d.used)} de los ${fmt(d.lim)} correos que incluye su plan este mes.`,
      rows: [
        ["Correos enviados este mes", fmt(d.used)],
        ["Límite del plan", fmt(d.lim)],
      ],
      notes: [
        full
          ? "Si mejoras tu plan este mes, los avisos que se han quedado sin enviar y todavía son útiles se vuelven a programar automáticamente."
          : "Si prevés superarlo, puedes mejorar tu plan: los avisos que se queden sin enviar se reprograman al hacerlo.",
      ],
      link: { href: new URL("/app/recordatorios", ready.sender.appUrl).toString(), label: "Ver los recordatorios" },
    });
    const to = await adminsOf(d.organization_id);
    const accepted = to.length ? await send(ready, to, { subject: full ? "Límite de correos alcanzado" : "Has usado el 80 % de tus correos", ...msg }, { organizationId: d.organization_id, branchId: d.branch_id, kind: "usage_alert" }) : 0;
    if (accepted > 0) {
      stats.sent++;
    } else {
      stats.failed++;
      // No ha salido: se libera la reserva para reintentarlo.
      await withSystem((tx) =>
        tx
          .updateTable("usage_counters")
          .set(d.level === 100 ? { alert_100_sent_at: null } : { alert_80_sent_at: null })
          .where("organization_id", "=", d.organization_id)
          .where("resource", "=", "emails")
          .where("period_start", "=", d.period_start)
          .execute(),
      );
    }
  }
  return stats;
}

// -------------------------------------------------------------------- resumen

interface DigestStats {
  sent: number;
  delivered: number;
  problems: number;
  noEmail: number;
  optedOut: number;
  quota: number;
  upcoming: number;
  overdue: number;
  /** PCI: equipos en servicio con alguna actuación vencida, y órdenes abiertas. */
  equipmentOverdue: number;
  openWorkOrders: number;
}

export async function sendDigests(deps: Deps, now = new Date(), limit = 200): Promise<{ sent: number; skipped: number; failed: number }> {
  const stats = { sent: 0, skipped: 0, failed: 0 };
  if (!deps.email || !deps.sender) return stats;
  const ready = { email: deps.email, sender: deps.sender };

  const due = await withSystem(async (tx) => {
    const { rows } = await sql<{ branch_id: string; organization_id: string; org_name: string; branch_name: string; branches: number; frequency: string; period_key: string; tz: string }>`
      with local as (
        select bs.branch_id, bs.organization_id, bs.digest_frequency as frequency, o.trade_name as org_name, b.name as branch_name,
               coalesce(b.timezone, o.timezone) as tz,
               (${now}::timestamptz at time zone coalesce(b.timezone, o.timezone)) as local_now,
               (select count(*)::int from branches b2 where b2.organization_id = o.id and b2.status = 'active') as branches
          from branch_settings bs
          join branches b on b.id = bs.branch_id and b.status = 'active'
          join organizations o on o.id = bs.organization_id and o.status = 'active'
          join subscriptions s on s.organization_id = o.id
         where bs.digest_frequency <> 'off'
           and app.subscription_is_active(s.status, s.past_due_since)
      )
      select l.branch_id, l.organization_id, l.org_name, l.branch_name, l.branches, l.frequency, l.tz,
             case l.frequency when 'daily' then to_char(l.local_now, 'YYYY-MM-DD') else to_char(l.local_now, 'IYYY-"W"IW') end as period_key
        from local l
       where l.local_now::time >= time '08:00'
         and (l.frequency = 'daily' or extract(isodow from l.local_now) = 1)
         and not exists (select 1 from private.digest_runs d where d.branch_id = l.branch_id
                         and d.period_key = case l.frequency when 'daily' then to_char(l.local_now, 'YYYY-MM-DD') else to_char(l.local_now, 'IYYY-"W"IW') end)
       limit ${limit}
    `.execute(tx);
    return rows;
  });

  for (const d of due) {
    // Reserva del periodo (si otra ejecución ya lo hizo, se salta).
    const claimed = await withSystem(async (tx) => {
      const { rows } = await sql<{ ok: boolean }>`
        insert into private.digest_runs (branch_id, period_key) values (${d.branch_id}, ${d.period_key})
        on conflict do nothing returning true as ok
      `.execute(tx);
      return rows.length > 0;
    });
    if (!claimed) continue;

    const days = d.frequency === "daily" ? 1 : 7;
    const s = await withSystem(async (tx) => {
      const { rows } = await sql<DigestStats>`
        select
          count(*) filter (where r.status in ('sent', 'delivered', 'bounced', 'complained') and r.sent_at > ${now}::timestamptz - make_interval(days => ${days}))::int as sent,
          count(*) filter (where r.status = 'delivered' and r.sent_at > ${now}::timestamptz - make_interval(days => ${days}))::int as delivered,
          count(*) filter (where r.status in ('failed', 'bounced', 'complained') and r.updated_at > ${now}::timestamptz - make_interval(days => ${days}))::int as problems,
          count(*) filter (where r.status = 'skipped' and r.skip_reason = 'no_email' and r.updated_at > ${now}::timestamptz - make_interval(days => ${days}))::int as "noEmail",
          count(*) filter (where r.status = 'skipped' and r.skip_reason in ('opted_out', 'suppressed') and r.updated_at > ${now}::timestamptz - make_interval(days => ${days}))::int as "optedOut",
          count(*) filter (where r.status = 'skipped' and r.skip_reason = 'quota_exceeded' and r.updated_at > ${now}::timestamptz - make_interval(days => ${days}))::int as quota,
          (select count(*)::int from reminders r2 where r2.branch_id = ${d.branch_id} and r2.status in ('scheduled', 'retrying')) as upcoming,
          (select count(*)::int from vehicles v where v.branch_id = ${d.branch_id} and v.status = 'active' and v.deleted_at is null
              and v.next_service_date < (${now}::timestamptz at time zone ${d.tz})::date) as overdue,
          (select count(*)::int from equipment e where e.branch_id = ${d.branch_id} and e.status = 'in_service' and e.deleted_at is null
              and e.next_action_on < (${now}::timestamptz at time zone ${d.tz})::date) as "equipmentOverdue",
          (select count(*)::int from work_orders w where w.branch_id = ${d.branch_id} and w.status in ('pending', 'scheduled', 'assigned', 'in_progress')) as "openWorkOrders"
        from reminders r
        where r.branch_id = ${d.branch_id}
      `.execute(tx);
      return rows[0];
    });

    const activity = s.sent + s.problems + s.noEmail + s.optedOut + s.quota + s.upcoming;
    if (activity === 0) {
      stats.skipped++; // Nada que contar: no se manda un correo vacío.
      continue;
    }
    const where = d.branches > 1 ? `${d.org_name} · ${d.branch_name}` : d.org_name;
    const period = d.frequency === "daily" ? "ayer" : "la última semana";
    const rows: Array<[string, string]> = [
      ["Avisos enviados", fmt(s.sent)],
      ["Entregados (confirmado por el proveedor)", fmt(s.delivered)],
      ["Con problemas (rebote, queja o fallo)", fmt(s.problems)],
      ["No enviados: cliente sin correo", fmt(s.noEmail)],
      ["No enviados: baja o dirección bloqueada", fmt(s.optedOut)],
      ...(s.quota ? ([["No enviados: límite de correos del mes", fmt(s.quota)]] as Array<[string, string]>) : []),
      ["Avisos programados", fmt(s.upcoming)],
      ["Equipos con alguna actuación vencida", fmt(s.equipmentOverdue)],
      ["Órdenes de trabajo abiertas", fmt(s.openWorkOrders)],
      ...(s.overdue ? ([["Vehículos (etapa anterior) con la revisión vencida", fmt(s.overdue)]] as Array<[string, string]>) : []),
    ];
    const notes: string[] = [];
    if (s.noEmail) notes.push("Añade el correo de esos clientes en su ficha para que reciban los próximos avisos.");
    if (s.problems) notes.push("Revisa los avisos con problemas: puede que el correo del cliente esté mal escrito.");
    const msg = renderPlatformEmail({
      title: d.frequency === "daily" ? "Resumen del día" : "Resumen de la semana",
      intro: `Esto es lo que ha pasado con los avisos de ${where} ${period}.`,
      rows,
      notes,
      link: { href: new URL("/app/recordatorios", ready.sender.appUrl).toString(), label: "Ver los recordatorios" },
    });
    const to = await adminsOf(d.organization_id, d.branch_id);
    const accepted = to.length
      ? await send(ready, to, { subject: `${d.frequency === "daily" ? "Resumen diario" : "Resumen semanal"} de avisos · ${where}`, ...msg }, { organizationId: d.organization_id, branchId: d.branch_id, kind: "digest" })
      : 0;
    if (accepted > 0) {
      stats.sent++;
    } else {
      stats.failed++;
      await withSystem((tx) => sql`delete from private.digest_runs where branch_id = ${d.branch_id} and period_key = ${d.period_key}`.execute(tx));
    }
  }
  return stats;
}

// --------------------------------------------------------- reputación del correo

export const REPUTATION_THRESHOLDS = {
  warning: { bounce: 0.04, complaint: 0.001 },
  critical: { bounce: 0.08, complaint: 0.003 },
} as const;

export function reputationLevel(bounceRate: number, complaintRate: number): "ok" | "warning" | "critical" {
  const t = REPUTATION_THRESHOLDS;
  if (bounceRate >= t.critical.bounce || complaintRate >= t.critical.complaint) return "critical";
  if (bounceRate > t.warning.bounce || complaintRate > t.warning.complaint) return "warning";
  return "ok";
}

/**
 * Rebotes y quejas de los últimos 7 días por taller (mínimo 50 envíos). Si
 * pasan de los umbrales, avisa a los administradores (como mucho una vez por
 * semana y nivel) y deja una alerta para la plataforma en el registro. Un
 * remitente con muchas quejas perjudica la entrega de TODAS las empresas que
 * usan el dominio compartido.
 */
export async function checkEmailReputation(deps: Deps): Promise<{ checked: number; warning: number; critical: number; notified: number }> {
  const stats = { checked: 0, warning: 0, critical: 0, notified: 0 };
  const rows = await withSystem(async (tx) => {
    const { rows } = await sql<{ organization_id: string; sent: string; bounced: string; complained: string; bounce_rate: string; complaint_rate: string; org_name: string; branch_id: string; recent: boolean }>`
      select r.*, o.trade_name as org_name, b.id as branch_id,
             exists (select 1 from private.email_reputation_alerts a where a.organization_id = r.organization_id
                      and a.created_at > now() - interval '7 days') as recent
        from private.email_reputation(7, 50) r
        join organizations o on o.id = r.organization_id
        join branches b on b.organization_id = r.organization_id and b.is_primary
    `.execute(tx);
    return rows;
  });
  for (const r of rows) {
    stats.checked++;
    const bounce = Number(r.bounce_rate);
    const complaint = Number(r.complaint_rate);
    const level = reputationLevel(bounce, complaint);
    if (level === "ok") continue;
    stats[level]++;
    logger.error("email_reputation_alert", { organizationId: r.organization_id, level, sent: Number(r.sent), bounceRate: bounce, complaintRate: complaint });
    if (r.recent) continue;
    await withSystem((tx) =>
      tx
        .insertInto("private.email_reputation_alerts" as never)
        .values({ organization_id: r.organization_id, level, sent: Number(r.sent), bounce_rate: bounce, complaint_rate: complaint } as never)
        .execute(),
    );
    if (!deps.email || !deps.sender) continue;
    const pct = (n: number) => `${(n * 100).toLocaleString("es-ES", { maximumFractionDigits: 2 })} %`;
    const msg = renderPlatformEmail({
      title: level === "critical" ? "Tus correos tienen demasiados rebotes o quejas" : "Revisa la calidad de tu lista de clientes",
      intro: `En los últimos 7 días, de los ${fmt(Number(r.sent))} correos que ha enviado ${r.org_name}, el ${pct(bounce)} ha rebotado y el ${pct(complaint)} se ha marcado como spam.`,
      rows: [
        ["Rebotes (recomendado: menos del 4 %)", pct(bounce)],
        ["Marcados como spam (recomendado: menos del 0,1 %)", pct(complaint)],
      ],
      notes: [
        "Gmail y Outlook mandan a spam, o bloquean, a los remitentes con muchos rebotes o quejas: tus avisos dejarían de llegar.",
        "Revisa los correos de tus clientes (los que rebotan ya no reciben avisos) y no añadas personas que no sean clientes de la empresa.",
        ...(level === "critical" ? ["Si sigue así, RevisaYa puede tener que pausar los envíos de la empresa para proteger la entrega del resto (términos, «Uso aceptable»)."] : []),
      ],
      link: { href: new URL("/app/configuracion/correo", deps.sender.appUrl).toString(), label: "Ver el estado del correo" },
    });
    const to = await adminsOf(r.organization_id);
    if (to.length && (await send({ email: deps.email, sender: deps.sender }, to, { subject: level === "critical" ? "Problema con la entrega de tus correos" : "Revisa la calidad de tus correos", ...msg }, { organizationId: r.organization_id, branchId: r.branch_id, kind: "usage_alert" })) > 0) {
      stats.notified++;
    }
  }
  return stats;
}

/** Datos del panel: últimos 30 días (solo administradores; lo comprueba la BD). */
export async function orgEmailReputation(ctx: { auth: { userId: string }; membership: { organizationId: string } }) {
  const raw = await withRls(ctx.auth, async (tx) => {
    const { rows } = await sql<{ r: { sent: number; bounced: number; complained: number } }>`select app.org_email_reputation(${ctx.membership.organizationId}::uuid) as r`.execute(tx);
    return rows[0].r;
  });
  const sent = Number(raw.sent);
  const bounceRate = sent ? Number(raw.bounced) / sent : 0;
  const complaintRate = sent ? Number(raw.complained) / sent : 0;
  return { sent, bounced: Number(raw.bounced), complained: Number(raw.complained), bounceRate, complaintRate, level: sent >= 50 ? reputationLevel(bounceRate, complaintRate) : ("ok" as const) };
}
