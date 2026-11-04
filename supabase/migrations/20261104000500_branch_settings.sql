-- =============================================================================
-- RevisaYa · 0500 · Configuración por sucursal: avisos, horario de envío,
-- festivos, disponibilidad de citas y remitente.
-- =============================================================================

create table public.branch_settings (
  branch_id                uuid primary key,
  organization_id          uuid not null,
  reminders_enabled        boolean not null default false,  -- el taller los activa (paso 5 del PDF)
  offsets_days             integer[] not null default '{30,7}',
  send_window_start        time not null default '09:00',
  send_window_end          time not null default '19:00',
  send_weekdays            smallint[] not null default '{1,2,3,4,5}',  -- ISO: lunes = 1
  default_interval_months  smallint not null default 12 check (default_interval_months between 1 and 60),
  default_interval_km      integer not null default 15000 check (default_interval_km between 1000 and 100000),
  km_reminders_enabled     boolean not null default false,
  km_offset_before         integer not null default 1000 check (km_offset_before between 0 and 10000),
  booking_enabled          boolean not null default true,
  booking_mode             text not null default 'free_request' check (booking_mode in ('free_request', 'slots')),
  slot_minutes             smallint not null default 60 check (slot_minutes in (15, 30, 45, 60, 90, 120)),
  booking_notice_hours     smallint not null default 24 check (booking_notice_hours between 0 and 336),
  sender_mode              text not null default 'shared' check (sender_mode in ('shared', 'custom_domain')),
  sending_domain_id        uuid,
  reply_to_email           extensions.citext check (reply_to_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  digest_frequency         text not null default 'weekly' check (digest_frequency in ('off', 'daily', 'weekly')),
  updated_at               timestamptz not null default now(),
  foreign key (organization_id, branch_id) references public.branches (organization_id, id) on delete cascade,
  constraint branch_settings_offsets_valid check (
    cardinality(offsets_days) between 1 and 5
    and 0 <= all (offsets_days) and 365 >= all (offsets_days)
  ),
  constraint branch_settings_weekdays_valid check (
    cardinality(send_weekdays) between 1 and 7
    and 1 <= all (send_weekdays) and 7 >= all (send_weekdays)
  ),
  constraint branch_settings_window_valid check (send_window_end > send_window_start)
);
create trigger branch_settings_updated_at before update on public.branch_settings
  for each row execute function app.set_updated_at();
create trigger branch_settings_tenant_immutable before update on public.branch_settings
  for each row execute function app.forbid_tenant_change();

-- Sin offsets duplicados (no se puede expresar en un CHECK sin subconsulta).
create function app.validate_branch_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(distinct x) from unnest(new.offsets_days) x) <> cardinality(new.offsets_days) then
    raise exception 'duplicate_offsets' using errcode = '23514';
  end if;
  if (select count(distinct x) from unnest(new.send_weekdays) x) <> cardinality(new.send_weekdays) then
    raise exception 'duplicate_weekdays' using errcode = '23514';
  end if;
  -- Los recordatorios por km son una funcionalidad del plan Max o superior.
  if new.km_reminders_enabled
     and (tg_op = 'INSERT' or not old.km_reminders_enabled)
     and (select auth.uid()) is not null then
    perform app.assert_feature(new.organization_id, 'km_reminders');
  end if;
  return new;
end;
$$;
create trigger branch_settings_validate before insert or update on public.branch_settings
  for each row execute function app.validate_branch_settings();

-- Toda sucursal nace con su configuración por defecto.
create function app.create_branch_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.branch_settings (branch_id, organization_id)
  values (new.id, new.organization_id)
  on conflict (branch_id) do nothing;
  return null;
end;
$$;
create trigger branches_create_settings after insert on public.branches
  for each row execute function app.create_branch_settings();

-- Festivos y días de cierre (no se envían avisos).
create table public.blackout_dates (
  branch_id        uuid not null,
  organization_id  uuid not null,
  day              date not null,
  reason           text check (char_length(reason) <= 120),
  created_at       timestamptz not null default now(),
  primary key (branch_id, day),
  foreign key (organization_id, branch_id) references public.branches (organization_id, id) on delete cascade
);

-- Disponibilidad para citas (booking_mode = 'slots').
create table public.availability_rules (
  id               uuid primary key default gen_random_uuid(),
  branch_id        uuid not null,
  organization_id  uuid not null,
  weekday          smallint not null check (weekday between 1 and 7),
  start_time       time not null,
  end_time         time not null,
  capacity         smallint not null default 1 check (capacity between 1 and 50),
  created_at       timestamptz not null default now(),
  foreign key (organization_id, branch_id) references public.branches (organization_id, id) on delete cascade,
  constraint availability_rules_range check (end_time > start_time)
);
create index availability_rules_branch_idx on public.availability_rules (branch_id, weekday);

-- RLS: lectura para quien tiene acceso a la sucursal; escritura, administradores.
alter table public.branch_settings enable row level security;
alter table public.branch_settings force row level security;
alter table public.blackout_dates enable row level security;
alter table public.blackout_dates force row level security;
alter table public.availability_rules enable row level security;
alter table public.availability_rules force row level security;

create policy branch_settings_select on public.branch_settings for select to authenticated
  using (branch_id in (select app.accessible_branches()));
create policy branch_settings_update on public.branch_settings for update to authenticated
  using (organization_id in (select app.admin_orgs()) and branch_id in (select app.accessible_branches()))
  with check (organization_id in (select app.admin_orgs()) and branch_id in (select app.accessible_branches()));

create policy blackout_dates_select on public.blackout_dates for select to authenticated
  using (branch_id in (select app.accessible_branches()));
create policy blackout_dates_write on public.blackout_dates for all to authenticated
  using (organization_id in (select app.admin_orgs()) and branch_id in (select app.accessible_branches()))
  with check (organization_id in (select app.admin_orgs()) and branch_id in (select app.accessible_branches()));

create policy availability_rules_select on public.availability_rules for select to authenticated
  using (branch_id in (select app.accessible_branches()));
create policy availability_rules_write on public.availability_rules for all to authenticated
  using (organization_id in (select app.admin_orgs()) and branch_id in (select app.accessible_branches()))
  with check (organization_id in (select app.admin_orgs()) and branch_id in (select app.accessible_branches()));

revoke all on public.branch_settings, public.blackout_dates, public.availability_rules from anon, authenticated;
grant select on public.branch_settings to authenticated;
grant update (reminders_enabled, offsets_days, send_window_start, send_window_end, send_weekdays,
              default_interval_months, default_interval_km, km_reminders_enabled, km_offset_before,
              booking_enabled, booking_mode, slot_minutes, booking_notice_hours, reply_to_email,
              digest_frequency)
  on public.branch_settings to authenticated;
grant select, insert, update, delete on public.blackout_dates, public.availability_rules to authenticated;
