-- =============================================================================
-- RevisaYa · Fase 11: reputación del correo (rebotes y quejas) con alertas.
-- Umbrales (los de Gmail/Yahoo para remitentes masivos y los de los
-- proveedores): aviso con rebotes > 4 % o quejas > 0,1 %; crítico con rebotes
-- >= 8 % o quejas >= 0,3 %. Solo correos a clientes, mínimo 50 envíos.
-- Además, los informes dejan fuera el correo de bienvenida (correo al taller).
-- Solo añade objetos y redefine funciones (no destructiva).
-- =============================================================================

create function app.is_customer_email(p_kind text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_kind not in ('invitation', 'digest', 'usage_alert', 'billing', 'welcome');
$$;
grant execute on function app.is_customer_email(text) to authenticated, service_role;

create or replace function app.report_summary(p_org uuid, p_from date, p_to date, p_branch uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_branches uuid[] := app.report_branches(p_org, p_branch);
  v_tz text;
  v jsonb;
begin
  perform app.report_check_range(p_from, p_to);
  select timezone into v_tz from public.organizations where id = p_org;

  with sent as (
    select r.id, r.vehicle_id, (r.sent_at at time zone v_tz)::date as sent_day
      from public.reminders r
     where r.organization_id = p_org and r.branch_id = any (v_branches)
       and r.sent_at is not null
       and r.status in ('sent', 'delivered', 'bounced', 'complained')
       and (r.sent_at at time zone v_tz)::date between p_from and p_to
  ),
  returned as (
    select s.id, s.vehicle_id, s.sent_day from sent s
     where exists (select 1 from public.maintenance_records m
                    where m.organization_id = p_org and m.vehicle_id = s.vehicle_id
                      and m.service_date between s.sent_day and s.sent_day + 90)
  ),
  appts as (
    select a.id, a.status, a.reminder_id, (a.created_at at time zone v_tz)::date as day
      from public.appointments a
     where a.organization_id = p_org and a.branch_id = any (v_branches)
       and (a.created_at at time zone v_tz)::date between p_from and p_to
  ),
  mails as (
    select e.kind, e.status, (e.created_at at time zone v_tz)::date as day
      from public.email_logs e
     where e.organization_id = p_org and e.branch_id = any (v_branches)
       and (e.created_at at time zone v_tz)::date between p_from and p_to
       and app.is_customer_email(e.kind)
  ),
  months as (
    select m::date as month from generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month') m
  )
  select jsonb_build_object(
    'reminders_sent', (select count(*) from sent),
    'reminders_bounced', (select count(*) from public.reminders r where r.id in (select id from sent) and r.status in ('bounced', 'complained')),
    'vehicles_reminded', (select count(distinct vehicle_id) from sent),
    'vehicles_returned', (select count(distinct vehicle_id) from returned),
    'appointments_requested', (select count(*) from appts),
    'appointments_from_reminders', (select count(*) from appts where reminder_id is not null),
    'appointments_confirmed', (select count(*) from appts where status in ('confirmed', 'completed', 'no_show')),
    'appointments_completed', (select count(*) from appts where status = 'completed'),
    'emails', coalesce((select jsonb_object_agg(kind, n) from (select kind, count(*) as n from mails group by kind) k), '{}'::jsonb),
    'emails_total', (select count(*) from mails),
    'emails_delivered', (select count(*) from mails where status = 'delivered'),
    'emails_bounced', (select count(*) from mails where status = 'bounced'),
    'emails_complained', (select count(*) from mails where status = 'complained'),
    'emails_failed', (select count(*) from mails where status = 'failed'),
    'months', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'month', to_char(mo.month, 'YYYY-MM'),
               'reminders', (select count(*) from sent s where date_trunc('month', s.sent_day) = mo.month),
               'returned', (select count(distinct vehicle_id) from returned x where date_trunc('month', x.sent_day) = mo.month),
               'appointments', (select count(*) from appts a where date_trunc('month', a.day) = mo.month),
               'emails', (select count(*) from mails e where date_trunc('month', e.day) = mo.month)
             ) order by mo.month), '[]'::jsonb)
        from months mo)
  ) into v;
  return v;
end;
$$;


create or replace function app.report_emails(p_org uuid, p_from date, p_to date, p_branch uuid default null,
                                  p_limit integer default 50, p_offset integer default 0)
returns table (sent_at timestamptz, kind text, to_email text, subject text, status text, plate text, total bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_branches uuid[] := app.report_branches(p_org, p_branch);
  v_tz text;
begin
  perform app.report_check_range(p_from, p_to);
  select o.timezone into v_tz from public.organizations o where o.id = p_org;
  return query
  select e.created_at, e.kind, e.to_email::text, e.subject, e.status, v.plate::text, count(*) over ()
    from public.email_logs e
    left join public.vehicles v on v.id = e.vehicle_id
   where e.organization_id = p_org and e.branch_id = any (v_branches)
     and (e.created_at at time zone v_tz)::date between p_from and p_to
     and app.is_customer_email(e.kind)
   order by e.created_at desc, e.id desc
   limit least(greatest(coalesce(p_limit, 50), 1), 5000) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;


create table private.email_reputation_alerts (
  id               bigint generated always as identity primary key,
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  level            text not null check (level in ('warning', 'critical')),
  sent             integer not null,
  bounce_rate      numeric(6, 4) not null,
  complaint_rate   numeric(6, 4) not null,
  created_at       timestamptz not null default now()
);
create index email_reputation_alerts_org_idx on private.email_reputation_alerts (organization_id, created_at desc);
revoke all on private.email_reputation_alerts from public, anon, authenticated;
grant select, insert on private.email_reputation_alerts to service_role;

-- Tasas por taller en los últimos p_days días (correos a clientes).
create function private.email_reputation(p_days integer default 7, p_min_sent integer default 50)
returns table (organization_id uuid, sent bigint, bounced bigint, complained bigint, bounce_rate numeric, complaint_rate numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select e.organization_id, count(*) as sent,
         count(*) filter (where e.status = 'bounced' and coalesce(e.bounce_type, 'hard') <> 'soft') as bounced,
         count(*) filter (where e.status = 'complained') as complained,
         round(count(*) filter (where e.status = 'bounced' and coalesce(e.bounce_type, 'hard') <> 'soft')::numeric / count(*), 4),
         round(count(*) filter (where e.status = 'complained')::numeric / count(*), 4)
    from public.email_logs e
   where e.created_at > now() - make_interval(days => p_days)
     and app.is_customer_email(e.kind)
     and e.status <> 'failed'
   group by e.organization_id
  having count(*) >= p_min_sent;
$$;
revoke all on function private.email_reputation(integer, integer) from public, anon, authenticated;

-- Para el panel del taller (Configuración → Correo): últimos 30 días.
create function app.org_email_reputation(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if p_org is null or p_org not in (select app.admin_orgs()) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  select jsonb_build_object(
           'sent', count(*),
           'bounced', count(*) filter (where e.status = 'bounced' and coalesce(e.bounce_type, 'hard') <> 'soft'),
           'complained', count(*) filter (where e.status = 'complained'))
    into v
    from public.email_logs e
   where e.organization_id = p_org and e.created_at > now() - interval '30 days'
     and app.is_customer_email(e.kind) and e.status <> 'failed';
  return v;
end;
$$;
revoke all on function app.org_email_reputation(uuid) from public, anon;
grant execute on function app.org_email_reputation(uuid) to authenticated;
