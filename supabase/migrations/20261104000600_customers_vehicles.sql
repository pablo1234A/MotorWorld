-- =============================================================================
-- RevisaYa · 0600 · Clientes, vehículos, historial de mantenimiento y km
-- =============================================================================

-- -----------------------------------------------------------------------------
-- customers
-- -----------------------------------------------------------------------------
create table public.customers (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null,
  branch_id          uuid not null,
  first_name         text not null check (char_length(btrim(first_name)) between 1 and 80),
  last_name          text not null default '' check (char_length(last_name) <= 120),
  email              extensions.citext check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone              text check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  source             text not null default 'manual'
                     check (source in ('manual', 'import', 'booking_page', 'api', 'walk_in', 'referral', 'other')),
  notes              text check (char_length(notes) <= 5000),
  reminders_opt_out  boolean not null default false,
  opted_out_at       timestamptz,
  import_batch_id    uuid,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  foreign key (organization_id, branch_id) references public.branches (organization_id, id) on delete restrict,
  constraint customers_tenant_key unique (organization_id, branch_id, id)
);
create index customers_branch_created_idx
  on public.customers (organization_id, branch_id, created_at desc) where deleted_at is null;
create index customers_email_idx on public.customers (organization_id, email) where email is not null;
create index customers_name_trgm_idx on public.customers
  using gin ((lower(first_name || ' ' || last_name)) extensions.gin_trgm_ops);
create index customers_phone_idx on public.customers (organization_id, phone) where phone is not null;

create trigger customers_updated_at before update on public.customers
  for each row execute function app.set_updated_at();
create trigger customers_tenant_immutable before update on public.customers
  for each row execute function app.forbid_tenant_change();

-- -----------------------------------------------------------------------------
-- vehicles
-- -----------------------------------------------------------------------------
create table public.vehicles (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null,
  branch_id            uuid not null,
  customer_id          uuid not null,
  plate                text not null check (char_length(plate) between 2 and 20),
  plate_normalized     text generated always as (app.normalize_plate(plate)) stored
                       check (plate_normalized ~ '^[A-Z0-9]{2,12}$'),
  make                 text check (char_length(make) <= 60),
  model                text check (char_length(model) <= 60),
  vin                  text check (vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  current_km           integer check (current_km between 0 and 2000000),
  km_updated_at        timestamptz,
  last_service_date    date,
  last_service_km      integer check (last_service_km between 0 and 2000000),
  next_service_date    date,
  next_service_km      integer check (next_service_km between 0 and 2000000),
  next_service_source  text not null default 'computed' check (next_service_source in ('manual', 'computed', 'import')),
  status               text not null default 'active' check (status in ('active', 'inactive', 'sold', 'scrapped')),
  import_batch_id      uuid,
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  -- El vehículo solo puede pertenecer a un cliente de SU organización y sucursal.
  foreign key (organization_id, branch_id, customer_id)
    references public.customers (organization_id, branch_id, id) on delete restrict,
  constraint vehicles_tenant_key unique (organization_id, branch_id, id),
  constraint vehicles_next_after_last check (
    next_service_date is null or last_service_date is null or next_service_date > last_service_date)
);
-- Matrícula única por sucursal (P2). Puede repetirse en otras organizaciones.
create unique index vehicles_plate_unique
  on public.vehicles (branch_id, plate_normalized) where deleted_at is null;
create index vehicles_customer_idx on public.vehicles (customer_id);
create index vehicles_next_service_idx
  on public.vehicles (organization_id, branch_id, next_service_date)
  where status = 'active' and deleted_at is null;
create index vehicles_plate_search_idx on public.vehicles (organization_id, plate_normalized);

create trigger vehicles_updated_at before update on public.vehicles
  for each row execute function app.set_updated_at();
create trigger vehicles_tenant_immutable before update on public.vehicles
  for each row execute function app.forbid_tenant_change();

-- Un vehículo no puede asignarse a un cliente borrado.
create function app.validate_vehicle_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.customers c
             where c.id = new.customer_id and c.deleted_at is not null) then
    raise exception 'customer_deleted' using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' and new.current_km is distinct from old.current_km then
    new.km_updated_at := now();
  end if;
  return new;
end;
$$;
create trigger vehicles_validate_owner
  before insert or update of customer_id, current_km on public.vehicles
  for each row execute function app.validate_vehicle_owner();

-- -----------------------------------------------------------------------------
-- maintenance_records (historial) y piezas
-- -----------------------------------------------------------------------------
create table public.maintenance_records (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null,
  branch_id              uuid not null,
  vehicle_id             uuid not null,
  customer_id_snapshot   uuid,  -- propietario en el momento de la revisión
  service_date           date not null check (service_date >= date '1950-01-01'),
  km                     integer check (km between 0 and 2000000),
  work_performed         text not null check (char_length(btrim(work_performed)) between 1 and 5000),
  notes                  text check (char_length(notes) <= 5000),
  next_recommended_date  date,
  next_recommended_km    integer check (next_recommended_km between 0 and 2000000),
  created_by             uuid references public.profiles (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  foreign key (organization_id, branch_id, vehicle_id)
    references public.vehicles (organization_id, branch_id, id) on delete restrict,
  foreign key (organization_id, branch_id, customer_id_snapshot)
    references public.customers (organization_id, branch_id, id) on delete set null (customer_id_snapshot),
  constraint maintenance_records_tenant_key unique (organization_id, branch_id, id),
  constraint maintenance_records_next_after check (
    next_recommended_date is null or next_recommended_date > service_date),
  constraint maintenance_records_next_km_after check (
    next_recommended_km is null or km is null or next_recommended_km > km)
);
create index maintenance_records_vehicle_idx on public.maintenance_records (vehicle_id, service_date desc, created_at desc);
create index maintenance_records_branch_idx on public.maintenance_records (organization_id, branch_id, service_date desc);

create trigger maintenance_records_updated_at before update on public.maintenance_records
  for each row execute function app.set_updated_at();
create trigger maintenance_records_tenant_immutable before update on public.maintenance_records
  for each row execute function app.forbid_tenant_change();

-- La fecha de servicio no puede estar en el futuro (con un día de margen por
-- zonas horarias). No se puede expresar con CHECK porque current_date no es
-- inmutable.
create function app.validate_maintenance_record()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.service_date > current_date + 1 then
    raise exception 'service_date_in_future' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' and new.customer_id_snapshot is null then
    select v.customer_id into new.customer_id_snapshot from public.vehicles v where v.id = new.vehicle_id;
  end if;
  return new;
end;
$$;
create trigger maintenance_records_validate before insert or update on public.maintenance_records
  for each row execute function app.validate_maintenance_record();

create table public.maintenance_parts (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  branch_id        uuid not null,
  record_id        uuid not null,
  description      text not null check (char_length(btrim(description)) between 1 and 200),
  reference        text check (char_length(reference) <= 80),
  quantity         numeric(12,3) not null default 1 check (quantity > 0),
  created_at       timestamptz not null default now(),
  foreign key (organization_id, branch_id, record_id)
    references public.maintenance_records (organization_id, branch_id, id) on delete cascade
);
create index maintenance_parts_record_idx on public.maintenance_parts (record_id);
create trigger maintenance_parts_tenant_immutable before update on public.maintenance_parts
  for each row execute function app.forbid_tenant_change();

-- Lecturas de kilometraje: base para la estimación de avisos por km.
create table public.mileage_readings (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  branch_id        uuid not null,
  vehicle_id       uuid not null,
  km               integer not null check (km between 0 and 2000000),
  read_on          date not null,
  source           text not null check (source in ('maintenance', 'manual', 'import', 'appointment')),
  maintenance_record_id uuid references public.maintenance_records (id) on delete cascade,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  foreign key (organization_id, branch_id, vehicle_id)
    references public.vehicles (organization_id, branch_id, id) on delete cascade
);
create index mileage_readings_vehicle_idx on public.mileage_readings (vehicle_id, read_on desc);
create unique index mileage_readings_record_unique
  on public.mileage_readings (maintenance_record_id) where maintenance_record_id is not null;

-- -----------------------------------------------------------------------------
-- Mantener la ficha del vehículo coherente con su historial.
-- La revisión más reciente fija la última revisión y calcula la próxima
-- (la recomendada en el registro o, si no hay, última + intervalo por defecto
-- de la sucursal). Una edición manual posterior de la próxima revisión se
-- respeta hasta que se registre otra revisión.
-- -----------------------------------------------------------------------------
create function app.refresh_vehicle_service(p_vehicle uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_latest record;
  v_settings record;
begin
  select r.service_date, r.km, r.next_recommended_date, r.next_recommended_km
    into v_latest
  from public.maintenance_records r
  where r.vehicle_id = p_vehicle
  order by r.service_date desc, r.created_at desc
  limit 1;

  if not found then
    update public.vehicles set last_service_date = null, last_service_km = null
    where id = p_vehicle;
    return;
  end if;

  select bs.default_interval_months, bs.default_interval_km into v_settings
  from public.vehicles v join public.branch_settings bs on bs.branch_id = v.branch_id
  where v.id = p_vehicle;

  update public.vehicles v set
    last_service_date   = v_latest.service_date,
    last_service_km     = v_latest.km,
    next_service_date   = coalesce(v_latest.next_recommended_date,
                                   (v_latest.service_date
                                    + make_interval(months => coalesce(v_settings.default_interval_months, 12)))::date),
    next_service_km     = coalesce(v_latest.next_recommended_km,
                                   v_latest.km + coalesce(v_settings.default_interval_km, 15000)),
    next_service_source = 'computed',
    current_km          = case when v_latest.km is not null and (v.current_km is null or v_latest.km > v.current_km)
                               then v_latest.km else v.current_km end
  where v.id = p_vehicle;
end;
$$;

create function app.on_maintenance_record_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.km is not null then
    insert into public.mileage_readings
      (organization_id, branch_id, vehicle_id, km, read_on, source, maintenance_record_id, created_by)
    values
      (new.organization_id, new.branch_id, new.vehicle_id, new.km, new.service_date, 'maintenance', new.id, new.created_by);
  elsif tg_op = 'UPDATE' and (new.km is distinct from old.km or new.service_date is distinct from old.service_date) then
    delete from public.mileage_readings where maintenance_record_id = new.id;
    if new.km is not null then
      insert into public.mileage_readings
        (organization_id, branch_id, vehicle_id, km, read_on, source, maintenance_record_id, created_by)
      values
        (new.organization_id, new.branch_id, new.vehicle_id, new.km, new.service_date, 'maintenance', new.id, new.created_by);
    end if;
  end if;
  perform app.refresh_vehicle_service(coalesce(new.vehicle_id, old.vehicle_id));
  return null;
end;
$$;
create trigger maintenance_records_refresh_vehicle
  after insert or update or delete on public.maintenance_records
  for each row execute function app.on_maintenance_record_change();

-- -----------------------------------------------------------------------------
-- Borrado lógico protegido: marcar/desmarcar deleted_at exige el permiso de
-- borrado (TG_ARGV[0]); un cliente con vehículos activos no se puede borrar.
-- -----------------------------------------------------------------------------
create function app.guard_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not distinct from old.deleted_at then
    return new;
  end if;
  if (select auth.uid()) is not null
     and not exists (select 1 from app.branches_with_permission(tg_argv[0], true) as b(id)
                     where b.id = new.branch_id) then
    raise exception 'permission_denied' using errcode = '42501', detail = tg_argv[0];
  end if;
  if tg_table_name = 'customers' and new.deleted_at is not null
     and exists (select 1 from public.vehicles v where v.customer_id = new.id and v.deleted_at is null) then
    raise exception 'customer_has_vehicles' using errcode = '23503';
  end if;
  return new;
end;
$$;
create trigger customers_guard_soft_delete before update of deleted_at on public.customers
  for each row execute function app.guard_soft_delete('customers.delete');
create trigger vehicles_guard_soft_delete before update of deleted_at on public.vehicles
  for each row execute function app.guard_soft_delete('vehicles.delete');

-- -----------------------------------------------------------------------------
-- Límites del plan: clientes y vehículos activos (triggers de sentencia)
-- -----------------------------------------------------------------------------
create function app.enforce_customer_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if tg_op = 'INSERT' then
    for r in select distinct organization_id from new_rows where deleted_at is null order by 1 loop
      perform app.assert_within_limit(r.organization_id, 'customers');
    end loop;
  else
    for r in select distinct n.organization_id from new_rows n join old_rows o on o.id = n.id
             where n.deleted_at is null and o.deleted_at is not null order by 1 loop
      perform app.assert_within_limit(r.organization_id, 'customers');
    end loop;
  end if;
  return null;
end;
$$;
create trigger customers_limit_insert after insert on public.customers
  referencing new table as new_rows
  for each statement execute function app.enforce_customer_limit();
create trigger customers_limit_update after update on public.customers
  referencing new table as new_rows old table as old_rows
  for each statement execute function app.enforce_customer_limit();

create function app.enforce_vehicle_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if tg_op = 'INSERT' then
    for r in select distinct organization_id from new_rows
             where deleted_at is null and status = 'active' order by 1 loop
      perform app.assert_within_limit(r.organization_id, 'active_vehicles');
    end loop;
  else
    for r in select distinct n.organization_id from new_rows n join old_rows o on o.id = n.id
             where n.deleted_at is null and n.status = 'active'
               and not (o.deleted_at is null and o.status = 'active') order by 1 loop
      perform app.assert_within_limit(r.organization_id, 'active_vehicles');
    end loop;
  end if;
  return null;
end;
$$;
create trigger vehicles_limit_insert after insert on public.vehicles
  referencing new table as new_rows
  for each statement execute function app.enforce_vehicle_limit();
create trigger vehicles_limit_update after update on public.vehicles
  referencing new table as new_rows old table as old_rows
  for each statement execute function app.enforce_vehicle_limit();

-- =============================================================================
-- RLS
-- Lectura: cualquier miembro con acceso a la sucursal.
-- Escritura: permiso específico + suscripción activa (branches_with_permission).
-- El permiso centinela 'admin' no es asignable a operarios: equivale a "solo admin".
-- No hay DELETE físico para usuarios en clientes/vehículos: se borra lógicamente
-- y la purga definitiva la hace un job del sistema.
-- =============================================================================
alter table public.customers enable row level security;
alter table public.customers force row level security;
alter table public.vehicles enable row level security;
alter table public.vehicles force row level security;
alter table public.maintenance_records enable row level security;
alter table public.maintenance_records force row level security;
alter table public.maintenance_parts enable row level security;
alter table public.maintenance_parts force row level security;
alter table public.mileage_readings enable row level security;
alter table public.mileage_readings force row level security;

create policy customers_select on public.customers for select to authenticated
  using (organization_id in (select app.member_orgs()) and branch_id in (select app.accessible_branches()));
create policy customers_insert on public.customers for insert to authenticated
  with check (organization_id in (select app.member_orgs())
              and branch_id in (select app.branches_with_permission('customers.write', true)));
create policy customers_update on public.customers for update to authenticated
  using (organization_id in (select app.member_orgs())
         and branch_id in (select app.branches_with_permission('customers.write', true)))
  with check (organization_id in (select app.member_orgs())
              and branch_id in (select app.branches_with_permission('customers.write', true)));

create policy vehicles_select on public.vehicles for select to authenticated
  using (organization_id in (select app.member_orgs()) and branch_id in (select app.accessible_branches()));
create policy vehicles_insert on public.vehicles for insert to authenticated
  with check (organization_id in (select app.member_orgs())
              and branch_id in (select app.branches_with_permission('vehicles.write', true)));
create policy vehicles_update on public.vehicles for update to authenticated
  using (organization_id in (select app.member_orgs())
         and branch_id in (select app.branches_with_permission('vehicles.write', true)))
  with check (organization_id in (select app.member_orgs())
              and branch_id in (select app.branches_with_permission('vehicles.write', true)));

create policy maintenance_records_select on public.maintenance_records for select to authenticated
  using (organization_id in (select app.member_orgs()) and branch_id in (select app.accessible_branches()));
create policy maintenance_records_insert on public.maintenance_records for insert to authenticated
  with check (organization_id in (select app.member_orgs())
              and branch_id in (select app.branches_with_permission('maintenance.write', true)));
create policy maintenance_records_update on public.maintenance_records for update to authenticated
  using (organization_id in (select app.member_orgs())
         and branch_id in (select app.branches_with_permission('maintenance.write', true)))
  with check (organization_id in (select app.member_orgs())
              and branch_id in (select app.branches_with_permission('maintenance.write', true)));
create policy maintenance_records_delete on public.maintenance_records for delete to authenticated
  using (organization_id in (select app.member_orgs())
         and branch_id in (select app.branches_with_permission('admin', true)));

create policy maintenance_parts_select on public.maintenance_parts for select to authenticated
  using (organization_id in (select app.member_orgs()) and branch_id in (select app.accessible_branches()));
create policy maintenance_parts_write on public.maintenance_parts for all to authenticated
  using (organization_id in (select app.member_orgs())
         and branch_id in (select app.branches_with_permission('maintenance.write', true)))
  with check (organization_id in (select app.member_orgs())
              and branch_id in (select app.branches_with_permission('maintenance.write', true)));

create policy mileage_readings_select on public.mileage_readings for select to authenticated
  using (organization_id in (select app.member_orgs()) and branch_id in (select app.accessible_branches()));
create policy mileage_readings_insert on public.mileage_readings for insert to authenticated
  with check (organization_id in (select app.member_orgs())
              and branch_id in (select app.branches_with_permission('vehicles.write', true))
              and source in ('manual', 'appointment'));

revoke all on public.customers, public.vehicles, public.maintenance_records,
  public.maintenance_parts, public.mileage_readings from anon, authenticated;

grant select on public.customers to authenticated;
grant insert (organization_id, branch_id, first_name, last_name, email, phone, source, notes,
              reminders_opt_out, created_by)
  on public.customers to authenticated;
grant update (first_name, last_name, email, phone, source, notes, reminders_opt_out, opted_out_at, deleted_at)
  on public.customers to authenticated;

grant select on public.vehicles to authenticated;
grant insert (organization_id, branch_id, customer_id, plate, make, model, vin, current_km,
              next_service_date, next_service_km, next_service_source, status, created_by)
  on public.vehicles to authenticated;
grant update (customer_id, plate, make, model, vin, current_km, next_service_date, next_service_km,
              next_service_source, status, deleted_at)
  on public.vehicles to authenticated;

grant select, insert, delete on public.maintenance_records to authenticated;
grant update (service_date, km, work_performed, notes, next_recommended_date, next_recommended_km)
  on public.maintenance_records to authenticated;
grant select, insert, update, delete on public.maintenance_parts to authenticated;
grant select, insert on public.mileage_readings to authenticated;
