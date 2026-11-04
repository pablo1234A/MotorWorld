-- =============================================================================
-- RevisaYa · 0400 · Facturación (Stripe), entitlements y límites de usuarios
-- y sucursales.
--
-- Códigos de error propios (SQLSTATE), mapeados en src/server/db/errors.ts:
--   RY001 plan_limit_reached     (detail = recurso)
--   RY002 subscription_inactive
--   RY003 feature_unavailable    (detail = funcionalidad)
-- =============================================================================

-- Precios de Stripe por plan e intervalo, separados TEST/LIVE.
create table public.billing_prices (
  plan_code        text not null references public.plans (code) on delete restrict,
  interval         text not null check (interval in ('month', 'year')),
  livemode         boolean not null default false,
  stripe_price_id  text not null unique check (stripe_price_id ~ '^price_[A-Za-z0-9]+$'),
  created_at       timestamptz not null default now(),
  primary key (plan_code, interval, livemode)
);

create table public.billing_customers (
  organization_id     uuid primary key references public.organizations (id) on delete restrict,
  stripe_customer_id  text not null unique check (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  livemode            boolean not null default false,
  created_at          timestamptz not null default now()
);

-- Una suscripción vigente por organización. Solo la escribe el procesador de
-- webhooks de Stripe (service_role).
create table public.subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null unique references public.organizations (id) on delete restrict,
  plan_code               text not null references public.plans (code) on delete restrict,
  status                  text not null check (status in (
                            'trialing', 'active', 'past_due', 'unpaid', 'canceled',
                            'incomplete', 'incomplete_expired', 'paused')),
  billing_interval        text not null check (billing_interval in ('month', 'year')),
  stripe_subscription_id  text unique check (stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  stripe_price_id         text,
  trial_start             timestamptz,
  trial_end               timestamptz,
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  cancel_at_period_end    boolean not null default false,
  canceled_at             timestamptz,
  ended_at                timestamptz,
  past_due_since          timestamptz,
  livemode                boolean not null default false,
  last_stripe_event_at    timestamptz,  -- descarta eventos de webhook más antiguos que el último aplicado
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint subscriptions_trial_range check (trial_end is null or trial_start is null or trial_end > trial_start),
  constraint subscriptions_period_range check (
    current_period_end is null or current_period_start is null or current_period_end > current_period_start)
);
create index subscriptions_status_idx on public.subscriptions (status);
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function app.set_updated_at();
create trigger subscriptions_tenant_immutable before update on public.subscriptions
  for each row execute function app.forbid_tenant_change();

-- Historial de pagos (facturas de Stripe).
create table public.billing_invoices (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete restrict,
  stripe_invoice_id   text not null unique check (stripe_invoice_id ~ '^in_[A-Za-z0-9]+$'),
  status              text not null check (status in ('draft', 'open', 'paid', 'uncollectible', 'void')),
  amount_due_cents    integer not null check (amount_due_cents >= 0),
  amount_paid_cents   integer not null default 0 check (amount_paid_cents >= 0),
  currency            text not null default 'eur',
  period_start        timestamptz,
  period_end          timestamptz,
  hosted_invoice_url  text,
  invoice_pdf_url     text,
  livemode            boolean not null default false,
  created_at          timestamptz not null default now()
);
create index billing_invoices_org_idx on public.billing_invoices (organization_id, created_at desc);

-- Idempotencia de webhooks de Stripe.
create table public.stripe_events (
  id            text primary key check (id ~ '^evt_[A-Za-z0-9]+$'),
  type          text not null,
  livemode      boolean not null,
  status        text not null default 'received' check (status in ('received', 'processed', 'failed', 'ignored')),
  error         text,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz
);

-- =============================================================================
-- Entitlements
-- =============================================================================

-- ¿Da acceso completo este estado de suscripción? (past_due: 7 días de gracia, P7)
create function app.subscription_is_active(p_status text, p_past_due_since timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_status in ('trialing', 'active')
      or (p_status = 'past_due'
          and p_past_due_since is not null
          and p_past_due_since > now() - interval '7 days');
$$;

-- Plan efectivo de la organización (sin filas si la suscripción no está activa).
create function app.active_plan(p_org uuid)
returns setof public.plans
language sql
stable
security definer
set search_path = ''
as $$
  select p.*
  from public.subscriptions s
  join public.organizations o on o.id = s.organization_id
  join public.plans p on p.code = s.plan_code
  where s.organization_id = p_org
    and o.status = 'active'
    and app.subscription_is_active(s.status, s.past_due_since);
$$;

create function app.has_feature(p_org uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p_feature = any(p.features) from app.active_plan(p_org) p), false);
$$;

create function app.assert_feature(p_org uuid, p_feature text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from app.active_plan(p_org)) then
    raise exception 'subscription_inactive' using errcode = 'RY002';
  end if;
  if not app.has_feature(p_org, p_feature) then
    raise exception 'feature_unavailable' using errcode = 'RY003', detail = p_feature;
  end if;
end;
$$;

-- Límite aplicable (null = ilimitado). Lanza RY002 si no hay plan activo.
create function app.org_limit(p_org uuid, p_resource text)
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
    when 'users'           then v_plan.max_users
    when 'branches'        then v_plan.max_branches
    when 'emails'          then v_plan.monthly_emails
    else null
  end;
end;
$$;

-- Comprueba, bajo bloqueo por organización y recurso, que el recuento actual
-- (que ya incluye las filas recién escritas por la transacción) no supera el
-- límite. Usada por triggers AFTER de sentencia: dos transacciones simultáneas
-- se serializan en el bloqueo y la segunda ve la fila confirmada de la primera.
create function app.assert_within_limit(p_org uuid, p_resource text)
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

grant execute on function app.subscription_is_active(text, timestamptz), app.active_plan(uuid),
  app.has_feature(uuid, text), app.assert_feature(uuid, text) to authenticated, service_role;
grant execute on function app.org_limit(uuid, text), app.assert_within_limit(uuid, text) to service_role;

-- Sucursales en las que el usuario tiene un permiso. Con p_require_active =
-- true (escrituras), exige además suscripción activa, organización activa y
-- sucursal no archivada: con la cuenta cancelada o impagada los datos quedan
-- en solo lectura.
create function app.branches_with_permission(p_perm text, p_require_active boolean)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.id
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  join public.branches b on b.organization_id = m.organization_id
  where m.user_id = (select auth.uid())
    and m.status = 'active'
    and o.status in ('active', 'pending_deletion')
    and (m.role = 'admin' or p_perm = any (m.permissions))
    and (
      m.branch_scope = 'all'
      or exists (select 1 from public.member_branches mb
                 where mb.member_id = m.id and mb.branch_id = b.id)
    )
    and (
      not p_require_active
      or (
        o.status = 'active'
        and b.status = 'active'
        and exists (select 1 from public.subscriptions s
                    where s.organization_id = m.organization_id
                      and app.subscription_is_active(s.status, s.past_due_since))
      )
    );
$$;
grant execute on function app.branches_with_permission(text, boolean) to authenticated, service_role;

-- =============================================================================
-- Límites de usuarios y sucursales (triggers de sentencia)
-- =============================================================================
create function app.enforce_user_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if tg_table_name = 'organization_members' then
    if tg_op = 'INSERT' then
      -- El propietario se crea con la organización, antes de existir suscripción.
      for r in select distinct organization_id from new_rows
               where status = 'active' and not is_owner order by 1 loop
        perform app.assert_within_limit(r.organization_id, 'users');
      end loop;
    else
      for r in select distinct n.organization_id from new_rows n join old_rows o on o.id = n.id
               where n.status = 'active' and o.status <> 'active' order by 1 loop
        perform app.assert_within_limit(r.organization_id, 'users');
      end loop;
    end if;
  else -- invitations
    for r in select distinct organization_id from new_rows
             where accepted_at is null and revoked_at is null order by 1 loop
      perform app.assert_within_limit(r.organization_id, 'users');
    end loop;
  end if;
  return null;
end;
$$;

create trigger organization_members_limit_insert
  after insert on public.organization_members
  referencing new table as new_rows
  for each statement execute function app.enforce_user_limit();
create trigger organization_members_limit_update
  after update on public.organization_members
  referencing new table as new_rows old table as old_rows
  for each statement execute function app.enforce_user_limit();
create trigger invitations_limit_insert
  after insert on public.invitations
  referencing new table as new_rows
  for each statement execute function app.enforce_user_limit();

create function app.enforce_branch_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if tg_op = 'INSERT' then
    -- La sucursal principal se crea con la organización.
    for r in select distinct organization_id from new_rows
             where status = 'active' and not is_primary order by 1 loop
      perform app.assert_within_limit(r.organization_id, 'branches');
    end loop;
  else
    for r in select distinct n.organization_id from new_rows n join old_rows o on o.id = n.id
             where n.status = 'active' and o.status <> 'active' order by 1 loop
      perform app.assert_within_limit(r.organization_id, 'branches');
    end loop;
  end if;
  return null;
end;
$$;

create trigger branches_limit_insert
  after insert on public.branches
  referencing new table as new_rows
  for each statement execute function app.enforce_branch_limit();
create trigger branches_limit_update
  after update on public.branches
  referencing new table as new_rows old table as old_rows
  for each statement execute function app.enforce_branch_limit();

-- =============================================================================
-- RLS: lectura para administradores; escritura solo service_role.
-- =============================================================================
alter table public.billing_prices enable row level security;
alter table public.billing_prices force row level security;
alter table public.billing_customers enable row level security;
alter table public.billing_customers force row level security;
alter table public.subscriptions enable row level security;
alter table public.subscriptions force row level security;
alter table public.billing_invoices enable row level security;
alter table public.billing_invoices force row level security;
alter table public.stripe_events enable row level security;
alter table public.stripe_events force row level security;

create policy billing_prices_read on public.billing_prices for select to authenticated using (true);
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (organization_id in (select app.member_orgs()));
create policy billing_customers_select on public.billing_customers for select to authenticated
  using (organization_id in (select app.admin_orgs()));
create policy billing_invoices_select on public.billing_invoices for select to authenticated
  using (organization_id in (select app.admin_orgs()));

revoke all on public.billing_prices, public.billing_customers, public.subscriptions,
  public.billing_invoices, public.stripe_events from anon, authenticated;
grant select on public.billing_prices, public.billing_customers, public.subscriptions,
  public.billing_invoices to authenticated;
