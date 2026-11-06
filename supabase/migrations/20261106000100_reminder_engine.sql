-- =============================================================================
-- RevisaYa · Fase 5 · Motor de recordatorios (docs/AUTOMATIZACIONES.md)
--
--  private.next_send_slot      · cuándo enviar: día permitido y ventana horaria
--  private.plan_reminders      · planificador (pg_cron, cada hora): crea los
--                                recordatorios que tocan, idempotentes, y
--                                cancela los que han quedado obsoletos
--  private.claim_reminders     · el dispatcher reclama un lote (SKIP LOCKED,
--                                lease y reparto justo entre talleres)
--  private.release_expired_reminder_leases · recuperación tras una caída
--
-- El envío (plantilla, proveedor de correo, registro) lo hace el dispatcher en
-- TypeScript (src/server/reminders/dispatcher.ts).
-- =============================================================================

-- Avisos por kilometraje: uno por ciclo de mantenimiento (última revisión).
alter table public.reminders add column cycle_anchor date;
create unique index reminders_km_cycle_unique on public.reminders (vehicle_id, cycle_anchor) where type = 'service_km';

-- Adaptador SMTP genérico (Amazon SES por SMTP, Mailpit en local): se amplía la
-- lista de proveedores admitidos en el registro de envíos (no destructivo:
-- solo acepta un valor más).
alter table public.email_logs drop constraint email_logs_provider_check,
  add constraint email_logs_provider_check check (provider in ('resend', 'ses', 'sendgrid', 'smtp'));
alter table public.email_events drop constraint email_events_provider_check,
  add constraint email_events_provider_check check (provider in ('resend', 'ses', 'sendgrid', 'smtp'));

-- -----------------------------------------------------------------------------
-- ¿Se puede enviar ese día en esa sucursal? (días de la semana y festivos)
-- -----------------------------------------------------------------------------
create function private.is_send_day(p_branch uuid, p_day date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select extract(isodow from p_day)::smallint = any (bs.send_weekdays)
     and not exists (select 1 from public.blackout_dates bd where bd.branch_id = p_branch and bd.day = p_day)
  from public.branch_settings bs
  where bs.branch_id = p_branch;
$$;

-- -----------------------------------------------------------------------------
-- Momento de envío para un aviso cuyo día ideal es p_target (vencimiento p_due):
--  1. Día ideal; si no se puede enviar ese día, se ADELANTA al día permitido
--     anterior (el aviso llega antes de la revisión, nunca después).
--  2. Si ese día ya pasó, el primer día permitido desde hoy (sin pasar del
--     vencimiento si es posible).
--  3. A la hora de inicio de la ventana, en la zona horaria del taller; si hoy
--     ya está dentro de la ventana, ahora; si ya pasó, el siguiente día permitido.
-- -----------------------------------------------------------------------------
create function private.next_send_slot(p_branch uuid, p_target date, p_due date, p_now timestamptz default now())
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tz text;
  v_start time;
  v_end time;
  v_local timestamp;
  v_today date;
  v_day date := p_target;
  i int := 0;
begin
  select coalesce(b.timezone, o.timezone), bs.send_window_start, bs.send_window_end
    into v_tz, v_start, v_end
  from public.branches b
  join public.organizations o on o.id = b.organization_id
  join public.branch_settings bs on bs.branch_id = b.id
  where b.id = p_branch;

  v_local := p_now at time zone v_tz;
  v_today := v_local::date;

  while v_day >= v_today and not private.is_send_day(p_branch, v_day) and i < 14 loop
    v_day := v_day - 1;
    i := i + 1;
  end loop;

  if v_day < v_today then
    v_day := v_today;
    i := 0;
    while not private.is_send_day(p_branch, v_day) and i < 14 loop
      v_day := v_day + 1;
      i := i + 1;
    end loop;
  end if;

  if v_day = v_today then
    if v_local::time > v_end then
      v_day := v_day + 1;
      i := 0;
      while not private.is_send_day(p_branch, v_day) and i < 14 loop
        v_day := v_day + 1;
        i := i + 1;
      end loop;
    elsif v_local::time >= v_start then
      return p_now;
    end if;
  end if;

  return (v_day + v_start) at time zone v_tz;
end;
$$;

-- -----------------------------------------------------------------------------
-- Planificador
-- -----------------------------------------------------------------------------
create function private.plan_reminders(p_now timestamptz default now(), p_horizon_days int default 2)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run bigint;
  v_superseded int;
  v_date int;
  v_km int;
  v_stats jsonb;
begin
  insert into private.job_runs (job_name) values ('plan_reminders') returning id into v_run;

  -- 1. Recordatorios pendientes que ya no corresponden: la fecha de revisión
  --    cambió (se registró una revisión o se editó), el vehículo ya no está
  --    activo, o empezó otro ciclo (km).
  update public.reminders r
     set status = 'canceled', skip_reason = 'superseded', locked_until = null, locked_by = null
    from public.vehicles v
   where r.vehicle_id = v.id
     and r.status in ('scheduled', 'retrying')
     and (
          v.deleted_at is not null or v.status <> 'active'
       or (r.type = 'service_date' and v.next_service_date is distinct from r.due_date)
       or (r.type = 'service_km' and v.last_service_date is distinct from r.cycle_anchor)
     );
  get diagnostics v_superseded = row_count;

  -- 2. Avisos por fecha.
  with eligible as (
    select v.id as vehicle_id, v.organization_id, v.branch_id, v.customer_id, v.next_service_date as due,
           bs.offsets_days,
           (p_now at time zone coalesce(b.timezone, o.timezone))::date as today
    from public.vehicles v
    join public.customers c on c.id = v.customer_id
    join public.branches b on b.id = v.branch_id
    join public.organizations o on o.id = v.organization_id
    join public.branch_settings bs on bs.branch_id = v.branch_id
    join public.subscriptions s on s.organization_id = v.organization_id
    join public.plans p on p.code = s.plan_code
    where v.status = 'active' and v.deleted_at is null and c.deleted_at is null
      and b.status = 'active' and o.status = 'active'
      and bs.reminders_enabled
      and app.subscription_is_active(s.status, s.past_due_since)
      and 'date_reminders' = any (p.features)
      and v.next_service_date is not null
  ),
  candidates as (
    select e.*, off as offset_days, e.due - off as target
    from eligible e
    cross join unnest(e.offsets_days) as off
    where e.due >= e.today
  ),
  chosen as (
    select c.* from candidates c
    where c.target <= c.today + p_horizon_days
      and (
            c.target >= c.today
            -- Aviso perdido (alta tardía, importación, planificador parado): solo el
            -- más reciente de los que ya pasaron, una vez, y solo si no hay otro
            -- aviso previsto en los próximos 3 días (no dos correos seguidos).
         or (c.offset_days = (select min(c2.offset_days) from candidates c2
                              where c2.vehicle_id = c.vehicle_id and c2.target < c2.today)
             and not exists (select 1 from candidates c3
                             where c3.vehicle_id = c.vehicle_id and c3.target between c3.today and c3.today + 3))
      )
  )
  insert into public.reminders (organization_id, branch_id, customer_id, vehicle_id, type, due_date, offset_days, scheduled_for)
  select organization_id, branch_id, customer_id, vehicle_id, 'service_date', due, offset_days,
         private.next_send_slot(branch_id, target, due, p_now)
  from chosen
  on conflict do nothing;
  get diagnostics v_date = row_count;

  -- 3. Avisos por kilometraje (plan Max o superior). Estimación a partir del
  --    ritmo de km entre lecturas separadas al menos 30 días (5–300 km/día).
  with eligible as (
    select v.id as vehicle_id, v.organization_id, v.branch_id, v.customer_id,
           v.last_service_date, v.next_service_date,
           coalesce(v.next_service_km, v.last_service_km + bs.default_interval_km) as target_km,
           bs.km_offset_before,
           (p_now at time zone coalesce(b.timezone, o.timezone))::date as today
    from public.vehicles v
    join public.customers c on c.id = v.customer_id
    join public.branches b on b.id = v.branch_id
    join public.organizations o on o.id = v.organization_id
    join public.branch_settings bs on bs.branch_id = v.branch_id
    join public.subscriptions s on s.organization_id = v.organization_id
    join public.plans p on p.code = s.plan_code
    where v.status = 'active' and v.deleted_at is null and c.deleted_at is null
      and b.status = 'active' and o.status = 'active'
      and bs.reminders_enabled and bs.km_reminders_enabled
      and app.subscription_is_active(s.status, s.past_due_since)
      and 'km_reminders' = any (p.features)
      and v.last_service_date is not null
  ),
  last_reading as (
    select distinct on (m.vehicle_id) m.vehicle_id, m.km, m.read_on
    from public.mileage_readings m join eligible e on e.vehicle_id = m.vehicle_id
    order by m.vehicle_id, m.read_on desc, m.created_at desc
  ),
  prev_reading as (
    select distinct on (m.vehicle_id) m.vehicle_id, m.km, m.read_on
    from public.mileage_readings m join last_reading l on l.vehicle_id = m.vehicle_id
    where m.read_on <= l.read_on - 30
    order by m.vehicle_id, m.read_on desc, m.created_at desc
  ),
  estimate as (
    select e.*, l.km as last_km, l.read_on as last_on,
           (l.km - p.km)::numeric / (l.read_on - p.read_on) as per_day
    from eligible e
    join last_reading l on l.vehicle_id = e.vehicle_id
    join prev_reading p on p.vehicle_id = e.vehicle_id
    where l.km > p.km and e.target_km is not null
  ),
  dated as (
    select x.*,
           greatest(x.today,
                    x.last_on + ceil(greatest(x.target_km - x.km_offset_before - x.last_km, 0) / x.per_day)::int) as est_date
    from estimate x
    where x.per_day between 5 and 300
  )
  insert into public.reminders (organization_id, branch_id, customer_id, vehicle_id, type, due_date, offset_days, cycle_anchor, scheduled_for)
  select d.organization_id, d.branch_id, d.customer_id, d.vehicle_id, 'service_km', d.est_date, 0, d.last_service_date,
         private.next_send_slot(d.branch_id, d.est_date, d.est_date + 30, p_now)
  from dated d
  where d.est_date <= d.today + p_horizon_days
    -- Solo si los km llegan antes que la fecha (si no, ya avisa el aviso por fecha).
    and (d.next_service_date is null or d.est_date < d.next_service_date - 7)
    -- Y si en este ciclo no se ha enviado ya un aviso por fecha.
    and not exists (select 1 from public.reminders r
                    where r.vehicle_id = d.vehicle_id and r.type = 'service_date'
                      and r.due_date = d.next_service_date
                      and r.status in ('sent', 'delivered', 'processing'))
  on conflict do nothing;
  get diagnostics v_km = row_count;

  v_stats := jsonb_build_object('superseded', v_superseded, 'created_date', v_date, 'created_km', v_km);
  update private.job_runs set finished_at = now(), status = 'succeeded', stats = v_stats where id = v_run;
  return v_stats;
end;
$$;

-- -----------------------------------------------------------------------------
-- Reclamar un lote para enviar (varios dispatchers en paralelo no se pisan).
-- Reparto justo: como mucho p_per_org recordatorios de un mismo taller por lote.
-- -----------------------------------------------------------------------------
create function private.claim_reminders(p_worker text, p_limit int default 100, p_per_org int default 20,
                                        p_lease interval default interval '5 minutes')
returns setof uuid
language sql
volatile
security definer
set search_path = ''
as $$
  with locked as (
    select r.id, r.organization_id, coalesce(r.next_attempt_at, r.scheduled_for) as due_at
    from public.reminders r
    where (r.status = 'scheduled' and r.scheduled_for <= now())
       or (r.status = 'retrying' and r.next_attempt_at <= now())
    order by coalesce(r.next_attempt_at, r.scheduled_for)
    limit p_limit * 4
    for update skip locked
  ),
  picked as (
    select id from (
      select id, due_at, row_number() over (partition by organization_id order by due_at) as rn from locked
    ) x
    where rn <= p_per_org
    order by due_at
    limit p_limit
  )
  update public.reminders r
     set status = 'processing', locked_until = now() + p_lease, locked_by = p_worker, attempts = r.attempts + 1
    from picked
   where r.id = picked.id
  returning r.id;
$$;

-- -----------------------------------------------------------------------------
-- Recuperación: un recordatorio "processing" con el lease vencido (proceso
-- caído) vuelve a la cola. El dispatcher comprobará email_logs antes de
-- reenviar y usa la misma clave de idempotencia con el proveedor.
-- -----------------------------------------------------------------------------
create function private.release_expired_reminder_leases()
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n int;
begin
  update public.reminders
     set status = case when attempts >= max_attempts then 'failed' else 'retrying' end,
         next_attempt_at = case when attempts >= max_attempts then null else now() end,
         last_error = 'lease_expired',
         locked_until = null, locked_by = null
   where status = 'processing' and locked_until < now();
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function private.is_send_day(uuid, date), private.next_send_slot(uuid, date, date, timestamptz),
  private.plan_reminders(timestamptz, int), private.claim_reminders(text, int, int, interval),
  private.release_expired_reminder_leases() from public, anon, authenticated;
grant execute on function private.is_send_day(uuid, date), private.next_send_slot(uuid, date, date, timestamptz),
  private.plan_reminders(timestamptz, int), private.claim_reminders(text, int, int, interval),
  private.release_expired_reminder_leases() to service_role;

-- -----------------------------------------------------------------------------
-- Programación
--  · Planificador cada hora (minuto 5): cada sucursal recibe sus avisos el día
--    que toca a la hora de su ventana, en su zona horaria.
--  · Recuperación de leases cada 5 minutos.
--  · El dispatcher (TypeScript) lo invoca el hosting cada minuto
--    (vercel.json) o, si se configura, pg_net desde aquí (ver DESPLIEGUE).
-- -----------------------------------------------------------------------------
select cron.schedule('revisaya-plan-reminders', '5 * * * *', $$select private.plan_reminders()$$);
select cron.schedule('revisaya-release-leases', '*/5 * * * *', $$select private.release_expired_reminder_leases()$$);
