-- =============================================================================
-- RevisaYa · 1000 · Consumo mensual (correos), integraciones (Google
-- Calendar), secretos cifrados y API keys.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- usage_counters (entidad "usage_records"). Periodo = mes natural en la zona
-- horaria de la organización (P4). Cambiar de plan NO reinicia `used`.
-- -----------------------------------------------------------------------------
create table public.usage_counters (
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  resource         text not null check (resource in ('emails')),
  period_start     date not null check (extract(day from period_start) = 1),
  used             integer not null default 0 check (used >= 0),
  limit_snapshot   integer check (limit_snapshot >= 0),
  updated_at       timestamptz not null default now(),
  primary key (organization_id, resource, period_start)
);

create function app.usage_period(p_org uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select date_trunc('month', now() at time zone o.timezone)::date
  from public.organizations o where o.id = p_org;
$$;

-- Reserva atómica de consumo. Devuelve el periodo reservado, o null si el
-- límite no lo permite. Un único UPSERT condicionado: consistente con
-- cualquier número de envíos simultáneos.
create function app.reserve_usage(p_org uuid, p_resource text, p_amount integer default 1)
returns date
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_period date;
  v_used integer;
begin
  if p_amount is null or p_amount < 1 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  v_limit := app.org_limit(p_org, p_resource);  -- RY002 si la suscripción no está activa
  v_period := app.usage_period(p_org);
  if v_limit is not null and p_amount > v_limit then
    return null;
  end if;

  insert into public.usage_counters as uc (organization_id, resource, period_start, used, limit_snapshot)
  values (p_org, p_resource, v_period, p_amount, v_limit)
  on conflict (organization_id, resource, period_start) do update
    set used = uc.used + p_amount,
        limit_snapshot = excluded.limit_snapshot,
        updated_at = now()
    where excluded.limit_snapshot is null or uc.used + p_amount <= excluded.limit_snapshot
  returning uc.used into v_used;

  if v_used is null then
    return null;
  end if;
  return v_period;
end;
$$;

-- Libera una reserva (envío fallido definitivamente) en el MISMO periodo en
-- que se reservó, para no tocar el contador de un mes posterior.
create function app.release_usage(p_org uuid, p_resource text, p_period date, p_amount integer default 1)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.usage_counters
     set used = greatest(used - p_amount, 0), updated_at = now()
   where organization_id = p_org and resource = p_resource and period_start = p_period;
$$;

grant execute on function app.usage_period(uuid) to authenticated, service_role;
grant execute on function app.reserve_usage(uuid, text, integer),
  app.release_usage(uuid, text, date, integer) to service_role;

-- -----------------------------------------------------------------------------
-- integrations y secretos
-- -----------------------------------------------------------------------------
create table public.integrations (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations (id) on delete restrict,
  branch_id               uuid,
  type                    text not null check (type in ('google_calendar')),
  status                  text not null check (status in ('connected', 'error', 'revoked', 'disconnected')),
  external_account_email  extensions.citext,
  scopes                  text[] not null default '{}',
  calendar_id             text,
  connected_by            uuid references public.profiles (id) on delete set null,
  connected_at            timestamptz,
  last_sync_at            timestamptz,
  last_error              text check (char_length(last_error) <= 1000),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  foreign key (organization_id, branch_id) references public.branches (organization_id, id) on delete cascade,
  constraint integrations_org_id_key unique (organization_id, id)
);
create unique index integrations_active_unique on public.integrations
  (organization_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), type)
  where status in ('connected', 'error');
create trigger integrations_updated_at before update on public.integrations
  for each row execute function app.set_updated_at();
create trigger integrations_tenant_immutable before update on public.integrations
  for each row execute function app.forbid_tenant_change();

-- Tokens OAuth cifrados con AES-256-GCM en la aplicación (la clave NO está en
-- la base de datos). Esquema privado: sin acceso para usuarios.
create table private.integration_secrets (
  integration_id  uuid primary key references public.integrations (id) on delete cascade,
  ciphertext      bytea not null,
  nonce           bytea not null check (octet_length(nonce) = 12),
  auth_tag        bytea not null check (octet_length(auth_tag) = 16),
  key_version     smallint not null check (key_version >= 1),
  updated_at      timestamptz not null default now()
);
revoke all on private.integration_secrets from public, anon, authenticated;
grant select, insert, update, delete on private.integration_secrets to service_role;

-- Enlace cita <-> evento de Google: impide eventos duplicados.
create table public.calendar_event_links (
  appointment_id      uuid primary key references public.appointments (id) on delete cascade,
  organization_id     uuid not null references public.organizations (id) on delete restrict,
  integration_id      uuid not null,
  google_calendar_id  text not null,
  google_event_id     text not null,
  etag                text,
  sync_status         text not null default 'synced' check (sync_status in ('synced', 'pending', 'error', 'deleted')),
  last_synced_at      timestamptz,
  last_error          text check (char_length(last_error) <= 1000),
  foreign key (organization_id, integration_id)
    references public.integrations (organization_id, id) on delete cascade,
  constraint calendar_event_links_event_unique unique (integration_id, google_event_id)
);

-- -----------------------------------------------------------------------------
-- API keys (plan Excelencia). Se guarda solo HMAC-SHA-256 de la clave.
-- -----------------------------------------------------------------------------
create table public.api_keys (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  name             text not null check (char_length(btrim(name)) between 1 and 80),
  prefix           text not null unique check (prefix ~ '^ry_(test|live)_[a-z0-9]{8}$'),
  key_hash         bytea not null unique check (octet_length(key_hash) = 32),
  scopes           text[] not null check (
                     cardinality(scopes) >= 1 and scopes <@ array[
                       'customers:read', 'customers:write', 'vehicles:read', 'vehicles:write',
                       'maintenance:read', 'maintenance:write', 'appointments:read',
                       'appointments:write', 'reminders:read']::text[]),
  branch_ids       uuid[],  -- null = todas las sucursales
  created_by       uuid references public.profiles (id) on delete set null,
  last_used_at     timestamptz,
  expires_at       timestamptz,
  revoked_at       timestamptz,
  created_at       timestamptz not null default now()
);
create index api_keys_org_idx on public.api_keys (organization_id);
create trigger api_keys_tenant_immutable before update on public.api_keys
  for each row execute function app.forbid_tenant_change();

create table public.api_request_logs (
  id               bigint generated always as identity primary key,
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  api_key_id       uuid references public.api_keys (id) on delete set null,
  request_id       text not null,
  method           text not null check (method in ('GET', 'POST', 'PATCH', 'PUT', 'DELETE')),
  route            text not null check (char_length(route) <= 200),
  status           smallint not null check (status between 100 and 599),
  latency_ms       integer not null check (latency_ms >= 0),
  created_at       timestamptz not null default now()
);
create index api_request_logs_org_idx on public.api_request_logs (organization_id, created_at desc);

-- RLS
alter table public.usage_counters enable row level security;
alter table public.usage_counters force row level security;
alter table public.integrations enable row level security;
alter table public.integrations force row level security;
alter table public.calendar_event_links enable row level security;
alter table public.calendar_event_links force row level security;
alter table public.api_keys enable row level security;
alter table public.api_keys force row level security;
alter table public.api_request_logs enable row level security;
alter table public.api_request_logs force row level security;

create policy usage_counters_select on public.usage_counters for select to authenticated
  using (organization_id in (select app.member_orgs()));
create policy integrations_select on public.integrations for select to authenticated
  using (organization_id in (select app.admin_orgs()));
create policy calendar_event_links_select on public.calendar_event_links for select to authenticated
  using (organization_id in (select app.member_orgs()));
create policy api_keys_select on public.api_keys for select to authenticated
  using (organization_id in (select app.admin_orgs()));
create policy api_keys_insert on public.api_keys for insert to authenticated
  with check (organization_id in (select app.admin_orgs()) and app.has_feature(organization_id, 'api'));
create policy api_keys_update on public.api_keys for update to authenticated
  using (organization_id in (select app.admin_orgs()))
  with check (organization_id in (select app.admin_orgs()));
create policy api_request_logs_select on public.api_request_logs for select to authenticated
  using (organization_id in (select app.admin_orgs()));

revoke all on public.usage_counters, public.integrations, public.calendar_event_links,
  public.api_keys, public.api_request_logs from anon, authenticated;
grant select on public.usage_counters, public.integrations, public.calendar_event_links,
  public.api_request_logs to authenticated;
-- key_hash nunca es legible por usuarios.
grant select (id, organization_id, name, prefix, scopes, branch_ids, created_by, last_used_at,
              expires_at, revoked_at, created_at)
  on public.api_keys to authenticated;
grant insert (organization_id, name, prefix, key_hash, scopes, branch_ids, created_by, expires_at)
  on public.api_keys to authenticated;
grant update (name, revoked_at) on public.api_keys to authenticated;
