-- =============================================================================
-- RevisaYa · 0700 · Recordatorios, plantillas, dominios de envío, registro de
-- correos, eventos de webhook y supresiones.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- reminders: un recordatorio por EVENTO (vehículo, tipo, fecha prevista, offset).
-- La clave única hace imposible duplicarlo aunque el planificador se ejecute
-- varias veces o en paralelo.
-- -----------------------------------------------------------------------------
create table public.reminders (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null,
  branch_id                 uuid not null,
  customer_id               uuid not null,
  vehicle_id                uuid not null,
  type                      text not null check (type in ('service_date', 'service_km')),
  due_date                  date not null,
  offset_days               integer not null check (offset_days between 0 and 365),
  scheduled_for             timestamptz not null,
  status                    text not null default 'scheduled' check (status in (
                              'scheduled', 'processing', 'retrying', 'sent', 'delivered',
                              'bounced', 'complained', 'failed', 'skipped', 'canceled')),
  skip_reason               text check (skip_reason in (
                              'no_email', 'opted_out', 'suppressed', 'quota_exceeded',
                              'subscription_inactive', 'feature_unavailable', 'superseded',
                              'reminders_disabled', 'vehicle_inactive', 'canceled_by_user')),
  attempts                  smallint not null default 0 check (attempts >= 0),
  max_attempts              smallint not null default 5 check (max_attempts between 1 and 10),
  next_attempt_at           timestamptz,
  locked_until              timestamptz,
  locked_by                 text,
  provider                  text,
  provider_message_id       text,
  sent_at                   timestamptz,
  last_error                text check (char_length(last_error) <= 1000),
  booking_token_hash        bytea unique check (octet_length(booking_token_hash) = 32),
  booking_token_expires_at  timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  foreign key (organization_id, branch_id, customer_id)
    references public.customers (organization_id, branch_id, id) on delete restrict,
  foreign key (organization_id, branch_id, vehicle_id)
    references public.vehicles (organization_id, branch_id, id) on delete restrict,
  constraint reminders_event_unique unique (vehicle_id, type, due_date, offset_days),
  constraint reminders_tenant_key unique (organization_id, branch_id, id),
  -- "Enviado" solo con confirmación del proveedor (identificador del mensaje).
  constraint reminders_sent_has_provider_id check (
    status not in ('sent', 'delivered', 'bounced', 'complained')
    or (provider_message_id is not null and sent_at is not null)),
  constraint reminders_skipped_has_reason check (
    status not in ('skipped', 'canceled') or skip_reason is not null),
  constraint reminders_retry_has_time check (status <> 'retrying' or next_attempt_at is not null),
  constraint reminders_processing_has_lease check (status <> 'processing' or locked_until is not null)
);
create index reminders_dispatch_idx on public.reminders (scheduled_for)
  where status = 'scheduled';
create index reminders_retry_idx on public.reminders (next_attempt_at)
  where status = 'retrying';
create index reminders_lease_idx on public.reminders (locked_until)
  where status = 'processing';
create index reminders_panel_idx on public.reminders (organization_id, branch_id, status, scheduled_for desc);
create index reminders_vehicle_idx on public.reminders (vehicle_id, due_date desc);
create index reminders_customer_idx on public.reminders (customer_id);

create trigger reminders_updated_at before update on public.reminders
  for each row execute function app.set_updated_at();
create trigger reminders_tenant_immutable before update on public.reminders
  for each row execute function app.forbid_tenant_change();

-- -----------------------------------------------------------------------------
-- email_templates (branch_id null = toda la organización). La plantilla
-- original vive versionada en código: "restaurar" = borrar la personalización.
-- -----------------------------------------------------------------------------
create table public.email_templates (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  branch_id        uuid,
  kind             text not null check (kind in (
                     'reminder_service_date', 'reminder_service_km',
                     'booking_received', 'booking_confirmed', 'booking_rejected', 'booking_rescheduled')),
  subject          text not null check (char_length(btrim(subject)) between 1 and 200),
  body             text not null check (char_length(btrim(body)) between 1 and 5000),
  button_label     text not null default 'Pedir cita' check (char_length(btrim(button_label)) between 1 and 40),
  button_enabled   boolean not null default true,
  status           text not null default 'active' check (status in ('active', 'draft')),
  version          integer not null default 1 check (version >= 1),
  updated_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (organization_id, branch_id) references public.branches (organization_id, id) on delete cascade
);
create unique index email_templates_scope_unique on public.email_templates
  (organization_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), kind);

create function app.bump_template_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;
create trigger email_templates_version before update on public.email_templates
  for each row execute function app.bump_template_version();
create trigger email_templates_tenant_immutable before update on public.email_templates
  for each row execute function app.forbid_tenant_change();

-- -----------------------------------------------------------------------------
-- sending_domains: dominio propio del taller. Solo se usa como remitente si
-- está verificado (nunca se simula el envío desde un dominio no verificado).
-- -----------------------------------------------------------------------------
create table public.sending_domains (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete restrict,
  domain              extensions.citext not null
                      check (domain ~* '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'),
  from_local_part     text not null default 'avisos' check (from_local_part ~ '^[a-z0-9._-]{1,64}$'),
  provider            text not null check (provider in ('resend', 'ses', 'sendgrid')),
  provider_domain_id  text,
  status              text not null default 'pending'
                      check (status in ('pending', 'verified', 'failed', 'temporary_failure')),
  dns_records         jsonb not null default '[]'::jsonb,
  verified_at         timestamptz,
  last_checked_at     timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint sending_domains_unique unique (organization_id, domain),
  constraint sending_domains_org_id_key unique (organization_id, id),
  constraint sending_domains_verified_at check (status <> 'verified' or verified_at is not null)
);
create trigger sending_domains_updated_at before update on public.sending_domains
  for each row execute function app.set_updated_at();
create trigger sending_domains_tenant_immutable before update on public.sending_domains
  for each row execute function app.forbid_tenant_change();

alter table public.branch_settings
  add constraint branch_settings_sending_domain_fk
  foreign key (organization_id, sending_domain_id)
  references public.sending_domains (organization_id, id) on delete set null (sending_domain_id);

-- El modo "dominio propio" exige un dominio verificado de la organización.
create function app.validate_sender_mode()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sender_mode = 'custom_domain' and not exists (
       select 1 from public.sending_domains d
       where d.id = new.sending_domain_id
         and d.organization_id = new.organization_id
         and d.status = 'verified') then
    raise exception 'sending_domain_not_verified' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger branch_settings_sender_mode
  before insert or update of sender_mode, sending_domain_id on public.branch_settings
  for each row execute function app.validate_sender_mode();

-- Si un dominio deja de estar verificado, las sucursales vuelven al modo compartido.
create function app.on_sending_domain_unverified()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'verified' and new.status <> 'verified' then
    update public.branch_settings
       set sender_mode = 'shared', sending_domain_id = null
     where sending_domain_id = new.id;
  end if;
  return null;
end;
$$;
create trigger sending_domains_unverified after update of status on public.sending_domains
  for each row execute function app.on_sending_domain_unverified();

-- -----------------------------------------------------------------------------
-- email_logs: un registro por mensaje aceptado/rechazado por el proveedor.
-- -----------------------------------------------------------------------------
create table public.email_logs (
  id                   bigint generated always as identity primary key,
  organization_id      uuid not null references public.organizations (id) on delete restrict,
  branch_id            uuid not null,
  reminder_id          uuid,
  appointment_id       uuid,
  customer_id          uuid,
  vehicle_id           uuid,
  kind                 text not null check (kind in (
                         'reminder', 'booking_received', 'booking_confirmed', 'booking_rejected',
                         'booking_rescheduled', 'test')),
  to_email             extensions.citext not null,
  from_email           text not null,
  reply_to             text,
  subject              text not null check (char_length(subject) <= 200),
  provider             text not null check (provider in ('resend', 'ses', 'sendgrid')),
  provider_message_id  text,
  status               text not null check (status in (
                         'accepted', 'delivered', 'delivery_delayed', 'bounced', 'complained', 'failed')),
  bounce_type          text check (bounce_type in ('hard', 'soft', 'undetermined')),
  error_code           text check (char_length(error_code) <= 100),
  error_message        text check (char_length(error_message) <= 1000),
  sent_at              timestamptz,
  delivered_at         timestamptz,
  opened_at            timestamptz,  -- solo si el seguimiento de aperturas está activado (P8)
  created_at           timestamptz not null default now(),
  foreign key (organization_id, branch_id) references public.branches (organization_id, id) on delete restrict,
  foreign key (organization_id, branch_id, reminder_id)
    references public.reminders (organization_id, branch_id, id) on delete set null (reminder_id),
  foreign key (organization_id, branch_id, customer_id)
    references public.customers (organization_id, branch_id, id) on delete set null (customer_id),
  foreign key (organization_id, branch_id, vehicle_id)
    references public.vehicles (organization_id, branch_id, id) on delete set null (vehicle_id),
  constraint email_logs_provider_message_unique unique (provider, provider_message_id),
  constraint email_logs_accepted_has_id check (status = 'failed' or provider_message_id is not null)
);
create index email_logs_org_created_idx on public.email_logs (organization_id, branch_id, created_at desc);
create index email_logs_reminder_idx on public.email_logs (reminder_id) where reminder_id is not null;
create index email_logs_customer_idx on public.email_logs (customer_id) where customer_id is not null;

-- Eventos de webhook del proveedor (idempotencia).
create table public.email_events (
  id                 bigint generated always as identity primary key,
  provider           text not null check (provider in ('resend', 'ses', 'sendgrid')),
  provider_event_id  text not null,
  email_log_id       bigint references public.email_logs (id) on delete cascade,
  type               text not null check (char_length(type) <= 60),
  occurred_at        timestamptz not null,
  payload_min        jsonb not null default '{}'::jsonb,
  received_at        timestamptz not null default now(),
  constraint email_events_unique unique (provider, provider_event_id)
);
create index email_events_log_idx on public.email_events (email_log_id);

-- Lista de supresión por organización (rebotes definitivos, quejas, bajas).
create table public.email_suppressions (
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  email            extensions.citext not null,
  reason           text not null check (reason in ('hard_bounce', 'complaint', 'unsubscribe', 'manual')),
  source_event_id  bigint references public.email_events (id) on delete set null,
  created_at       timestamptz not null default now(),
  primary key (organization_id, email)
);

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.reminders enable row level security;
alter table public.reminders force row level security;
alter table public.email_templates enable row level security;
alter table public.email_templates force row level security;
alter table public.sending_domains enable row level security;
alter table public.sending_domains force row level security;
alter table public.email_logs enable row level security;
alter table public.email_logs force row level security;
alter table public.email_events enable row level security;
alter table public.email_events force row level security;
alter table public.email_suppressions enable row level security;
alter table public.email_suppressions force row level security;

-- reminders: lectura con 'reminders.read'; el usuario solo puede CANCELAR un
-- recordatorio programado. Todo lo demás lo escribe el motor (service_role).
create policy reminders_select on public.reminders for select to authenticated
  using (organization_id in (select app.member_orgs())
         and branch_id in (select app.branches_with_permission('reminders.read', false)));
create policy reminders_cancel on public.reminders for update to authenticated
  using (organization_id in (select app.member_orgs())
         and branch_id in (select app.branches_with_permission('admin', true))
         and status in ('scheduled', 'retrying'))
  with check (status = 'canceled' and skip_reason = 'canceled_by_user');

create policy email_templates_select on public.email_templates for select to authenticated
  using (organization_id in (select app.member_orgs())
         and (branch_id is null or branch_id in (select app.accessible_branches())));
create policy email_templates_write on public.email_templates for all to authenticated
  using (organization_id in (select app.admin_orgs()))
  with check (organization_id in (select app.admin_orgs()));

create policy sending_domains_select on public.sending_domains for select to authenticated
  using (organization_id in (select app.admin_orgs()));

create policy email_logs_select on public.email_logs for select to authenticated
  using (organization_id in (select app.member_orgs())
         and branch_id in (select app.branches_with_permission('reminders.read', false)));

create policy email_suppressions_select on public.email_suppressions for select to authenticated
  using (organization_id in (select app.admin_orgs()));
create policy email_suppressions_insert_manual on public.email_suppressions for insert to authenticated
  with check (organization_id in (select app.admin_orgs()) and reason = 'manual');
create policy email_suppressions_delete_manual on public.email_suppressions for delete to authenticated
  using (organization_id in (select app.admin_orgs()) and reason = 'manual');

revoke all on public.reminders, public.email_templates, public.sending_domains, public.email_logs,
  public.email_events, public.email_suppressions from anon, authenticated;
grant select on public.reminders to authenticated;
grant update (status, skip_reason) on public.reminders to authenticated;
grant select, delete on public.email_templates to authenticated;
grant insert (organization_id, branch_id, kind, subject, body, button_label, button_enabled, status, updated_by)
  on public.email_templates to authenticated;
grant update (subject, body, button_label, button_enabled, status, updated_by)
  on public.email_templates to authenticated;
grant select on public.sending_domains, public.email_logs to authenticated;
grant select, insert, delete on public.email_suppressions to authenticated;
grant update (sender_mode, sending_domain_id) on public.branch_settings to authenticated;
