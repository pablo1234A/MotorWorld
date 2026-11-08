-- =============================================================================
-- RevisaYa · Informes (Fase 9, plan Max) y contadores básicos (todos los planes, P16).
--
-- Las funciones son SECURITY DEFINER y hacen ellas mismas el control de acceso:
--   · el taller tiene que ser del usuario (app.member_orgs) y tener la
--     funcionalidad 'reports' (app.assert_feature);
--   · solo cuentan las sucursales en las que el usuario tiene 'reports.read'
--     (los administradores, todas las suyas).
-- "Volvió tras un aviso" (P17): el vehículo tiene un registro de historial en
-- los 90 días siguientes a un aviso enviado. Es una coincidencia, no una
-- causalidad, y así se presenta.
-- Sin cambios en tablas: solo funciones (no destructiva).
-- =============================================================================

create function app.report_branches(p_org uuid, p_branch uuid)
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v uuid[];
begin
  if p_org is null or p_org not in (select app.member_orgs()) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  perform app.assert_feature(p_org, 'reports');
  select coalesce(array_agg(b.id), '{}') into v
    from public.branches b
   where b.organization_id = p_org
     and b.id in (select app.branches_with_permission('reports.read', false))
     and (p_branch is null or b.id = p_branch);
  if cardinality(v) = 0 then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  return v;
end;
$$;

create function app.report_check_range(p_from date, p_to date)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 731 then
    raise exception 'invalid_report_range' using errcode = '22023';
  end if;
end;
$$;

-- Resumen y serie mensual del periodo [p_from, p_to] (fechas locales del taller).
create function app.report_summary(p_org uuid, p_from date, p_to date, p_branch uuid default null)
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
       and e.kind not in ('invitation', 'digest', 'usage_alert', 'billing')
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

-- Clientes que no han vuelto: vehículos activos con un aviso enviado en el
-- periodo y sin ningún registro de historial desde ese aviso.
create function app.report_not_returned(p_org uuid, p_from date, p_to date, p_branch uuid default null,
                                        p_limit integer default 50, p_offset integer default 0)
returns table (vehicle_id uuid, customer_id uuid, customer_name text, email text, phone text, plate text,
               vehicle text, next_service_date date, last_reminder_on date, days_since integer, total bigint)
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
  with last_sent as (
    select r.vehicle_id, max((r.sent_at at time zone v_tz)::date) as sent_day
      from public.reminders r
     where r.organization_id = p_org and r.branch_id = any (v_branches)
       and r.sent_at is not null and r.status in ('sent', 'delivered')
       and (r.sent_at at time zone v_tz)::date between p_from and p_to
     group by r.vehicle_id
  ),
  rows as (
    select v.id as vehicle_id, c.id as customer_id,
           btrim(c.first_name || ' ' || coalesce(c.last_name, '')) as customer_name,
           c.email::text as email, c.phone, v.plate::text as plate,
           nullif(btrim(coalesce(v.make, '') || ' ' || coalesce(v.model, '')), '') as vehicle,
           v.next_service_date, l.sent_day as last_reminder_on,
           ((now() at time zone v_tz)::date - l.sent_day)::integer as days_since
      from last_sent l
      join public.vehicles v on v.id = l.vehicle_id and v.deleted_at is null and v.status = 'active'
      join public.customers c on c.id = v.customer_id and c.deleted_at is null
     where not exists (select 1 from public.maintenance_records m
                        where m.organization_id = p_org and m.vehicle_id = v.id and m.service_date >= l.sent_day)
  )
  select r.*, count(*) over () as total from rows r
   order by r.last_reminder_on, r.plate
   limit least(greatest(coalesce(p_limit, 50), 1), 5000) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Revisiones pendientes: vencidas y las que vencen hasta p_until.
create function app.report_pending_services(p_org uuid, p_until date, p_branch uuid default null,
                                            p_limit integer default 50, p_offset integer default 0)
returns table (vehicle_id uuid, customer_id uuid, customer_name text, email text, phone text, plate text,
               vehicle text, next_service_date date, overdue boolean, last_reminder_on date, total bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_branches uuid[] := app.report_branches(p_org, p_branch);
  v_tz text;
begin
  if p_until is null then
    raise exception 'invalid_report_range' using errcode = '22023';
  end if;
  select o.timezone into v_tz from public.organizations o where o.id = p_org;
  return query
  select v.id, c.id, btrim(c.first_name || ' ' || coalesce(c.last_name, '')), c.email::text, c.phone, v.plate::text,
         nullif(btrim(coalesce(v.make, '') || ' ' || coalesce(v.model, '')), ''),
         v.next_service_date, v.next_service_date < (now() at time zone v_tz)::date,
         (select max((r.sent_at at time zone v_tz)::date) from public.reminders r
           where r.vehicle_id = v.id and r.sent_at is not null and r.status in ('sent', 'delivered')),
         count(*) over ()
    from public.vehicles v
    join public.customers c on c.id = v.customer_id and c.deleted_at is null
   where v.organization_id = p_org and v.branch_id = any (v_branches)
     and v.deleted_at is null and v.status = 'active'
     and v.next_service_date is not null and v.next_service_date <= p_until
   order by v.next_service_date, v.plate
   limit least(greatest(coalesce(p_limit, 50), 1), 5000) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Correos enviados a clientes en el periodo.
create function app.report_emails(p_org uuid, p_from date, p_to date, p_branch uuid default null,
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
     and e.kind not in ('invitation', 'digest', 'usage_alert', 'billing')
   order by e.created_at desc, e.id desc
   limit least(greatest(coalesce(p_limit, 50), 1), 5000) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Contadores básicos para el inicio (todos los planes, P16): últimos 30 días,
-- en las sucursales que ve el usuario.
create function app.dashboard_activity(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_branches uuid[];
  v_tz text;
  v_today date;
begin
  if p_org is null or p_org not in (select app.member_orgs()) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  select coalesce(array_agg(b), '{}') into v_branches from app.accessible_branches() b;
  select o.timezone into v_tz from public.organizations o where o.id = p_org;
  v_today := (now() at time zone v_tz)::date;
  return jsonb_build_object(
    'reminders_sent_30d', (select count(*) from public.reminders r
                            where r.organization_id = p_org and r.branch_id = any (v_branches)
                              and r.sent_at is not null and r.status in ('sent', 'delivered', 'bounced', 'complained')
                              and (r.sent_at at time zone v_tz)::date > v_today - 30),
    'appointments_30d', (select count(*) from public.appointments a
                          where a.organization_id = p_org and a.branch_id = any (v_branches)
                            and (a.created_at at time zone v_tz)::date > v_today - 30),
    -- Vehículos que volvieron (historial) en los últimos 30 días tras un aviso de los 90 días anteriores.
    'returned_30d', (select count(distinct m.vehicle_id) from public.maintenance_records m
                      where m.organization_id = p_org and m.branch_id = any (v_branches)
                        and m.service_date > v_today - 30 and m.service_date <= v_today
                        and exists (select 1 from public.reminders r
                                     where r.vehicle_id = m.vehicle_id and r.sent_at is not null
                                       and r.status in ('sent', 'delivered')
                                       and (r.sent_at at time zone v_tz)::date between m.service_date - 90 and m.service_date))
  );
end;
$$;

revoke all on function app.report_branches(uuid, uuid), app.report_summary(uuid, date, date, uuid),
  app.report_not_returned(uuid, date, date, uuid, integer, integer),
  app.report_pending_services(uuid, date, uuid, integer, integer),
  app.report_emails(uuid, date, date, uuid, integer, integer), app.dashboard_activity(uuid) from public, anon;
grant execute on function app.report_check_range(date, date), app.report_branches(uuid, uuid),
  app.report_summary(uuid, date, date, uuid),
  app.report_not_returned(uuid, date, date, uuid, integer, integer),
  app.report_pending_services(uuid, date, uuid, integer, integer),
  app.report_emails(uuid, date, date, uuid, integer, integer), app.dashboard_activity(uuid) to authenticated;
