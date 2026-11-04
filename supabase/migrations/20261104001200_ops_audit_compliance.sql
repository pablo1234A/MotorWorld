-- =============================================================================
-- RevisaYa · 1200 · Operación (cola de trabajos, ejecuciones, rate limiting),
-- auditoría y RGPD.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Cola genérica de trabajos (FOR UPDATE SKIP LOCKED + lease). Solo sistema.
-- -----------------------------------------------------------------------------
create table private.jobs (
  id               uuid primary key default gen_random_uuid(),
  type             text not null check (char_length(type) <= 60),
  organization_id  uuid references public.organizations (id) on delete cascade,
  payload          jsonb not null default '{}'::jsonb,
  idempotency_key  text unique check (char_length(idempotency_key) <= 200),
  run_at           timestamptz not null default now(),
  status           text not null default 'queued'
                   check (status in ('queued', 'running', 'retrying', 'succeeded', 'failed', 'canceled')),
  attempts         smallint not null default 0,
  max_attempts     smallint not null default 5 check (max_attempts between 1 and 20),
  locked_until     timestamptz,
  locked_by        text,
  last_error       text check (char_length(last_error) <= 2000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  finished_at      timestamptz
);
create index jobs_ready_idx on private.jobs (run_at) where status in ('queued', 'retrying');
create index jobs_lease_idx on private.jobs (locked_until) where status = 'running';
create trigger jobs_updated_at before update on private.jobs
  for each row execute function app.set_updated_at();

create table private.job_runs (
  id           bigint generated always as identity primary key,
  job_name     text not null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'partial')),
  stats        jsonb not null default '{}'::jsonb,
  error        text check (char_length(error) <= 2000)
);
create index job_runs_name_idx on private.job_runs (job_name, started_at desc);

create table private.rate_limit_buckets (
  key          text primary key check (char_length(key) <= 200),
  tokens       double precision not null,
  updated_at   timestamptz not null default now()
);

-- Token bucket atómico: consume `p_cost` si hay tokens. Devuelve true/false.
create function private.rate_limit_consume(p_key text, p_capacity integer, p_refill_per_sec double precision, p_cost integer default 1)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tokens double precision;
begin
  insert into private.rate_limit_buckets as b (key, tokens, updated_at)
  values (p_key, p_capacity - p_cost, now())
  on conflict (key) do update
    set tokens = least(p_capacity::double precision,
                       b.tokens + extract(epoch from (now() - b.updated_at)) * p_refill_per_sec) - p_cost,
        updated_at = now()
    where least(p_capacity::double precision,
                b.tokens + extract(epoch from (now() - b.updated_at)) * p_refill_per_sec) >= p_cost
  returning tokens into v_tokens;
  return v_tokens is not null;
end;
$$;

revoke all on all tables in schema private from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema private to service_role;
grant usage on all sequences in schema private to service_role;
grant execute on function private.rate_limit_consume(text, integer, double precision, integer) to service_role;

-- -----------------------------------------------------------------------------
-- audit_logs: solo inserción. Nunca contiene datos personales ni secretos:
-- en `metadata` solo se guardan nombres de columnas cambiadas e IDs.
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id               bigint generated always as identity primary key,
  organization_id  uuid references public.organizations (id) on delete cascade,
  actor_type       text not null check (actor_type in ('user', 'system', 'api_key', 'stripe')),
  actor_id         uuid,
  action           text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  resource_type    text not null check (char_length(resource_type) <= 60),
  resource_id      text check (char_length(resource_id) <= 100),
  metadata         jsonb not null default '{}'::jsonb,
  ip_truncated     inet,
  created_at       timestamptz not null default now()
);
create index audit_logs_org_idx on public.audit_logs (organization_id, created_at desc);
create index audit_logs_resource_idx on public.audit_logs (resource_type, resource_id);

-- Escritura de auditoría desde la aplicación: el actor SIEMPRE es el usuario
-- autenticado real; solo puede auditar en sus organizaciones.
create function app.write_audit(
  p_org uuid, p_action text, p_resource_type text, p_resource_id text, p_metadata jsonb default '{}'::jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is not null and p_org is not null and p_org not in (select app.member_orgs()) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  insert into public.audit_logs (organization_id, actor_type, actor_id, action, resource_type, resource_id, metadata)
  values (p_org, case when v_uid is null then 'system' else 'user' end, v_uid,
          p_action, p_resource_type, p_resource_id, coalesce(p_metadata, '{}'::jsonb));
end;
$$;
grant execute on function app.write_audit(uuid, text, text, text, jsonb) to authenticated, service_role;

-- Trigger genérico de auditoría para tablas críticas.
create function app.audit_trigger()
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
    where n.value is distinct from o.value and n.key not in ('updated_at', 'version');
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

-- Tablas auditadas automáticamente.
create trigger audit_organization_members after insert or update or delete on public.organization_members
  for each row execute function app.audit_trigger('member');
create trigger audit_invitations after insert or update on public.invitations
  for each row execute function app.audit_trigger('invitation');
create trigger audit_branches after insert or update on public.branches
  for each row execute function app.audit_trigger('branch');
create trigger audit_organizations after update on public.organizations
  for each row execute function app.audit_trigger('organization');
create trigger audit_subscriptions after insert or update on public.subscriptions
  for each row execute function app.audit_trigger('subscription');
create trigger audit_customers_delete after update of deleted_at on public.customers
  for each row execute function app.audit_trigger('customer');
create trigger audit_vehicles_delete after update of deleted_at, customer_id on public.vehicles
  for each row execute function app.audit_trigger('vehicle');
create trigger audit_maintenance_records after update or delete on public.maintenance_records
  for each row execute function app.audit_trigger('maintenance_record');
create trigger audit_email_templates after insert or update or delete on public.email_templates
  for each row execute function app.audit_trigger('email_template');
create trigger audit_sending_domains after insert or update or delete on public.sending_domains
  for each row execute function app.audit_trigger('sending_domain');
create trigger audit_integrations after insert or update or delete on public.integrations
  for each row execute function app.audit_trigger('integration');
create trigger audit_api_keys after insert or update on public.api_keys
  for each row execute function app.audit_trigger('api_key');
create trigger audit_import_batches after update of status on public.import_batches
  for each row execute function app.audit_trigger('import');

-- -----------------------------------------------------------------------------
-- RGPD
-- -----------------------------------------------------------------------------
create table public.data_subject_requests (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  customer_id      uuid references public.customers (id) on delete set null,
  type             text not null check (type in (
                     'access', 'rectification', 'erasure', 'restriction', 'portability', 'objection')),
  status           text not null default 'open' check (status in ('open', 'in_progress', 'completed', 'rejected')),
  requested_at     timestamptz not null default now(),
  due_at           timestamptz not null default now() + interval '1 month',
  completed_at     timestamptz,
  handled_by       uuid references public.profiles (id) on delete set null,
  notes            text check (char_length(notes) <= 5000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index data_subject_requests_org_idx on public.data_subject_requests (organization_id, status, due_at);
create trigger data_subject_requests_updated_at before update on public.data_subject_requests
  for each row execute function app.set_updated_at();
create trigger data_subject_requests_tenant_immutable before update on public.data_subject_requests
  for each row execute function app.forbid_tenant_change();

create table public.legal_acceptances (
  id               bigint generated always as identity primary key,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  organization_id  uuid references public.organizations (id) on delete cascade,
  document         text not null check (document in ('terms', 'privacy', 'dpa')),
  version          text not null check (char_length(version) <= 20),
  accepted_at      timestamptz not null default now(),
  ip_truncated     inet,
  constraint legal_acceptances_unique unique (user_id, organization_id, document, version)
);

alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;
alter table public.data_subject_requests enable row level security;
alter table public.data_subject_requests force row level security;
alter table public.legal_acceptances enable row level security;
alter table public.legal_acceptances force row level security;

create policy audit_logs_select on public.audit_logs for select to authenticated
  using (organization_id in (select app.admin_orgs()));
create policy data_subject_requests_admin on public.data_subject_requests for all to authenticated
  using (organization_id in (select app.admin_orgs()))
  with check (organization_id in (select app.admin_orgs()));
create policy legal_acceptances_select on public.legal_acceptances for select to authenticated
  using (user_id = (select auth.uid()) or organization_id in (select app.admin_orgs()));

revoke all on public.audit_logs, public.data_subject_requests, public.legal_acceptances from anon, authenticated;
grant select on public.audit_logs, public.legal_acceptances to authenticated;
grant select, insert, update on public.data_subject_requests to authenticated;
