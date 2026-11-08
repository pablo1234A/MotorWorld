-- =============================================================================
-- RevisaYa PCI · 1 · Modelo de datos de protección contra incendios
-- (docs/PCI-DISENO.md). Solo AÑADE tablas, columnas y valores admitidos: no
-- borra ni convierte datos existentes (los vehículos quedan como heredados).
--
--   instalaciones → equipos (con ficha de extintor) → actuaciones
--   órdenes de trabajo (varios equipos de UNA instalación) → resultado por equipo
--   incidencias · técnicos · documentos y fotos · catálogo normativo
--
-- Integridad multiempresa: FK compuestas (organization_id, branch_id, id) en
-- todas las relaciones y triggers de coherencia (equipo ↔ instalación ↔ orden).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Permisos y scopes (solo se amplían las listas admitidas)
-- -----------------------------------------------------------------------------
alter table public.organization_members drop constraint organization_members_permissions_valid,
  add constraint organization_members_permissions_valid check (
    permissions <@ array[
      'customers.write', 'customers.delete', 'vehicles.write', 'vehicles.delete',
      'maintenance.write', 'imports.run', 'reminders.read', 'appointments.manage',
      'quotes.manage', 'reports.read',
      'work_orders.manage', 'work_orders.execute', 'incidents.write'
    ]::text[]);
alter table public.invitations drop constraint invitations_permissions_valid,
  add constraint invitations_permissions_valid check (
    permissions <@ array[
      'customers.write', 'customers.delete', 'vehicles.write', 'vehicles.delete',
      'maintenance.write', 'imports.run', 'reminders.read', 'appointments.manage',
      'quotes.manage', 'reports.read',
      'work_orders.manage', 'work_orders.execute', 'incidents.write'
    ]::text[]);

alter table public.api_keys drop constraint api_keys_scopes_check,
  add constraint api_keys_scopes_check check (
    cardinality(scopes) >= 1 and scopes <@ array[
      'customers:read', 'customers:write', 'vehicles:read', 'vehicles:write',
      'maintenance:read', 'maintenance:write', 'appointments:read',
      'appointments:write', 'reminders:read',
      'installations:read', 'installations:write', 'equipment:read', 'equipment:write',
      'work_orders:read', 'work_orders:write', 'incidents:read', 'incidents:write']::text[]);

-- Sucursales en las que el usuario tiene ALGUNO de los permisos indicados.
create function app.branches_with_any_permission(p_perms text[], p_require_active boolean)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct b from unnest(p_perms) p, lateral app.branches_with_permission(p, p_require_active) b;
$$;
grant execute on function app.branches_with_any_permission(text[], boolean) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Clientes: datos de empresa (un cliente, muchas instalaciones)
-- -----------------------------------------------------------------------------
alter table public.customers
  add column customer_kind  text not null default 'individual' check (customer_kind in ('company', 'individual')),
  add column legal_name     text check (char_length(legal_name) <= 200),
  add column tax_id         text check (tax_id ~ '^[A-Z0-9]{8,14}$'),
  add column address_line1  text check (char_length(address_line1) <= 200),
  add column postal_code    text check (postal_code ~ '^[0-9]{5}$'),
  add column city           text check (char_length(city) <= 100),
  add column province       text check (char_length(province) <= 100),
  add column contact_name   text check (char_length(contact_name) <= 160),
  add column contact_role   text check (char_length(contact_role) <= 100);
grant insert (customer_kind, legal_name, tax_id, address_line1, postal_code, city, province, contact_name, contact_role)
  on public.customers to authenticated;
grant update (customer_kind, legal_name, tax_id, address_line1, postal_code, city, province, contact_name, contact_role)
  on public.customers to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Límite de equipos por plan (mismos valores que los vehículos activos:
--    precios y Stripe no cambian; decisión comercial documentada).
-- -----------------------------------------------------------------------------
alter table public.plans add column max_equipment integer check (max_equipment is null or max_equipment > 0);
update public.plans set max_equipment = max_active_vehicles;

create or replace function app.org_limit(p_org uuid, p_resource text)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan public.plans;
begin
  select * into v_plan from app.active_plan(p_org);
  if not found then
    raise exception 'subscription_inactive' using errcode = 'RY002';
  end if;
  return case p_resource
    when 'customers'       then v_plan.max_customers
    when 'active_vehicles' then v_plan.max_active_vehicles
    when 'equipment'       then v_plan.max_equipment
    when 'users'           then v_plan.max_users
    when 'branches'        then v_plan.max_branches
    when 'emails'          then v_plan.monthly_emails
    else null
  end;
end;
$$;

create or replace function app.assert_within_limit(p_org uuid, p_resource text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_count bigint;
begin
  v_limit := app.org_limit(p_org, p_resource);
  if v_limit is null then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('limit:' || p_resource || ':' || p_org::text, 0));

  v_count := case p_resource
    when 'customers' then
      (select count(*) from public.customers c
        where c.organization_id = p_org and c.deleted_at is null)
    when 'active_vehicles' then
      (select count(*) from public.vehicles v
        where v.organization_id = p_org and v.deleted_at is null and v.status = 'active')
    when 'equipment' then
      (select count(*) from public.equipment e
        where e.organization_id = p_org and e.deleted_at is null and e.status <> 'retired')
    when 'users' then
      (select count(*) from public.organization_members m
        where m.organization_id = p_org and m.status = 'active')
      + (select count(*) from public.invitations i
          where i.organization_id = p_org and i.accepted_at is null
            and i.revoked_at is null and i.expires_at > now())
    when 'branches' then
      (select count(*) from public.branches b
        where b.organization_id = p_org and b.status = 'active')
  end;

  if v_count > v_limit then
    raise exception 'plan_limit_reached'
      using errcode = 'RY001', detail = p_resource, hint = format('%s/%s', v_count, v_limit);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Catálogo: categorías (fijas, alineadas con el RIPCI), tipos y operaciones
-- -----------------------------------------------------------------------------
create table public.equipment_categories (
  code        text primary key check (code ~ '^[a-z_]{2,40}$'),
  name        text not null,
  prefix      text not null check (prefix ~ '^[A-Z]{2,5}$'),
  position    smallint not null,
  ripci_ref   text
);

create table public.equipment_types (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid references public.organizations (id) on delete cascade,  -- null = del sistema
  category_code    text not null references public.equipment_categories (code),
  code             text not null check (code ~ '^[a-z0-9_]{2,40}$'),
  name             text not null check (char_length(btrim(name)) between 1 and 120),
  -- Atributos propios del tipo: [{"key","label","type":"text|number|date|boolean|select","required","options"}]
  attribute_schema jsonb not null default '[]'::jsonb check (jsonb_typeof(attribute_schema) = 'array'),
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);
create unique index equipment_types_system_code on public.equipment_types (category_code, code) where organization_id is null;
create unique index equipment_types_org_code on public.equipment_types (organization_id, category_code, code) where organization_id is not null;

create table public.maintenance_action_types (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid references public.organizations (id) on delete cascade,  -- null = del sistema
  category_code      text references public.equipment_categories (code),           -- null = cualquier categoría
  code               text not null check (code ~ '^[a-z0-9_]{2,60}$'),
  name               text not null check (char_length(btrim(name)) between 1 and 160),
  kind               text not null check (kind in ('inspection', 'periodic_maintenance', 'recharge', 'retimbrado',
                                                   'replacement', 'repair', 'decommission', 'other')),
  interval_months    smallint check (interval_months between 1 and 600),       -- null = no periódica
  performed_by       text not null default 'maintainer' check (performed_by in ('maintainer', 'maintainer_or_owner')),
  enabled_by_default boolean not null default true,
  legal_reference    text check (char_length(legal_reference) <= 500),
  description        text check (char_length(description) <= 2000),
  position           smallint not null default 100,
  active             boolean not null default true,
  created_at         timestamptz not null default now()
);
create unique index maintenance_action_types_system_code on public.maintenance_action_types (code) where organization_id is null;
create unique index maintenance_action_types_org_code on public.maintenance_action_types (organization_id, code) where organization_id is not null;

-- Configuración del taller sobre las operaciones del sistema: activar o no y
-- periodicidad propia (más exigente que la normativa, si lo decide).
create table public.org_action_type_settings (
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  action_type_id   uuid not null references public.maintenance_action_types (id) on delete cascade,
  enabled          boolean not null,
  interval_months  smallint check (interval_months between 1 and 600),
  updated_at       timestamptz not null default now(),
  primary key (organization_id, action_type_id)
);

-- -----------------------------------------------------------------------------
-- 5. Técnicos
-- -----------------------------------------------------------------------------
create table public.technicians (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  member_id        uuid,
  full_name        text not null check (char_length(btrim(full_name)) between 1 and 160),
  phone            text check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  email            extensions.citext check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- Nota libre (p. ej. carné o certificado). RevisaYa no verifica ni atribuye habilitaciones.
  qualification_notes text check (char_length(qualification_notes) <= 1000),
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint technicians_org_id_key unique (organization_id, id),
  constraint technicians_member_unique unique (member_id),
  foreign key (organization_id, member_id) references public.organization_members (organization_id, id) on delete set null (member_id)
);
create trigger technicians_updated_at before update on public.technicians for each row execute function app.set_updated_at();
create trigger technicians_tenant_immutable before update on public.technicians for each row execute function app.forbid_tenant_change();

-- Técnicos vinculados al usuario actual (para ver solo sus órdenes).
create function app.my_technician_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id from public.technicians t
    join public.organization_members m on m.id = t.member_id
   where m.user_id = (select auth.uid()) and m.status = 'active' and t.active;
$$;
grant execute on function app.my_technician_ids() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. Instalaciones
-- -----------------------------------------------------------------------------
create table public.installations (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null,
  branch_id           uuid not null,
  customer_id         uuid not null,
  name                text not null check (char_length(btrim(name)) between 1 and 160),
  establishment_type  text not null default 'other' check (establishment_type in (
                        'industrial', 'commercial', 'office', 'residential', 'educational', 'healthcare',
                        'public_assembly', 'hospitality', 'parking', 'warehouse', 'other')),
  address_line1       text not null check (char_length(btrim(address_line1)) between 1 and 200),
  postal_code         text check (postal_code ~ '^[0-9]{5}$'),
  city                text check (char_length(city) <= 100),
  province            text check (char_length(province) <= 100),
  contact_name        text check (char_length(contact_name) <= 160),
  contact_phone       text check (contact_phone ~ '^\+[1-9][0-9]{6,14}$'),
  contact_email       extensions.citext check (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  notes               text check (char_length(notes) <= 5000),
  status              text not null default 'active' check (status in ('active', 'inactive')),
  import_batch_id     uuid,
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  foreign key (organization_id, branch_id) references public.branches (organization_id, id) on delete restrict,
  foreign key (organization_id, branch_id, customer_id)
    references public.customers (organization_id, branch_id, id) on delete restrict,
  constraint installations_tenant_key unique (organization_id, branch_id, id)
);
create index installations_customer_idx on public.installations (customer_id) where deleted_at is null;
create index installations_panel_idx on public.installations (organization_id, branch_id, created_at desc) where deleted_at is null;
create index installations_search_idx on public.installations using gin ((lower(name || ' ' || address_line1 || ' ' || coalesce(city, ''))) extensions.gin_trgm_ops);
create trigger installations_updated_at before update on public.installations for each row execute function app.set_updated_at();
create trigger installations_tenant_immutable before update on public.installations for each row execute function app.forbid_tenant_change();

-- -----------------------------------------------------------------------------
-- 7. Equipos
-- -----------------------------------------------------------------------------
create table private.equipment_counters (
  organization_id  uuid not null,
  category_code    text not null,
  last_value       integer not null default 0,
  primary key (organization_id, category_code)
);
revoke all on private.equipment_counters from public, anon, authenticated;

create table public.equipment (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null,
  branch_id         uuid not null,
  installation_id   uuid not null,
  category_code     text not null references public.equipment_categories (code),
  type_id           uuid references public.equipment_types (id) on delete restrict,
  code              text not null check (code ~ '^[A-Za-z0-9._/-]{1,40}$'),
  -- Identificador del QR: aleatorio (no adivinable). El QR lleva a una ficha
  -- PROTEGIDA del panel: sin sesión y permisos no muestra nada.
  qr_token          text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
                    check (qr_token ~ '^[a-f0-9]{64}$'),
  manufacturer      text check (char_length(manufacturer) <= 100),
  model             text check (char_length(model) <= 100),
  serial_number     text check (char_length(serial_number) <= 100),
  location          text check (char_length(location) <= 200),
  installed_on      date,
  manufactured_on   date,
  status            text not null default 'in_service' check (status in ('in_service', 'out_of_service', 'retired')),
  notes             text check (char_length(notes) <= 5000),
  attributes        jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
  last_action_on    date,
  next_action_on    date,
  import_batch_id   uuid,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  foreign key (organization_id, branch_id, installation_id)
    references public.installations (organization_id, branch_id, id) on delete restrict,
  constraint equipment_tenant_key unique (organization_id, branch_id, id),
  constraint equipment_dates check (installed_on is null or manufactured_on is null or installed_on >= manufactured_on)
);
create unique index equipment_code_unique on public.equipment (organization_id, upper(code)) where deleted_at is null;
create index equipment_installation_idx on public.equipment (installation_id) where deleted_at is null;
create index equipment_due_idx on public.equipment (organization_id, branch_id, next_action_on) where deleted_at is null and status <> 'retired';
create index equipment_serial_idx on public.equipment (organization_id, upper(serial_number)) where serial_number is not null;
create trigger equipment_updated_at before update on public.equipment for each row execute function app.set_updated_at();
create trigger equipment_tenant_immutable before update on public.equipment for each row execute function app.forbid_tenant_change();

-- Ficha específica de extintor (tipada; el resto de categorías usan `attributes`).
create table public.equipment_extinguishers (
  equipment_id        uuid primary key,
  organization_id     uuid not null,
  branch_id           uuid not null,
  agent               text not null check (agent in ('powder_abc', 'powder_bc', 'powder_d', 'co2', 'water',
                                                     'water_additive', 'foam', 'wet_chemical_f', 'clean_agent', 'other')),
  charge_value        numeric(8,2) check (charge_value > 0 and charge_value <= 500),
  charge_unit         text check (charge_unit in ('kg', 'l')),
  efficacy            text check (efficacy ~ '^[0-9A-Za-z ,./-]{1,40}$'),   -- p. ej. 21A-113B-C
  mobility            text not null default 'portable' check (mobility in ('portable', 'wheeled')),
  stamped_on          date,          -- fecha de timbrado (prueba de nivel C inicial)
  put_in_service_on   date,
  retimbrados_before  smallint not null default 0 check (retimbrados_before between 0 and 3),  -- retimbrados previos al alta
  foreign key (organization_id, branch_id, equipment_id)
    references public.equipment (organization_id, branch_id, id) on delete cascade,
  constraint equipment_extinguishers_charge check ((charge_value is null) = (charge_unit is null))
);
create trigger equipment_extinguishers_tenant_immutable before update on public.equipment_extinguishers
  for each row execute function app.forbid_tenant_change();

-- Coherencia del equipo: el tipo es de su categoría y del sistema o de su taller;
-- código automático (EXT-000001) si no se indica.
create function app.equipment_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type record;
  v_n integer;
begin
  if new.type_id is not null then
    select organization_id, category_code into v_type from public.equipment_types where id = new.type_id;
    if v_type.category_code is distinct from new.category_code
       or (v_type.organization_id is not null and v_type.organization_id <> new.organization_id) then
      raise exception 'equipment_type_mismatch' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'INSERT' and (new.code is null or btrim(new.code) = '') then
    insert into private.equipment_counters (organization_id, category_code, last_value)
    values (new.organization_id, new.category_code, 1)
    on conflict (organization_id, category_code) do update set last_value = private.equipment_counters.last_value + 1
    returning last_value into v_n;
    new.code := (select prefix from public.equipment_categories where code = new.category_code) || '-' || lpad(v_n::text, 6, '0');
  end if;
  if tg_op = 'UPDATE' and new.qr_token is distinct from old.qr_token and (select auth.uid()) is not null then
    raise exception 'qr_token_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger equipment_before_write before insert or update on public.equipment
  for each row execute function app.equipment_before_write();

create function app.enforce_equipment_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if tg_op = 'INSERT' then
    for r in select distinct organization_id from new_rows where deleted_at is null and status <> 'retired' order by 1 loop
      perform app.assert_within_limit(r.organization_id, 'equipment');
    end loop;
  else
    for r in select distinct n.organization_id from new_rows n join old_rows o on o.id = n.id
             where n.deleted_at is null and n.status <> 'retired'
               and not (o.deleted_at is null and o.status <> 'retired') order by 1 loop
      perform app.assert_within_limit(r.organization_id, 'equipment');
    end loop;
  end if;
  return null;
end;
$$;
create trigger equipment_limit_insert after insert on public.equipment
  referencing new table as new_rows for each statement execute function app.enforce_equipment_limit();
create trigger equipment_limit_update after update on public.equipment
  referencing new table as new_rows old table as old_rows for each statement execute function app.enforce_equipment_limit();

-- -----------------------------------------------------------------------------
-- 8. Órdenes de trabajo
-- -----------------------------------------------------------------------------
alter table public.document_sequences drop constraint document_sequences_doc_type_check,
  add constraint document_sequences_doc_type_check check (doc_type in ('quote', 'work_order'));

create table public.work_orders (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null,
  branch_id         uuid not null,
  customer_id       uuid not null,
  installation_id   uuid not null,
  number            text not null,
  series_year       smallint not null,
  sequence          integer not null,
  service_type      text not null check (service_type in ('periodic_maintenance', 'inspection', 'installation',
                                                          'repair', 'corrective', 'replacement', 'other')),
  status            text not null default 'pending' check (status in ('pending', 'scheduled', 'assigned', 'in_progress',
                                                                      'completed', 'canceled')),
  scheduled_for     date,
  scheduled_time    time,
  technician_id     uuid,
  description       text check (char_length(description) <= 5000),
  notes             text check (char_length(notes) <= 5000),
  completion_notes  text check (char_length(completion_notes) <= 5000),
  appointment_id    uuid,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  started_at        timestamptz,
  completed_at      timestamptz,
  canceled_at       timestamptz,
  report_pdf_path   text,
  foreign key (organization_id, branch_id) references public.branches (organization_id, id) on delete restrict,
  foreign key (organization_id, branch_id, customer_id) references public.customers (organization_id, branch_id, id) on delete restrict,
  foreign key (organization_id, branch_id, installation_id) references public.installations (organization_id, branch_id, id) on delete restrict,
  foreign key (organization_id, technician_id) references public.technicians (organization_id, id) on delete restrict,
  foreign key (organization_id, branch_id, appointment_id) references public.appointments (organization_id, branch_id, id) on delete set null (appointment_id),
  constraint work_orders_tenant_key unique (organization_id, branch_id, id),
  constraint work_orders_number_unique unique (branch_id, series_year, sequence),
  constraint work_orders_assigned_has_technician check (status not in ('assigned', 'in_progress') or technician_id is not null),
  constraint work_orders_scheduled_has_date check (status <> 'scheduled' or scheduled_for is not null),
  constraint work_orders_completed_at check ((status = 'completed') = (completed_at is not null))
);
create index work_orders_panel_idx on public.work_orders (organization_id, branch_id, status, scheduled_for);
create index work_orders_technician_idx on public.work_orders (technician_id, status) where technician_id is not null;
create index work_orders_installation_idx on public.work_orders (installation_id, created_at desc);
create trigger work_orders_updated_at before update on public.work_orders for each row execute function app.set_updated_at();
create trigger work_orders_tenant_immutable before update on public.work_orders for each row execute function app.forbid_tenant_change();

create table public.work_order_items (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null,
  branch_id               uuid not null,
  work_order_id           uuid not null,
  equipment_id            uuid not null,
  planned_action_type_id  uuid not null references public.maintenance_action_types (id) on delete restrict,
  status                  text not null default 'pending' check (status in ('pending', 'done', 'not_done')),
  result                  text check (result in ('compliant', 'compliant_with_remarks', 'non_compliant', 'not_performed')),
  observations            text check (char_length(observations) <= 2000),
  record_id               uuid,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  foreign key (organization_id, branch_id, work_order_id) references public.work_orders (organization_id, branch_id, id) on delete cascade,
  foreign key (organization_id, branch_id, equipment_id) references public.equipment (organization_id, branch_id, id) on delete restrict,
  constraint work_order_items_unique unique (work_order_id, equipment_id, planned_action_type_id),
  constraint work_order_items_tenant_key unique (organization_id, branch_id, id),
  constraint work_order_items_done_has_result check (status = 'pending' or result is not null)
);
create index work_order_items_equipment_idx on public.work_order_items (equipment_id);
create trigger work_order_items_updated_at before update on public.work_order_items for each row execute function app.set_updated_at();
create trigger work_order_items_tenant_immutable before update on public.work_order_items for each row execute function app.forbid_tenant_change();

create table public.work_order_events (
  id               bigint generated always as identity primary key,
  organization_id  uuid not null,
  branch_id        uuid not null,
  work_order_id    uuid not null,
  event            text not null check (event in ('created', 'status_changed', 'technician_changed', 'rescheduled', 'note', 'item_result')),
  from_status      text,
  to_status        text,
  actor_id         uuid references public.profiles (id) on delete set null,
  note             text check (char_length(note) <= 2000),
  created_at       timestamptz not null default now(),
  foreign key (organization_id, branch_id, work_order_id) references public.work_orders (organization_id, branch_id, id) on delete cascade
);
create index work_order_events_order_idx on public.work_order_events (work_order_id, created_at);

-- Numeración OT-AAAA-NNNN por sucursal y año (mismo contador con bloqueo que los presupuestos).
create function app.assign_work_order_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seq integer;
begin
  new.series_year := extract(year from coalesce(new.created_at, now()))::smallint;
  insert into public.document_sequences (organization_id, branch_id, doc_type, year, last_value)
  values (new.organization_id, new.branch_id, 'work_order', new.series_year, 1)
  on conflict (branch_id, doc_type, year)
  do update set last_value = public.document_sequences.last_value + 1
  returning last_value into v_seq;
  new.sequence := v_seq;
  new.number := format('OT-%s-%s', new.series_year, lpad(v_seq::text, 4, '0'));
  return new;
end;
$$;
create trigger work_orders_assign_number before insert on public.work_orders
  for each row execute function app.assign_work_order_number();

-- Reglas de la orden: instalación del cliente, transiciones válidas, y un
-- técnico sin «gestionar órdenes» solo puede avanzar el estado y anotar.
create function app.guard_work_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_manager boolean;
begin
  if not exists (select 1 from public.installations i where i.id = new.installation_id and i.customer_id = new.customer_id) then
    raise exception 'installation_customer_mismatch' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    return new;
  end if;
  if new.number is distinct from old.number or new.sequence is distinct from old.sequence then
    raise exception 'work_order_number_immutable' using errcode = '23514';
  end if;
  if old.status in ('completed', 'canceled') and (new.status is distinct from old.status
       or new.installation_id is distinct from old.installation_id or new.technician_id is distinct from old.technician_id) then
    raise exception 'work_order_closed' using errcode = '23514';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'pending' and new.status in ('scheduled', 'assigned', 'in_progress', 'canceled'))
    or (old.status = 'scheduled' and new.status in ('pending', 'assigned', 'in_progress', 'canceled'))
    or (old.status = 'assigned' and new.status in ('scheduled', 'in_progress', 'canceled'))
    or (old.status = 'in_progress' and new.status in ('completed', 'canceled'))) then
    raise exception 'invalid_work_order_transition' using errcode = '23514', detail = format('%s -> %s', old.status, new.status);
  end if;
  if new.installation_id is distinct from old.installation_id and exists (select 1 from public.work_order_items where work_order_id = new.id) then
    raise exception 'work_order_has_items' using errcode = '23514';
  end if;
  if new.status = 'in_progress' and old.status <> 'in_progress' then new.started_at := coalesce(new.started_at, now()); end if;
  if new.status = 'completed' and old.status <> 'completed' then
    if exists (select 1 from public.work_order_items where work_order_id = new.id and status = 'pending') then
      raise exception 'work_order_items_pending' using errcode = '23514';
    end if;
    new.completed_at := now();
  end if;
  if new.status = 'canceled' and old.status <> 'canceled' then new.canceled_at := now(); end if;
  -- Técnico que ejecuta (sin permiso de gestión): no reasigna, ni reprograma, ni cancela.
  if (select auth.uid()) is not null and not app.is_purging() then
    v_manager := new.branch_id in (select app.branches_with_permission('work_orders.manage', true));
    if not v_manager and (new.technician_id is distinct from old.technician_id
        or new.scheduled_for is distinct from old.scheduled_for or new.scheduled_time is distinct from old.scheduled_time
        or new.customer_id is distinct from old.customer_id or new.installation_id is distinct from old.installation_id
        or new.service_type is distinct from old.service_type or new.description is distinct from old.description
        or new.status = 'canceled') then
      raise exception 'permission_denied' using errcode = '42501', detail = 'work_orders.manage';
    end if;
  end if;
  return new;
end;
$$;
create trigger work_orders_guard before insert or update on public.work_orders
  for each row execute function app.guard_work_order();

create function app.log_work_order_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.work_order_events (organization_id, branch_id, work_order_id, event, to_status, actor_id)
    values (new.organization_id, new.branch_id, new.id, 'created', new.status, (select auth.uid()));
    return null;
  end if;
  if new.status is distinct from old.status then
    insert into public.work_order_events (organization_id, branch_id, work_order_id, event, from_status, to_status, actor_id)
    values (new.organization_id, new.branch_id, new.id, 'status_changed', old.status, new.status, (select auth.uid()));
  end if;
  if new.technician_id is distinct from old.technician_id then
    insert into public.work_order_events (organization_id, branch_id, work_order_id, event, actor_id, note)
    values (new.organization_id, new.branch_id, new.id, 'technician_changed', (select auth.uid()),
            (select full_name from public.technicians where id = new.technician_id));
  end if;
  if new.scheduled_for is distinct from old.scheduled_for or new.scheduled_time is distinct from old.scheduled_time then
    insert into public.work_order_events (organization_id, branch_id, work_order_id, event, actor_id, note)
    values (new.organization_id, new.branch_id, new.id, 'rescheduled', (select auth.uid()),
            coalesce(to_char(new.scheduled_for, 'DD/MM/YYYY'), '—') || coalesce(' ' || to_char(new.scheduled_time, 'HH24:MI'), ''));
  end if;
  return null;
end;
$$;
create trigger work_orders_events after insert or update on public.work_orders
  for each row execute function app.log_work_order_event();

-- El equipo de una línea es de la instalación de la orden, y la operación es de su categoría.
create function app.guard_work_order_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_cat text;
  v_at record;
begin
  select installation_id, status into v_order from public.work_orders where id = new.work_order_id;
  select category_code into v_cat from public.equipment where id = new.equipment_id and installation_id = v_order.installation_id;
  if v_cat is null then
    raise exception 'equipment_not_in_installation' using errcode = '23514';
  end if;
  select organization_id, category_code into v_at from public.maintenance_action_types where id = new.planned_action_type_id;
  if (v_at.category_code is not null and v_at.category_code <> v_cat)
     or (v_at.organization_id is not null and v_at.organization_id <> new.organization_id) then
    raise exception 'action_type_not_applicable' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' and v_order.status in ('completed', 'canceled') then
    raise exception 'work_order_closed' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and (new.equipment_id is distinct from old.equipment_id or new.work_order_id is distinct from old.work_order_id) then
    raise exception 'work_order_item_immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger work_order_items_guard before insert or update on public.work_order_items
  for each row execute function app.guard_work_order_item();

-- -----------------------------------------------------------------------------
-- 9. Actuaciones sobre equipos (historial: nunca se editan en silencio)
-- -----------------------------------------------------------------------------
create table public.equipment_maintenance_records (
  id                         uuid primary key default gen_random_uuid(),
  organization_id            uuid not null,
  branch_id                  uuid not null,
  equipment_id               uuid not null,
  installation_id            uuid not null,
  customer_id                uuid,                -- propietario en la fecha de la actuación
  work_order_id              uuid,
  technician_id              uuid,
  action_type_id             uuid not null references public.maintenance_action_types (id) on delete restrict,
  performed_on               date not null,
  result                     text not null check (result in ('compliant', 'compliant_with_remarks', 'non_compliant', 'not_performed')),
  observations               text check (char_length(observations) <= 5000),
  next_action_recommended_on date,
  created_by                 uuid references public.profiles (id) on delete set null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  amended_at                 timestamptz,
  amended_by                 uuid references public.profiles (id) on delete set null,
  amendment_reason           text check (char_length(amendment_reason) <= 1000),
  voided_at                  timestamptz,
  voided_by                  uuid references public.profiles (id) on delete set null,
  void_reason                text check (char_length(void_reason) <= 1000),
  foreign key (organization_id, branch_id, equipment_id) references public.equipment (organization_id, branch_id, id) on delete restrict,
  foreign key (organization_id, branch_id, installation_id) references public.installations (organization_id, branch_id, id) on delete restrict,
  foreign key (organization_id, branch_id, work_order_id) references public.work_orders (organization_id, branch_id, id) on delete restrict,
  foreign key (organization_id, technician_id) references public.technicians (organization_id, id) on delete restrict,
  constraint equipment_records_tenant_key unique (organization_id, branch_id, id),
  constraint equipment_records_next_after check (next_action_recommended_on is null or next_action_recommended_on > performed_on),
  constraint equipment_records_void_reason check ((voided_at is null) = (void_reason is null))
);
create index equipment_records_equipment_idx on public.equipment_maintenance_records (equipment_id, performed_on desc);
create index equipment_records_panel_idx on public.equipment_maintenance_records (organization_id, branch_id, performed_on desc);
create index equipment_records_work_order_idx on public.equipment_maintenance_records (work_order_id) where work_order_id is not null;
create trigger equipment_records_updated_at before update on public.equipment_maintenance_records for each row execute function app.set_updated_at();
create trigger equipment_records_tenant_immutable before update on public.equipment_maintenance_records for each row execute function app.forbid_tenant_change();

alter table public.work_order_items
  add foreign key (organization_id, branch_id, record_id)
  references public.equipment_maintenance_records (organization_id, branch_id, id) on delete set null (record_id);

create table public.equipment_record_materials (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  branch_id        uuid not null,
  record_id        uuid not null,
  description      text not null check (char_length(btrim(description)) between 1 and 200),
  reference        text check (char_length(reference) <= 80),
  quantity         numeric(10,3) not null check (quantity > 0),
  unit             text check (char_length(unit) <= 20),
  created_at       timestamptz not null default now(),
  foreign key (organization_id, branch_id, record_id)
    references public.equipment_maintenance_records (organization_id, branch_id, id) on delete cascade
);
create index equipment_record_materials_record_idx on public.equipment_record_materials (record_id);

-- Coherencia y trazabilidad de la actuación.
create function app.guard_equipment_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eq record;
  v_at record;
begin
  if tg_op = 'INSERT' then
    select installation_id, category_code, deleted_at into v_eq from public.equipment where id = new.equipment_id;
    if v_eq.deleted_at is not null then
      raise exception 'equipment_deleted' using errcode = '23514';
    end if;
    -- La instalación SIEMPRE es la del equipo (no se puede indicar otra).
    new.installation_id := v_eq.installation_id;
    new.customer_id := (select customer_id from public.installations where id = v_eq.installation_id);
    select organization_id, category_code into v_at from public.maintenance_action_types where id = new.action_type_id;
    if (v_at.category_code is not null and v_at.category_code <> v_eq.category_code)
       or (v_at.organization_id is not null and v_at.organization_id <> new.organization_id) then
      raise exception 'action_type_not_applicable' using errcode = '23514';
    end if;
    if new.work_order_id is not null and not exists (
         select 1 from public.work_orders w where w.id = new.work_order_id and w.installation_id = v_eq.installation_id
           and w.status not in ('completed', 'canceled')) then
      raise exception 'equipment_not_in_installation' using errcode = '23514';
    end if;
    if new.performed_on > (now() at time zone 'Europe/Madrid')::date + 1 then
      raise exception 'service_date_in_future' using errcode = '23514';
    end if;
    new.created_by := coalesce(new.created_by, (select auth.uid()));
    return new;
  end if;
  -- UPDATE: lo esencial no cambia; una corrección exige motivo y queda firmada.
  if new.equipment_id is distinct from old.equipment_id or new.installation_id is distinct from old.installation_id
     or new.customer_id is distinct from old.customer_id or new.work_order_id is distinct from old.work_order_id
     or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'equipment_record_immutable' using errcode = '23514';
  end if;
  if old.voided_at is not null and not app.is_purging() then
    raise exception 'equipment_record_voided' using errcode = '23514';
  end if;
  if new.voided_at is not null and old.voided_at is null then
    new.voided_by := (select auth.uid());
    if new.action_type_id is distinct from old.action_type_id or new.performed_on is distinct from old.performed_on
       or new.result is distinct from old.result or new.observations is distinct from old.observations then
      raise exception 'equipment_record_immutable' using errcode = '23514';
    end if;
    return new;
  end if;
  if (new.action_type_id, new.performed_on, new.result, new.observations, new.next_action_recommended_on, new.technician_id)
     is distinct from (old.action_type_id, old.performed_on, old.result, old.observations, old.next_action_recommended_on, old.technician_id) then
    if new.amendment_reason is null or new.amendment_reason is not distinct from old.amendment_reason then
      raise exception 'amendment_reason_required' using errcode = '23514';
    end if;
    new.amended_at := now();
    new.amended_by := (select auth.uid());
  end if;
  return new;
end;
$$;
create trigger equipment_records_guard before insert or update on public.equipment_maintenance_records
  for each row execute function app.guard_equipment_record();

-- -----------------------------------------------------------------------------
-- 10. Vencimientos por equipo y operación
-- -----------------------------------------------------------------------------
create table public.equipment_action_schedules (
  equipment_id     uuid not null,
  action_type_id   uuid not null references public.maintenance_action_types (id) on delete cascade,
  organization_id  uuid not null,
  branch_id        uuid not null,
  last_done_on     date,
  next_due_on      date,
  -- Extintores: retimbrados ya hechos (0-3); con 3 no hay más (RIPCI, anexo II, tabla II).
  retimbrados_done smallint,
  updated_at       timestamptz not null default now(),
  primary key (equipment_id, action_type_id),
  foreign key (organization_id, branch_id, equipment_id) references public.equipment (organization_id, branch_id, id) on delete cascade
);
create index equipment_action_schedules_due_idx on public.equipment_action_schedules (organization_id, branch_id, next_due_on);

-- Operaciones que aplican a un equipo (catálogo del sistema + del taller, con la configuración del taller).
create function app.equipment_applicable_actions(p_org uuid, p_category text)
returns table (action_type_id uuid, kind text, interval_months smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.kind, coalesce(s.interval_months, a.interval_months)
    from public.maintenance_action_types a
    left join public.org_action_type_settings s on s.action_type_id = a.id and s.organization_id = p_org
   where a.active
     and (a.organization_id is null or a.organization_id = p_org)
     and (a.category_code is null or a.category_code = p_category)
     and coalesce(s.interval_months, a.interval_months) is not null
     and coalesce(s.enabled, a.enabled_by_default);
$$;

-- Recalcula los vencimientos de un equipo a partir de su historial.
--  · última vez = la actuación válida (no anulada, realizada) más reciente de esa operación;
--  · si no hay ninguna: desde la puesta en servicio / instalación (o la fecha
--    de timbrado para el retimbrado);
--  · la próxima fecha recomendada en la actuación, si la hay, manda.
--  · equipos retirados o borrados: sin vencimientos.
create function app.recompute_equipment_schedule(p_equipment uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_eq record;
  v_ext record;
  r record;
  v_last date;
  v_recommended date;
  v_base date;
  v_next date;
  v_ret_done smallint;
begin
  select * into v_eq from public.equipment where id = p_equipment;
  if not found then return; end if;
  if v_eq.deleted_at is not null or v_eq.status = 'retired' then
    delete from public.equipment_action_schedules where equipment_id = p_equipment;
    update public.equipment set next_action_on = null where id = p_equipment and next_action_on is not null;
    return;
  end if;
  select * into v_ext from public.equipment_extinguishers where equipment_id = p_equipment;

  delete from public.equipment_action_schedules s where s.equipment_id = p_equipment
     and s.action_type_id not in (select action_type_id from app.equipment_applicable_actions(v_eq.organization_id, v_eq.category_code));

  for r in select * from app.equipment_applicable_actions(v_eq.organization_id, v_eq.category_code) loop
    select max(m.performed_on) filter (where m.result <> 'not_performed'),
           (array_agg(m.next_action_recommended_on order by m.performed_on desc, m.created_at desc)
              filter (where m.result <> 'not_performed'))[1]
      into v_last, v_recommended
      from public.equipment_maintenance_records m
     where m.equipment_id = p_equipment and m.action_type_id = r.action_type_id and m.voided_at is null;
    v_ret_done := null;
    if r.kind = 'retimbrado' then
      if v_ext.equipment_id is null or v_ext.stamped_on is null then
        delete from public.equipment_action_schedules where equipment_id = p_equipment and action_type_id = r.action_type_id;
        continue;
      end if;
      v_ret_done := least(3, v_ext.retimbrados_before + (
        select count(*) from public.equipment_maintenance_records m
         where m.equipment_id = p_equipment and m.action_type_id = r.action_type_id and m.voided_at is null
           and m.result in ('compliant', 'compliant_with_remarks') and m.performed_on > v_ext.stamped_on))::smallint;
      v_base := coalesce(v_last, (v_ext.stamped_on + make_interval(years => 5 * v_ext.retimbrados_before))::date);
      v_next := case when v_ret_done >= 3 then null else (v_base + make_interval(months => r.interval_months))::date end;
    else
      v_base := coalesce(v_last, v_ext.put_in_service_on, v_eq.installed_on, v_ext.stamped_on, v_eq.manufactured_on);
      v_next := case when v_base is null then null else (v_base + make_interval(months => r.interval_months))::date end;
      if v_recommended is not null then v_next := v_recommended; end if;
    end if;
    insert into public.equipment_action_schedules (equipment_id, action_type_id, organization_id, branch_id, last_done_on, next_due_on, retimbrados_done, updated_at)
    values (p_equipment, r.action_type_id, v_eq.organization_id, v_eq.branch_id, v_last, v_next, v_ret_done, now())
    on conflict (equipment_id, action_type_id) do update
      set last_done_on = excluded.last_done_on, next_due_on = excluded.next_due_on,
          retimbrados_done = excluded.retimbrados_done, updated_at = now();
  end loop;

  update public.equipment e
     set next_action_on = (select min(s.next_due_on) from public.equipment_action_schedules s where s.equipment_id = p_equipment),
         last_action_on = (select max(m.performed_on) from public.equipment_maintenance_records m
                            where m.equipment_id = p_equipment and m.voided_at is null and m.result <> 'not_performed')
   where e.id = p_equipment;
end;
$$;

create function app.tg_recompute_equipment_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'equipment' then
    if tg_op = 'UPDATE' and (new.status, new.deleted_at, new.installed_on, new.manufactured_on, new.category_code)
                            is not distinct from (old.status, old.deleted_at, old.installed_on, old.manufactured_on, old.category_code) then
      return null;
    end if;
    perform app.recompute_equipment_schedule(new.id);
  else
    perform app.recompute_equipment_schedule(coalesce(new.equipment_id, old.equipment_id));
  end if;
  return null;
end;
$$;
create trigger equipment_schedule_recompute after insert or update on public.equipment
  for each row execute function app.tg_recompute_equipment_schedule();
create trigger equipment_extinguishers_schedule_recompute after insert or update on public.equipment_extinguishers
  for each row execute function app.tg_recompute_equipment_schedule();
create trigger equipment_records_schedule_recompute after insert or update on public.equipment_maintenance_records
  for each row execute function app.tg_recompute_equipment_schedule();

-- Si el taller cambia la configuración de una operación, se recalculan sus equipos.
create function app.tg_recompute_org_schedules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  for v_id in select e.id from public.equipment e where e.organization_id = coalesce(new.organization_id, old.organization_id)
                and e.deleted_at is null and e.status <> 'retired' loop
    perform app.recompute_equipment_schedule(v_id);
  end loop;
  return null;
end;
$$;
create trigger org_action_type_settings_recompute after insert or update or delete on public.org_action_type_settings
  for each row execute function app.tg_recompute_org_schedules();

-- Una actuación de baja o sustitución retira el equipo (deja de vencer).
create function app.tg_equipment_record_effects()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.voided_at is null and new.result in ('compliant', 'compliant_with_remarks')
     and (select kind from public.maintenance_action_types where id = new.action_type_id) = 'decommission' then
    update public.equipment set status = 'retired' where id = new.equipment_id and status <> 'retired';
  end if;
  return null;
end;
$$;
create trigger equipment_records_effects after insert on public.equipment_maintenance_records
  for each row execute function app.tg_equipment_record_effects();

-- -----------------------------------------------------------------------------
-- 11. Incidencias
-- -----------------------------------------------------------------------------
create table public.equipment_incidents (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  branch_id        uuid not null,
  installation_id  uuid not null,
  equipment_id     uuid,
  work_order_id    uuid,
  record_id        uuid,
  severity         text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  title            text not null check (char_length(btrim(title)) between 1 and 200),
  description      text check (char_length(description) <= 5000),
  status           text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'dismissed')),
  detected_on      date not null default current_date,
  resolved_on      date,
  resolution       text check (char_length(resolution) <= 5000),
  reported_by      uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (organization_id, branch_id, installation_id) references public.installations (organization_id, branch_id, id) on delete restrict,
  foreign key (organization_id, branch_id, equipment_id) references public.equipment (organization_id, branch_id, id) on delete restrict,
  foreign key (organization_id, branch_id, work_order_id) references public.work_orders (organization_id, branch_id, id) on delete set null (work_order_id),
  foreign key (organization_id, branch_id, record_id) references public.equipment_maintenance_records (organization_id, branch_id, id) on delete set null (record_id),
  constraint equipment_incidents_tenant_key unique (organization_id, branch_id, id),
  constraint equipment_incidents_resolved check ((status in ('resolved', 'dismissed')) = (resolved_on is not null))
);
create index equipment_incidents_panel_idx on public.equipment_incidents (organization_id, branch_id, status, detected_on desc);
create index equipment_incidents_equipment_idx on public.equipment_incidents (equipment_id) where equipment_id is not null;
create trigger equipment_incidents_updated_at before update on public.equipment_incidents for each row execute function app.set_updated_at();
create trigger equipment_incidents_tenant_immutable before update on public.equipment_incidents for each row execute function app.forbid_tenant_change();

create function app.guard_incident()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.equipment_id is not null and not exists (select 1 from public.equipment e where e.id = new.equipment_id and e.installation_id = new.installation_id) then
    raise exception 'equipment_not_in_installation' using errcode = '23514';
  end if;
  if new.work_order_id is not null and not exists (select 1 from public.work_orders w where w.id = new.work_order_id and w.installation_id = new.installation_id) then
    raise exception 'equipment_not_in_installation' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then new.reported_by := coalesce(new.reported_by, (select auth.uid())); end if;
  return new;
end;
$$;
create trigger equipment_incidents_guard before insert or update on public.equipment_incidents
  for each row execute function app.guard_incident();

-- -----------------------------------------------------------------------------
-- 12. Documentos y fotografías (Storage privado; la ruta se sirve firmada)
-- -----------------------------------------------------------------------------
create table public.pci_documents (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  branch_id        uuid not null,
  installation_id  uuid,
  equipment_id     uuid,
  work_order_id    uuid,
  record_id        uuid,
  incident_id      uuid,
  kind             text not null check (kind in ('document', 'photo', 'report')),
  title            text not null check (char_length(btrim(title)) between 1 and 200),
  storage_path     text not null unique check (char_length(storage_path) <= 300),
  mime_type        text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes       integer not null check (size_bytes between 1 and 10485760),
  uploaded_by      uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  foreign key (organization_id, branch_id) references public.branches (organization_id, id) on delete restrict,
  foreign key (organization_id, branch_id, installation_id) references public.installations (organization_id, branch_id, id) on delete restrict,
  foreign key (organization_id, branch_id, equipment_id) references public.equipment (organization_id, branch_id, id) on delete restrict,
  foreign key (organization_id, branch_id, work_order_id) references public.work_orders (organization_id, branch_id, id) on delete restrict,
  foreign key (organization_id, branch_id, record_id) references public.equipment_maintenance_records (organization_id, branch_id, id) on delete restrict,
  foreign key (organization_id, branch_id, incident_id) references public.equipment_incidents (organization_id, branch_id, id) on delete restrict,
  constraint pci_documents_has_owner check (num_nonnulls(installation_id, equipment_id, work_order_id, record_id, incident_id) >= 1),
  constraint pci_documents_path_org check (storage_path like organization_id::text || '/%')
);
create index pci_documents_installation_idx on public.pci_documents (installation_id) where installation_id is not null and deleted_at is null;
create index pci_documents_equipment_idx on public.pci_documents (equipment_id) where equipment_id is not null and deleted_at is null;
create index pci_documents_work_order_idx on public.pci_documents (work_order_id) where work_order_id is not null and deleted_at is null;
create trigger pci_documents_tenant_immutable before update on public.pci_documents for each row execute function app.forbid_tenant_change();

-- -----------------------------------------------------------------------------
-- 13. Borrado lógico y auditoría
-- -----------------------------------------------------------------------------
create or replace function app.guard_soft_delete()
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
  if tg_table_name = 'customers' and new.deleted_at is not null
     and exists (select 1 from public.installations i where i.customer_id = new.id and i.deleted_at is null) then
    raise exception 'customer_has_installations' using errcode = '23503';
  end if;
  if tg_table_name = 'installations' and new.deleted_at is not null
     and exists (select 1 from public.equipment e where e.installation_id = new.id and e.deleted_at is null) then
    raise exception 'installation_has_equipment' using errcode = '23503';
  end if;
  return new;
end;
$$;
create trigger installations_guard_soft_delete before update of deleted_at on public.installations
  for each row execute function app.guard_soft_delete('customers.delete');
create trigger equipment_guard_soft_delete before update of deleted_at on public.equipment
  for each row execute function app.guard_soft_delete('vehicles.delete');

create trigger audit_installations after insert or update or delete on public.installations
  for each row execute function app.audit_trigger('installation');
create trigger audit_equipment after insert or update or delete on public.equipment
  for each row execute function app.audit_trigger('equipment');
create trigger audit_equipment_records after insert or update or delete on public.equipment_maintenance_records
  for each row execute function app.audit_trigger('equipment_record');
create trigger audit_work_orders after insert or update or delete on public.work_orders
  for each row execute function app.audit_trigger('work_order');
create trigger audit_equipment_incidents after insert or update or delete on public.equipment_incidents
  for each row execute function app.audit_trigger('incident');
create trigger audit_technicians after insert or update or delete on public.technicians
  for each row execute function app.audit_trigger('technician');

-- -----------------------------------------------------------------------------
-- 14. RLS
-- Lectura: miembros con acceso a la sucursal. Escritura: permiso + suscripción
-- activa. Órdenes: quien gestiona ve todas; el técnico, solo las suyas.
-- -----------------------------------------------------------------------------
alter table public.equipment_categories enable row level security;
alter table public.equipment_categories force row level security;
alter table public.equipment_types enable row level security;
alter table public.equipment_types force row level security;
alter table public.maintenance_action_types enable row level security;
alter table public.maintenance_action_types force row level security;
alter table public.org_action_type_settings enable row level security;
alter table public.org_action_type_settings force row level security;
alter table public.technicians enable row level security;
alter table public.technicians force row level security;
alter table public.installations enable row level security;
alter table public.installations force row level security;
alter table public.equipment enable row level security;
alter table public.equipment force row level security;
alter table public.equipment_extinguishers enable row level security;
alter table public.equipment_extinguishers force row level security;
alter table public.equipment_action_schedules enable row level security;
alter table public.equipment_action_schedules force row level security;
alter table public.work_orders enable row level security;
alter table public.work_orders force row level security;
alter table public.work_order_items enable row level security;
alter table public.work_order_items force row level security;
alter table public.work_order_events enable row level security;
alter table public.work_order_events force row level security;
alter table public.equipment_maintenance_records enable row level security;
alter table public.equipment_maintenance_records force row level security;
alter table public.equipment_record_materials enable row level security;
alter table public.equipment_record_materials force row level security;
alter table public.equipment_incidents enable row level security;
alter table public.equipment_incidents force row level security;
alter table public.pci_documents enable row level security;
alter table public.pci_documents force row level security;

create policy equipment_categories_select on public.equipment_categories for select to authenticated using (true);

create policy equipment_types_select on public.equipment_types for select to authenticated
  using (organization_id is null or organization_id in (select app.member_orgs()));
create policy equipment_types_write on public.equipment_types for all to authenticated
  using (organization_id in (select app.admin_orgs()))
  with check (organization_id in (select app.admin_orgs()));

create policy maintenance_action_types_select on public.maintenance_action_types for select to authenticated
  using (organization_id is null or organization_id in (select app.member_orgs()));
create policy maintenance_action_types_write on public.maintenance_action_types for all to authenticated
  using (organization_id in (select app.admin_orgs()))
  with check (organization_id in (select app.admin_orgs()));

create policy org_action_type_settings_select on public.org_action_type_settings for select to authenticated
  using (organization_id in (select app.member_orgs()));
create policy org_action_type_settings_write on public.org_action_type_settings for all to authenticated
  using (organization_id in (select app.admin_orgs()))
  with check (organization_id in (select app.admin_orgs()));

create policy technicians_select on public.technicians for select to authenticated
  using (organization_id in (select app.member_orgs()));
create policy technicians_write on public.technicians for all to authenticated
  using (organization_id in (select app.admin_orgs()))
  with check (organization_id in (select app.admin_orgs()));

create policy installations_select on public.installations for select to authenticated
  using (organization_id in (select app.member_orgs()) and branch_id in (select app.accessible_branches()));
create policy installations_insert on public.installations for insert to authenticated
  with check (organization_id in (select app.member_orgs()) and branch_id in (select app.branches_with_permission('customers.write', true)));
create policy installations_update on public.installations for update to authenticated
  using (organization_id in (select app.member_orgs()) and branch_id in (select app.branches_with_permission('customers.write', true)))
  with check (organization_id in (select app.member_orgs()) and branch_id in (select app.branches_with_permission('customers.write', true)));

create policy equipment_select on public.equipment for select to authenticated
  using (organization_id in (select app.member_orgs()) and branch_id in (select app.accessible_branches()));
create policy equipment_insert on public.equipment for insert to authenticated
  with check (organization_id in (select app.member_orgs()) and branch_id in (select app.branches_with_permission('vehicles.write', true)));
create policy equipment_update on public.equipment for update to authenticated
  using (organization_id in (select app.member_orgs()) and branch_id in (select app.branches_with_permission('vehicles.write', true)))
  with check (organization_id in (select app.member_orgs()) and branch_id in (select app.branches_with_permission('vehicles.write', true)));

create policy equipment_extinguishers_select on public.equipment_extinguishers for select to authenticated
  using (organization_id in (select app.member_orgs()) and branch_id in (select app.accessible_branches()));
create policy equipment_extinguishers_write on public.equipment_extinguishers for all to authenticated
  using (organization_id in (select app.member_orgs()) and branch_id in (select app.branches_with_permission('vehicles.write', true)))
  with check (organization_id in (select app.member_orgs()) and branch_id in (select app.branches_with_permission('vehicles.write', true)));

create policy equipment_action_schedules_select on public.equipment_action_schedules for select to authenticated
  using (organization_id in (select app.member_orgs()) and branch_id in (select app.accessible_branches()));

create policy work_orders_select on public.work_orders for select to authenticated
  using (organization_id in (select app.member_orgs()) and branch_id in (select app.accessible_branches())
         and (branch_id in (select app.branches_with_permission('work_orders.manage', false))
              or technician_id in (select app.my_technician_ids())));
create policy work_orders_insert on public.work_orders for insert to authenticated
  with check (organization_id in (select app.member_orgs()) and branch_id in (select app.branches_with_permission('work_orders.manage', true)));
create policy work_orders_update on public.work_orders for update to authenticated
  using (organization_id in (select app.member_orgs())
         and (branch_id in (select app.branches_with_permission('work_orders.manage', true))
              or (branch_id in (select app.branches_with_permission('work_orders.execute', true))
                  and technician_id in (select app.my_technician_ids()))))
  with check (organization_id in (select app.member_orgs())
         and (branch_id in (select app.branches_with_permission('work_orders.manage', true))
              or (branch_id in (select app.branches_with_permission('work_orders.execute', true))
                  and technician_id in (select app.my_technician_ids()))));

create policy work_order_items_select on public.work_order_items for select to authenticated
  using (work_order_id in (select id from public.work_orders));
create policy work_order_items_manage on public.work_order_items for all to authenticated
  using (branch_id in (select app.branches_with_permission('work_orders.manage', true)) and work_order_id in (select id from public.work_orders))
  with check (branch_id in (select app.branches_with_permission('work_orders.manage', true)) and work_order_id in (select id from public.work_orders));
create policy work_order_items_execute on public.work_order_items for update to authenticated
  using (branch_id in (select app.branches_with_permission('work_orders.execute', true))
         and work_order_id in (select id from public.work_orders where technician_id in (select app.my_technician_ids())))
  with check (branch_id in (select app.branches_with_permission('work_orders.execute', true))
         and work_order_id in (select id from public.work_orders where technician_id in (select app.my_technician_ids())));

create policy work_order_events_select on public.work_order_events for select to authenticated
  using (work_order_id in (select id from public.work_orders));
create policy work_order_events_note on public.work_order_events for insert to authenticated
  with check (event = 'note' and work_order_id in (select id from public.work_orders)
              and branch_id in (select app.branches_with_any_permission(array['work_orders.manage', 'work_orders.execute'], true)));

create policy equipment_records_select on public.equipment_maintenance_records for select to authenticated
  using (organization_id in (select app.member_orgs()) and branch_id in (select app.accessible_branches()));
create policy equipment_records_insert on public.equipment_maintenance_records for insert to authenticated
  with check (organization_id in (select app.member_orgs()) and branch_id in (select app.branches_with_permission('maintenance.write', true))
              and (work_order_id is null or work_order_id in (select id from public.work_orders)));
create policy equipment_records_update on public.equipment_maintenance_records for update to authenticated
  using (organization_id in (select app.member_orgs()) and branch_id in (select app.branches_with_permission('maintenance.write', true)))
  with check (organization_id in (select app.member_orgs()) and branch_id in (select app.branches_with_permission('maintenance.write', true)));

create policy equipment_record_materials_select on public.equipment_record_materials for select to authenticated
  using (organization_id in (select app.member_orgs()) and branch_id in (select app.accessible_branches()));
create policy equipment_record_materials_insert on public.equipment_record_materials for insert to authenticated
  with check (organization_id in (select app.member_orgs()) and branch_id in (select app.branches_with_permission('maintenance.write', true)));

create policy equipment_incidents_select on public.equipment_incidents for select to authenticated
  using (organization_id in (select app.member_orgs()) and branch_id in (select app.accessible_branches()));
create policy equipment_incidents_insert on public.equipment_incidents for insert to authenticated
  with check (organization_id in (select app.member_orgs()) and branch_id in (select app.branches_with_permission('incidents.write', true)));
create policy equipment_incidents_update on public.equipment_incidents for update to authenticated
  using (organization_id in (select app.member_orgs()) and branch_id in (select app.branches_with_permission('incidents.write', true)))
  with check (organization_id in (select app.member_orgs()) and branch_id in (select app.branches_with_permission('incidents.write', true)));

create policy pci_documents_select on public.pci_documents for select to authenticated
  using (organization_id in (select app.member_orgs()) and branch_id in (select app.accessible_branches())
         and (work_order_id is null or work_order_id in (select id from public.work_orders)));
create policy pci_documents_insert on public.pci_documents for insert to authenticated
  with check (organization_id in (select app.member_orgs())
              and branch_id in (select app.branches_with_any_permission(
                    array['customers.write', 'vehicles.write', 'maintenance.write', 'work_orders.execute', 'work_orders.manage', 'incidents.write'], true))
              and (work_order_id is null or work_order_id in (select id from public.work_orders)));
create policy pci_documents_update on public.pci_documents for update to authenticated
  using (organization_id in (select app.member_orgs())
         and branch_id in (select app.branches_with_any_permission(array['customers.write', 'vehicles.write', 'maintenance.write'], true)))
  with check (organization_id in (select app.member_orgs())
         and branch_id in (select app.branches_with_any_permission(array['customers.write', 'vehicles.write', 'maintenance.write'], true)));

-- Permisos de columna: lo calculado o protegido no lo escribe el usuario.
revoke all on public.equipment_categories, public.equipment_types, public.maintenance_action_types,
  public.org_action_type_settings, public.technicians, public.installations, public.equipment,
  public.equipment_extinguishers, public.equipment_action_schedules, public.work_orders,
  public.work_order_items, public.work_order_events, public.equipment_maintenance_records,
  public.equipment_record_materials, public.equipment_incidents, public.pci_documents from anon, authenticated;

grant select on public.equipment_categories, public.equipment_types, public.maintenance_action_types,
  public.org_action_type_settings, public.technicians, public.installations, public.equipment,
  public.equipment_extinguishers, public.equipment_action_schedules, public.work_orders,
  public.work_order_items, public.work_order_events, public.equipment_maintenance_records,
  public.equipment_record_materials, public.equipment_incidents, public.pci_documents to authenticated;

grant insert (organization_id, category_code, code, name, attribute_schema, active), update (name, attribute_schema, active), delete
  on public.equipment_types to authenticated;
grant insert (organization_id, category_code, code, name, kind, interval_months, performed_by, enabled_by_default, legal_reference, description, position, active),
  update (name, interval_months, performed_by, enabled_by_default, legal_reference, description, position, active)
  on public.maintenance_action_types to authenticated;
grant insert, update, delete on public.org_action_type_settings to authenticated;
grant insert (organization_id, member_id, full_name, phone, email, qualification_notes, active),
  update (member_id, full_name, phone, email, qualification_notes, active) on public.technicians to authenticated;
grant insert (organization_id, branch_id, customer_id, name, establishment_type, address_line1, postal_code, city, province,
              contact_name, contact_phone, contact_email, notes, status, created_by),
  update (customer_id, name, establishment_type, address_line1, postal_code, city, province, contact_name, contact_phone,
          contact_email, notes, status, deleted_at) on public.installations to authenticated;
grant insert (organization_id, branch_id, installation_id, category_code, type_id, code, manufacturer, model, serial_number,
              location, installed_on, manufactured_on, status, notes, attributes, created_by),
  update (installation_id, type_id, code, manufacturer, model, serial_number, location, installed_on, manufactured_on,
          status, notes, attributes, deleted_at) on public.equipment to authenticated;
grant insert (equipment_id, organization_id, branch_id, agent, charge_value, charge_unit, efficacy, mobility, stamped_on, put_in_service_on, retimbrados_before),
  update (agent, charge_value, charge_unit, efficacy, mobility, stamped_on, put_in_service_on, retimbrados_before)
  on public.equipment_extinguishers to authenticated;
grant insert (organization_id, branch_id, customer_id, installation_id, service_type, status, scheduled_for, scheduled_time,
              technician_id, description, notes, appointment_id, created_by),
  update (customer_id, installation_id, service_type, status, scheduled_for, scheduled_time, technician_id, description,
          notes, completion_notes) on public.work_orders to authenticated;
grant insert (organization_id, branch_id, work_order_id, equipment_id, planned_action_type_id), delete,
  update (status, result, observations, record_id) on public.work_order_items to authenticated;
grant insert (organization_id, branch_id, work_order_id, event, note, actor_id) on public.work_order_events to authenticated;
grant insert (organization_id, branch_id, equipment_id, installation_id, work_order_id, technician_id, action_type_id, performed_on, result,
              observations, next_action_recommended_on, created_by),
  update (action_type_id, performed_on, result, observations, next_action_recommended_on, technician_id, amendment_reason,
          voided_at, void_reason) on public.equipment_maintenance_records to authenticated;
grant insert (organization_id, branch_id, record_id, description, reference, quantity, unit) on public.equipment_record_materials to authenticated;
grant insert (organization_id, branch_id, installation_id, equipment_id, work_order_id, record_id, severity, title, description,
              status, detected_on, reported_by),
  update (severity, title, description, status, resolved_on, resolution) on public.equipment_incidents to authenticated;
grant insert (organization_id, branch_id, installation_id, equipment_id, work_order_id, record_id, incident_id, kind, title,
              storage_path, mime_type, size_bytes, uploaded_by),
  update (title, deleted_at) on public.pci_documents to authenticated;

-- Los recálculos y la numeración escriben con el propietario de la función.
grant execute on function app.recompute_equipment_schedule(uuid), app.equipment_applicable_actions(uuid, text) to service_role;

-- La auditoría no registra los recálculos automáticos de vencimientos (no son
-- cambios del usuario). Misma función, una exclusión más.
create or replace function app.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_action text;
  v_changed text[];
  v_entity text := tg_argv[0];
begin
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(n.key order by n.key), '{}') into v_changed
    from jsonb_each(to_jsonb(new)) n
    join jsonb_each(to_jsonb(old)) o on o.key = n.key
    where n.value is distinct from o.value and n.key not in ('updated_at', 'version', 'next_action_on', 'last_action_on');
    if cardinality(v_changed) = 0 then
      return null;
    end if;
    v_action := v_entity || case
      when 'deleted_at' = any (v_changed) and (v_row ->> 'deleted_at') is not null then '.deleted'
      when 'deleted_at' = any (v_changed) then '.restored'
      else '.updated' end;
  elsif tg_op = 'INSERT' then
    v_action := v_entity || '.created';
  else
    v_action := v_entity || '.removed';
  end if;

  insert into public.audit_logs (organization_id, actor_type, actor_id, action, resource_type, resource_id, metadata)
  values (
    (v_row ->> 'organization_id')::uuid,
    case when (select auth.uid()) is null then 'system' else 'user' end,
    (select auth.uid()),
    v_action,
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'branch_id'),
    case when v_changed is null then '{}'::jsonb else jsonb_build_object('changed', to_jsonb(v_changed)) end
  );
  return null;
end;
$$;
