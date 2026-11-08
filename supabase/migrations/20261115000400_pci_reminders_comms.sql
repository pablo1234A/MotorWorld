-- =============================================================================
-- RevisaYa PCI · 4 · Avisos, correos, citas y presupuestos para el sector PCI.
--  · Avisos por instalación (próximas actuaciones de sus equipos), con el mismo
--    motor: planificador idempotente, cola, leases, reintentos y envío. Los
--    avisos de vehículos (heredados) siguen funcionando igual.
--  · Plantillas nuevas: aviso de mantenimiento, servicio finalizado, incidencia
--    detectada y envío de informe.
--  · Citas = solicitudes de visita técnica (instalación y tipo de servicio).
--  · Presupuestos: instalación asociada y líneas de servicio o material.
-- Solo se amplían restricciones y se añaden columnas (no destructiva).
-- =============================================================================

alter table public.reminders alter column vehicle_id drop not null,
  add column installation_id uuid,
  add foreign key (organization_id, branch_id, installation_id)
    references public.installations (organization_id, branch_id, id) on delete cascade;
alter table public.reminders drop constraint reminders_type_check,
  add constraint reminders_type_check check (type in ('service_date', 'service_km', 'installation_due'));
alter table public.reminders add constraint reminders_target_check check (
  (type in ('service_date', 'service_km') and vehicle_id is not null)
  or (type = 'installation_due' and installation_id is not null));
alter table public.reminders drop constraint reminders_skip_reason_check,
  add constraint reminders_skip_reason_check check (skip_reason in (
    'no_email', 'opted_out', 'suppressed', 'quota_exceeded', 'subscription_inactive', 'feature_unavailable',
    'superseded', 'reminders_disabled', 'vehicle_inactive', 'canceled_by_user', 'installation_inactive'));
create unique index reminders_installation_event_unique on public.reminders (installation_id, due_date, offset_days)
  where type = 'installation_due';
create index reminders_installation_idx on public.reminders (installation_id, due_date desc) where installation_id is not null;

alter table public.email_logs drop constraint email_logs_kind_check,
  add constraint email_logs_kind_check check (kind in (
    'reminder', 'booking_received', 'booking_confirmed', 'booking_rejected', 'booking_rescheduled', 'booking_canceled',
    'booking_request', 'quote', 'invitation', 'test', 'digest', 'usage_alert', 'billing', 'welcome',
    'service_completed', 'incident_detected', 'report_sent'));
alter table public.email_logs add column work_order_id uuid, add column installation_id uuid,
  add foreign key (organization_id, branch_id, work_order_id) references public.work_orders (organization_id, branch_id, id) on delete set null (work_order_id),
  add foreign key (organization_id, branch_id, installation_id) references public.installations (organization_id, branch_id, id) on delete set null (installation_id);
alter table public.email_templates drop constraint email_templates_kind_check,
  add constraint email_templates_kind_check check (kind in (
    'reminder_service_date', 'reminder_service_km', 'reminder_maintenance',
    'booking_received', 'booking_confirmed', 'booking_rejected', 'booking_rescheduled', 'booking_canceled',
    'service_completed', 'incident_detected', 'report_sent'));

-- Citas: visita técnica.
alter table public.appointments
  add column installation_id uuid,
  add column service_type text check (service_type in ('periodic_maintenance', 'inspection', 'installation',
                                                       'repair', 'corrective', 'replacement', 'other')),
  add column requester_address text check (char_length(requester_address) <= 200),
  add foreign key (organization_id, branch_id, installation_id)
    references public.installations (organization_id, branch_id, id) on delete set null (installation_id);
grant insert (installation_id, service_type, requester_address) on public.appointments to authenticated;
grant update (installation_id, service_type) on public.appointments to authenticated;

-- Presupuestos: instalación y tipo de línea.
alter table public.quotes add column installation_id uuid,
  add foreign key (organization_id, branch_id, installation_id)
    references public.installations (organization_id, branch_id, id) on delete set null (installation_id);
alter table public.quote_items add column line_kind text not null default 'service' check (line_kind in ('service', 'material', 'other'));
grant insert (installation_id) on public.quotes to authenticated;
grant update (installation_id) on public.quotes to authenticated;
grant insert (line_kind) on public.quote_items to authenticated;
grant update (line_kind) on public.quote_items to authenticated;

create or replace function private.plan_reminders(p_now timestamptz default now(), p_horizon_days int default 2)
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
  v_inst int;
  v_inst_superseded int;
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

  -- 4. PCI: un aviso por INSTALACIÓN con la próxima actuación de sus equipos
  --    (la más próxima de todas las operaciones activas), a su cliente. Si la
  --    fecha cambia (se registra una actuación) o la instalación deja de estar
  --    activa, el aviso pendiente se cancela y se planifica el nuevo.
  --    Se avisa de la PRÓXIMA fecha futura: lo ya vencido se muestra en el
  --    panel como vencido (no se reenvían avisos de fechas pasadas).
  with current_due as (
    select i.id as installation_id, min(s.next_due_on) as due
      from public.installations i
      join public.organizations o on o.id = i.organization_id
      join public.equipment e on e.installation_id = i.id and e.deleted_at is null and e.status = 'in_service'
      join public.equipment_action_schedules s on s.equipment_id = e.id
     where s.next_due_on >= (p_now at time zone o.timezone)::date
     group by i.id
  )
  update public.reminders r
     set status = 'canceled', skip_reason = 'superseded', locked_until = null, locked_by = null
    from public.installations i
    left join current_due d on d.installation_id = i.id
   where r.installation_id = i.id and r.type = 'installation_due'
     and r.status in ('scheduled', 'retrying')
     and (i.deleted_at is not null or i.status <> 'active' or d.due is distinct from r.due_date);
  get diagnostics v_inst_superseded = row_count;

  with due as (
    select i.id as installation_id, i.organization_id, i.branch_id, i.customer_id, min(s.next_due_on) as due
      from public.installations i
      join public.equipment e on e.installation_id = i.id and e.deleted_at is null and e.status = 'in_service'
      join public.equipment_action_schedules s on s.equipment_id = e.id
      join public.organizations o2 on o2.id = i.organization_id
     where i.deleted_at is null and i.status = 'active' and s.next_due_on >= (p_now at time zone o2.timezone)::date
     group by i.id
  ),
  eligible as (
    select d.*, bs.offsets_days, (p_now at time zone coalesce(b.timezone, o.timezone))::date as today
      from due d
      join public.customers c on c.id = d.customer_id
      join public.branches b on b.id = d.branch_id
      join public.organizations o on o.id = d.organization_id
      join public.branch_settings bs on bs.branch_id = d.branch_id
      join public.subscriptions s on s.organization_id = d.organization_id
      join public.plans p on p.code = s.plan_code
     where c.deleted_at is null and b.status = 'active' and o.status = 'active'
       and bs.reminders_enabled
       and app.subscription_is_active(s.status, s.past_due_since)
       and 'date_reminders' = any (p.features)
  ),
  candidates as (
    select e.*, off as offset_days, e.due - off as target
      from eligible e cross join unnest(e.offsets_days) as off
     where e.due >= e.today
  ),
  chosen as (
    select c.* from candidates c
     where c.target <= c.today + p_horizon_days
       and (c.target >= c.today
         or (c.offset_days = (select min(c2.offset_days) from candidates c2
                               where c2.installation_id = c.installation_id and c2.target < c2.today)
             and not exists (select 1 from candidates c3
                              where c3.installation_id = c.installation_id and c3.target between c3.today and c3.today + 3)))
  )
  insert into public.reminders (organization_id, branch_id, customer_id, installation_id, type, due_date, offset_days, scheduled_for)
  select organization_id, branch_id, customer_id, installation_id, 'installation_due', due, offset_days,
         private.next_send_slot(branch_id, target, due, p_now)
    from chosen
  on conflict do nothing;
  get diagnostics v_inst = row_count;

  v_stats := jsonb_build_object('superseded', v_superseded + v_inst_superseded, 'created_date', v_date, 'created_km', v_km,
                                'created_installation', v_inst);
  update private.job_runs set finished_at = now(), status = 'succeeded', stats = v_stats where id = v_run;
  return v_stats;
end;
$$;
