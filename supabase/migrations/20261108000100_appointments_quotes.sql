-- =============================================================================
-- RevisaYa · Fase 7 · Citas y presupuestos (docs/CITAS-PRESUPUESTOS.md)
-- Todo aditivo: no se borra ni se modifica ningún dato existente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tipos de correo nuevos: invitación (pendiente de la Fase 2), aviso de
-- solicitud de cita al taller, cita cancelada y presupuesto.
-- -----------------------------------------------------------------------------
alter table public.email_logs drop constraint email_logs_kind_check,
  add constraint email_logs_kind_check check (kind in (
    'reminder', 'booking_received', 'booking_confirmed', 'booking_rejected',
    'booking_rescheduled', 'booking_canceled', 'booking_request', 'quote',
    'invitation', 'test', 'digest', 'usage_alert'));

alter table public.email_templates drop constraint email_templates_kind_check,
  add constraint email_templates_kind_check check (kind in (
    'reminder_service_date', 'reminder_service_km',
    'booking_received', 'booking_confirmed', 'booking_rejected', 'booking_rescheduled', 'booking_canceled'));

-- -----------------------------------------------------------------------------
-- Citas
-- -----------------------------------------------------------------------------
-- Una sola solicitud abierta por aviso: pulsar dos veces el botón del correo
-- (o reenviar el formulario) no crea dos citas.
create unique index appointments_open_per_reminder on public.appointments (reminder_id)
  where reminder_id is not null and status in ('requested', 'confirmed');

-- Ocupación de un hueco: solicitudes (con hueco elegido) y citas confirmadas
-- que se solapan con [p_start, p_end).
create function app.slot_load(p_branch uuid, p_start timestamptz, p_end timestamptz)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
    from public.appointments a
   where a.branch_id = p_branch
     and (
          (a.status = 'requested' and a.requested_slot && tstzrange(p_start, p_end, '[)'))
       or (a.status = 'confirmed' and tstzrange(a.confirmed_start, a.confirmed_end, '[)') && tstzrange(p_start, p_end, '[)'))
     );
$$;
revoke all on function app.slot_load(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function app.slot_load(uuid, timestamptz, timestamptz) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Presupuestos: fechas de envío y de decisión, y caducidad automática.
-- -----------------------------------------------------------------------------
alter table public.quotes
  add column sent_at timestamptz,
  add column decided_at timestamptz;
grant update (sent_at, decided_at) on public.quotes to authenticated;

-- Al pasar a "enviado" se fija la fecha; al aceptarlo o rechazarlo, la decisión.
create function app.stamp_quote_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'sent' then
      new.sent_at := coalesce(new.sent_at, now());
    elsif new.status in ('accepted', 'rejected') then
      new.decided_at := now();
    end if;
  end if;
  return new;
end;
$$;
create trigger quotes_stamp_status before update of status on public.quotes
  for each row execute function app.stamp_quote_status();

-- Los presupuestos enviados cuya validez ha terminado pasan a "caducado"
-- (en la zona horaria de la sucursal). Los borradores no se tocan.
create function private.expire_quotes()
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n int;
begin
  update public.quotes q
     set status = 'expired'
    from public.branches b
    join public.organizations o on o.id = b.organization_id
   where b.id = q.branch_id
     and q.status = 'sent'
     and q.valid_until < (now() at time zone coalesce(b.timezone, o.timezone))::date;
  get diagnostics n = row_count;
  insert into private.job_runs (job_name, finished_at, status, stats)
  values ('expire_quotes', now(), 'succeeded', jsonb_build_object('expired', n));
  return n;
end;
$$;
revoke all on function private.expire_quotes() from public, anon, authenticated;
grant execute on function private.expire_quotes() to service_role;

select cron.schedule('revisaya-expire-quotes', '37 3 * * *', $$select private.expire_quotes()$$);

-- -----------------------------------------------------------------------------
-- Importación R7 (pendiente de la Fase 4): una fila de un vehículo ya
-- registrado puede COMPLETARLO en lugar de omitirse (opción del lote).
-- -----------------------------------------------------------------------------
alter table public.import_rows drop constraint import_rows_action_check;
alter table public.import_rows add constraint import_rows_action_check check (action in (
  'create_customer_and_vehicle', 'attach_to_existing_customer', 'update_existing_vehicle',
  'skip_duplicate', 'skip_empty', 'skip_excluded'));

-- Las lecturas de km de una importación se registran como tales.
drop policy mileage_readings_insert on public.mileage_readings;
create policy mileage_readings_insert on public.mileage_readings for insert to authenticated
  with check (organization_id in (select app.member_orgs())
              and branch_id in (select app.branches_with_permission('vehicles.write', true))
              and source in ('manual', 'appointment', 'import'));

create or replace function app.commit_import(p_batch uuid, p_allow_repeat boolean default false)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_batch public.import_batches;
  v_uid uuid := (select auth.uid());
  v_customers int := 0;
  v_vehicles int := 0;
  v_records int := 0;
  v_attached int := 0;
  v_updated int := 0;
  v_updated_records int := 0;
begin
  -- Bloquea el lote: dos confirmaciones simultáneas se serializan y la segunda
  -- encuentra el lote ya confirmado.
  select * into v_batch from public.import_batches where id = p_batch for update;
  if not found then
    raise exception 'import_not_found' using errcode = 'P0002';
  end if;
  if v_batch.status = 'committed' then
    raise exception 'import_already_committed' using errcode = 'RY006', detail = 'already_committed';
  end if;
  if v_batch.status <> 'validated' or v_batch.error_count > 0 then
    raise exception 'import_has_errors' using errcode = 'RY006', detail = 'has_errors';
  end if;
  if v_batch.expires_at < now() then
    raise exception 'import_expired' using errcode = 'RY006', detail = 'expired';
  end if;
  if not p_allow_repeat and exists (
       select 1 from public.import_batches b
       where b.branch_id = v_batch.branch_id and b.file_sha256 = v_batch.file_sha256
         and b.status = 'committed' and b.id <> v_batch.id) then
    raise exception 'import_repeated' using errcode = 'RY006', detail = 'repeated_file';
  end if;

  -- Filas importables con sus datos normalizados.
  create temporary table _rows on commit drop as
  select r.row_number,
         r.action,
         r.matched_customer_id,
         r.normalized ->> 'customerKey' as customer_key,
         r.normalized ->> 'firstName' as first_name,
         r.normalized ->> 'lastName' as last_name,
         nullif(r.normalized ->> 'email', '') as email,
         nullif(r.normalized ->> 'phone', '') as phone,
         r.normalized ->> 'plate' as plate,
         nullif(r.normalized ->> 'make', '') as make,
         nullif(r.normalized ->> 'model', '') as model,
         (r.normalized ->> 'lastService')::date as last_service,
         (r.normalized ->> 'km')::int as km,
         (r.normalized ->> 'nextService')::date as next_service
  from public.import_rows r
  where r.batch_id = p_batch
    and r.action in ('create_customer_and_vehicle', 'attach_to_existing_customer')
    and jsonb_array_length(r.errors) = 0;

  -- R7: filas que completan un vehículo ya registrado (sin sobrescribir nada).
  create temporary table _updates on commit drop as
  select r.row_number, v.id as vehicle_id, v.customer_id, v.last_service_date, v.current_km,
         nullif(r.normalized ->> 'email', '') as email,
         nullif(r.normalized ->> 'phone', '') as phone,
         nullif(r.normalized ->> 'make', '') as make,
         nullif(r.normalized ->> 'model', '') as model,
         (r.normalized ->> 'lastService')::date as last_service,
         (r.normalized ->> 'km')::int as km,
         (r.normalized ->> 'nextService')::date as next_service
  from public.import_rows r
  join public.vehicles v on v.id = r.matched_vehicle_id and v.branch_id = v_batch.branch_id and v.deleted_at is null
  where r.batch_id = p_batch
    and r.action = 'update_existing_vehicle'
    and jsonb_array_length(r.errors) = 0;

  -- Un cliente nuevo por clave de agrupación (los datos de su primera fila).
  create temporary table _new_customers on commit drop as
  select distinct on (customer_key) customer_key, gen_random_uuid() as id, first_name, last_name, email, phone
  from _rows
  where action = 'create_customer_and_vehicle'
  order by customer_key, row_number;

  insert into public.customers (id, organization_id, branch_id, first_name, last_name, email, phone, source, import_batch_id, created_by)
  select id, v_batch.organization_id, v_batch.branch_id, first_name, last_name, email, phone, 'import', p_batch, v_uid
  from _new_customers;
  get diagnostics v_customers = row_count;

  select count(distinct matched_customer_id) into v_attached from _rows where action = 'attach_to_existing_customer';

  create temporary table _new_vehicles on commit drop as
  select gen_random_uuid() as id,
         coalesce(r.matched_customer_id, c.id) as customer_id,
         r.plate, r.make, r.model, r.km, r.last_service, r.next_service, r.row_number
  from _rows r
  left join _new_customers c on c.customer_key = r.customer_key and r.action = 'create_customer_and_vehicle';

  insert into public.vehicles (id, organization_id, branch_id, customer_id, plate, make, model, current_km, import_batch_id, created_by)
  select id, v_batch.organization_id, v_batch.branch_id, customer_id, plate, make, model, km, p_batch, v_uid
  from _new_vehicles;
  get diagnostics v_vehicles = row_count;

  -- La "última revisión" de cada fila entra en el historial; el trigger calcula
  -- la próxima (la indicada en el archivo o última + intervalo del taller).
  insert into public.maintenance_records
    (organization_id, branch_id, vehicle_id, service_date, km, work_performed, next_recommended_date, created_by)
  select v_batch.organization_id, v_batch.branch_id, id, last_service, km, 'Revisión importada', next_service, v_uid
  from _new_vehicles;
  get diagnostics v_records = row_count;

  -- R7: marca y modelo solo si faltaban; revisión solo si es más reciente que
  -- la última; kilómetros solo si son mayores; correo y teléfono del
  -- propietario solo si los tenía vacíos.
  update public.vehicles v
     set make = coalesce(v.make, u.make), model = coalesce(v.model, u.model)
    from _updates u
   where v.id = u.vehicle_id and ((v.make is null and u.make is not null) or (v.model is null and u.model is not null));

  update public.customers c
     set email = coalesce(c.email, u.email::extensions.citext), phone = coalesce(c.phone, u.phone)
    from (select distinct on (customer_id) customer_id, email, phone from _updates order by customer_id, row_number) u
   where c.id = u.customer_id and c.deleted_at is null
     and ((c.email is null and u.email is not null) or (c.phone is null and u.phone is not null));

  insert into public.maintenance_records
    (organization_id, branch_id, vehicle_id, service_date, km, work_performed, next_recommended_date, created_by)
  select v_batch.organization_id, v_batch.branch_id, vehicle_id, last_service, km, 'Revisión importada', next_service, v_uid
  from _updates
  where last_service > coalesce(last_service_date, date '1900-01-01');
  get diagnostics v_updated_records = row_count;

  -- Kilómetros sin revisión nueva: lectura de importación si son mayores.
  insert into public.mileage_readings (organization_id, branch_id, vehicle_id, km, read_on, source, created_by)
  select v_batch.organization_id, v_batch.branch_id, vehicle_id, km, last_service, 'import', v_uid
  from _updates
  where km is not null and km > coalesce(current_km, -1)
    and not (last_service > coalesce(last_service_date, date '1900-01-01'));
  update public.vehicles v set current_km = u.km
    from _updates u
   where v.id = u.vehicle_id and u.km is not null and u.km > coalesce(v.current_km, -1);

  select count(*) into v_updated from _updates;
  v_records := v_records + v_updated_records;

  update public.import_batches
     set status = 'committed',
         committed_at = now(),
         summary = summary || jsonb_build_object(
           'committed', jsonb_build_object('customers', v_customers, 'attachedCustomers', v_attached,
                                           'vehicles', v_vehicles, 'updatedVehicles', v_updated,
                                           'maintenanceRecords', v_records))
   where id = p_batch;

  return jsonb_build_object('customers', v_customers, 'attachedCustomers', v_attached, 'vehicles', v_vehicles,
                            'updatedVehicles', v_updated, 'maintenanceRecords', v_records);
end;
$$;


-- -----------------------------------------------------------------------------
-- Huecos disponibles para pedir cita (modo "slots"): reglas semanales de la
-- sucursal, en SU zona horaria, sin festivos, con el preaviso mínimo y la
-- ocupación (solicitudes con hueco + citas confirmadas) de cada hueco.
-- -----------------------------------------------------------------------------
create function app.available_slots(p_branch uuid, p_from date, p_days int default 21, p_now timestamptz default now())
returns table (slot_start timestamptz, slot_end timestamptz, capacity int, taken int)
language sql
stable
security definer
set search_path = ''
as $$
  with cfg as (
    select bs.slot_minutes::int as slot_minutes, bs.booking_notice_hours::int as notice_hours,
           coalesce(b.timezone, o.timezone) as tz
      from public.branch_settings bs
      join public.branches b on b.id = bs.branch_id and b.status = 'active'
      join public.organizations o on o.id = b.organization_id and o.status = 'active'
     where bs.branch_id = p_branch and bs.booking_enabled and bs.booking_mode = 'slots'
  ),
  days as (
    select (p_from + i)::date as d from generate_series(0, least(greatest(p_days, 1), 60) - 1) as i
  ),
  starts as (
    select distinct on (st) st, r.capacity::int as capacity, c.slot_minutes, c.notice_hours
      from cfg c
      cross join days dd
      join public.availability_rules r on r.branch_id = p_branch and r.weekday = extract(isodow from dd.d)
      cross join lateral generate_series(dd.d + r.start_time,
                                         dd.d + r.end_time - make_interval(mins => c.slot_minutes),
                                         make_interval(mins => c.slot_minutes)) as g(local_start)
      cross join lateral (select g.local_start at time zone c.tz as st) z
     where not exists (select 1 from public.blackout_dates bd where bd.branch_id = p_branch and bd.day = dd.d)
     order by st, r.capacity desc
  )
  select s.st, s.st + make_interval(mins => s.slot_minutes), s.capacity,
         app.slot_load(p_branch, s.st, s.st + make_interval(mins => s.slot_minutes))
    from starts s
   where s.st >= p_now + make_interval(hours => s.notice_hours)
   order by s.st;
$$;
revoke all on function app.available_slots(uuid, date, int, timestamptz) from public, anon;
grant execute on function app.available_slots(uuid, date, int, timestamptz) to authenticated, service_role;

-- NIF-IVA intracomunitarios de hasta 14 caracteres (p. ej. Francia: 13). Solo
-- amplía lo admitido; ningún dato existente deja de cumplir la regla.
alter table public.organizations drop constraint organizations_tax_id_check,
  add constraint organizations_tax_id_check check (tax_id ~ '^[A-Z0-9]{8,14}$');
