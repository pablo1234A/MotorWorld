-- =============================================================================
-- RevisaYa · 0800 · Citas. Una SOLICITUD (requested) no es una cita
-- CONFIRMADA (confirmed): estados y columnas distintos, transiciones
-- validadas en la base de datos e historial automático.
-- =============================================================================

create table public.appointments (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null,
  branch_id         uuid not null,
  customer_id       uuid,
  vehicle_id        uuid,
  reminder_id       uuid,
  source            text not null check (source in ('reminder_link', 'booking_page', 'manual', 'api')),
  requester_name    text not null check (char_length(btrim(requester_name)) between 1 and 160),
  requester_email   extensions.citext check (requester_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  requester_phone   text check (requester_phone ~ '^\+[1-9][0-9]{6,14}$'),
  plate_entered     text check (char_length(plate_entered) <= 20),
  requested_date    date,
  requested_slot    tstzrange,
  customer_message  text check (char_length(customer_message) <= 2000),
  status            text not null default 'requested' check (status in (
                      'requested', 'confirmed', 'rejected', 'canceled', 'completed', 'no_show')),
  confirmed_start   timestamptz,
  confirmed_end     timestamptz,
  internal_notes    text check (char_length(internal_notes) <= 5000),
  decided_by        uuid references public.profiles (id) on delete set null,
  decided_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (organization_id, branch_id) references public.branches (organization_id, id) on delete restrict,
  foreign key (organization_id, branch_id, customer_id)
    references public.customers (organization_id, branch_id, id) on delete set null (customer_id),
  foreign key (organization_id, branch_id, vehicle_id)
    references public.vehicles (organization_id, branch_id, id) on delete set null (vehicle_id),
  foreign key (organization_id, branch_id, reminder_id)
    references public.reminders (organization_id, branch_id, id) on delete set null (reminder_id),
  constraint appointments_tenant_key unique (organization_id, branch_id, id),
  constraint appointments_contact check (requester_email is not null or requester_phone is not null),
  constraint appointments_confirmed_has_time check (
    status not in ('confirmed', 'completed', 'no_show')
    or (confirmed_start is not null and confirmed_end is not null)),
  constraint appointments_time_range check (confirmed_end is null or confirmed_end > confirmed_start)
);
create index appointments_panel_idx on public.appointments (organization_id, branch_id, status, created_at desc);
create index appointments_calendar_idx on public.appointments (branch_id, confirmed_start)
  where status = 'confirmed';
create index appointments_vehicle_idx on public.appointments (vehicle_id) where vehicle_id is not null;
create index appointments_customer_idx on public.appointments (customer_id) where customer_id is not null;

create trigger appointments_updated_at before update on public.appointments
  for each row execute function app.set_updated_at();
create trigger appointments_tenant_immutable before update on public.appointments
  for each row execute function app.forbid_tenant_change();

alter table public.email_logs
  add constraint email_logs_appointment_fk
  foreign key (organization_id, branch_id, appointment_id)
  references public.appointments (organization_id, branch_id, id) on delete set null (appointment_id);
create index email_logs_appointment_idx on public.email_logs (appointment_id) where appointment_id is not null;

-- Transiciones válidas:
--   requested -> confirmed | rejected | canceled
--   confirmed -> confirmed (cambio de fecha) | completed | no_show | canceled
--   rejected, canceled, completed, no_show: finales
create function app.validate_appointment_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('requested', 'confirmed') then
      raise exception 'invalid_appointment_status' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.status = old.status and new.status <> 'confirmed' then
    return new;
  end if;

  if not (
       (old.status = 'requested' and new.status in ('confirmed', 'rejected', 'canceled'))
    or (old.status = 'confirmed' and new.status in ('confirmed', 'completed', 'no_show', 'canceled'))
  ) then
    raise exception 'invalid_appointment_transition'
      using errcode = '23514', detail = format('%s -> %s', old.status, new.status);
  end if;

  if new.status is distinct from old.status
     or new.confirmed_start is distinct from old.confirmed_start then
    new.decided_at := now();
    new.decided_by := coalesce((select auth.uid()), new.decided_by);
  end if;
  return new;
end;
$$;
create trigger appointments_validate_transition before insert or update on public.appointments
  for each row execute function app.validate_appointment_transition();

create table public.appointment_events (
  id               bigint generated always as identity primary key,
  organization_id  uuid not null,
  branch_id        uuid not null,
  appointment_id   uuid not null,
  from_status      text,
  to_status        text not null,
  old_start        timestamptz,
  new_start        timestamptz,
  actor_user_id    uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  foreign key (organization_id, branch_id, appointment_id)
    references public.appointments (organization_id, branch_id, id) on delete cascade
);
create index appointment_events_appointment_idx on public.appointment_events (appointment_id, created_at);

create function app.log_appointment_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.status is distinct from old.status
     or new.confirmed_start is distinct from old.confirmed_start then
    insert into public.appointment_events
      (organization_id, branch_id, appointment_id, from_status, to_status, old_start, new_start, actor_user_id)
    values
      (new.organization_id, new.branch_id, new.id,
       case when tg_op = 'UPDATE' then old.status end, new.status,
       case when tg_op = 'UPDATE' then old.confirmed_start end, new.confirmed_start,
       (select auth.uid()));
  end if;
  return null;
end;
$$;
create trigger appointments_log_event after insert or update on public.appointments
  for each row execute function app.log_appointment_event();

-- RLS: el taller gestiona con 'appointments.manage'. Las solicitudes públicas
-- las crea el servidor (service_role) tras Turnstile y rate limiting.
alter table public.appointments enable row level security;
alter table public.appointments force row level security;
alter table public.appointment_events enable row level security;
alter table public.appointment_events force row level security;

create policy appointments_select on public.appointments for select to authenticated
  using (organization_id in (select app.member_orgs())
         and branch_id in (select app.branches_with_permission('appointments.manage', false)));
create policy appointments_insert on public.appointments for insert to authenticated
  with check (organization_id in (select app.member_orgs())
              and branch_id in (select app.branches_with_permission('appointments.manage', true))
              and source = 'manual');
create policy appointments_update on public.appointments for update to authenticated
  using (organization_id in (select app.member_orgs())
         and branch_id in (select app.branches_with_permission('appointments.manage', true)))
  with check (organization_id in (select app.member_orgs())
              and branch_id in (select app.branches_with_permission('appointments.manage', true)));

create policy appointment_events_select on public.appointment_events for select to authenticated
  using (organization_id in (select app.member_orgs())
         and branch_id in (select app.branches_with_permission('appointments.manage', false)));

revoke all on public.appointments, public.appointment_events from anon, authenticated;
grant select on public.appointments, public.appointment_events to authenticated;
grant insert (organization_id, branch_id, customer_id, vehicle_id, source, requester_name, requester_email,
              requester_phone, plate_entered, requested_date, customer_message, status,
              confirmed_start, confirmed_end, internal_notes)
  on public.appointments to authenticated;
grant update (customer_id, vehicle_id, status, confirmed_start, confirmed_end, internal_notes)
  on public.appointments to authenticated;
