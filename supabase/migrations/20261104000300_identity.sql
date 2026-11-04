-- =============================================================================
-- RevisaYa · 0300 · Identidad, organizaciones, sucursales y miembros
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles (entidad "users"). Las credenciales viven en auth.users; Supabase
-- guarda la contraseña con hash (bcrypt). Aquí nunca hay contraseñas.
-- -----------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  first_name    text not null default '' check (char_length(first_name) <= 80),
  last_name     text not null default '' check (char_length(last_name) <= 120),
  email         extensions.citext not null,
  status        text not null default 'active' check (status in ('active', 'disabled')),
  locale        text not null default 'es-ES' check (locale in ('es-ES')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  last_seen_at  timestamptz
);
create index profiles_email_idx on public.profiles (email);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function app.set_updated_at();

-- Sincroniza auth.users -> profiles (alta y cambio de email).
create function app.sync_profile_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, first_name, last_name)
  values (
    new.id,
    new.email,
    left(coalesce(new.raw_user_meta_data ->> 'first_name', ''), 80),
    left(coalesce(new.raw_user_meta_data ->> 'last_name', ''), 120)
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.sync_profile_from_auth();
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function app.sync_profile_from_auth();

-- -----------------------------------------------------------------------------
-- organizations (tenant = cuenta de facturación)
-- -----------------------------------------------------------------------------
create table public.organizations (
  id                    uuid primary key default gen_random_uuid(),
  slug                  extensions.citext not null unique
                        check (slug ~ '^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$'),
  trade_name            text not null check (char_length(trade_name) between 1 and 120),
  legal_name            text check (char_length(legal_name) <= 160),
  tax_id                text check (tax_id ~ '^[A-Z0-9]{8,12}$'),
  address_line1         text check (char_length(address_line1) <= 160),
  address_line2         text check (char_length(address_line2) <= 160),
  postal_code           text check (postal_code ~ '^[0-9A-Z -]{3,10}$'),
  city                  text check (char_length(city) <= 80),
  province              text check (char_length(province) <= 80),
  country               text not null default 'ES' check (country ~ '^[A-Z]{2}$'),
  phone                 text check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  email                 extensions.citext check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  logo_path             text check (char_length(logo_path) <= 300),
  brand_primary         text check (brand_primary ~ '^#[0-9a-fA-F]{6}$'),
  brand_secondary       text check (brand_secondary ~ '^#[0-9a-fA-F]{6}$'),
  timezone              text not null default 'Europe/Madrid',
  locale                text not null default 'es-ES' check (locale in ('es-ES')),
  status                text not null default 'active'
                        check (status in ('active', 'suspended', 'pending_deletion', 'deleted')),
  data_retention_until  date,
  created_by            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create trigger organizations_updated_at before update on public.organizations
  for each row execute function app.set_updated_at();
create trigger organizations_timezone before insert or update of timezone on public.organizations
  for each row execute function app.validate_timezone();

-- -----------------------------------------------------------------------------
-- branches (sucursales / talleres). Pro y Max tienen exactamente una.
-- -----------------------------------------------------------------------------
create table public.branches (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  name             text not null check (char_length(name) between 1 and 120),
  slug             extensions.citext not null check (slug ~ '^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$'),
  address_line1    text check (char_length(address_line1) <= 160),
  address_line2    text check (char_length(address_line2) <= 160),
  postal_code      text check (postal_code ~ '^[0-9A-Z -]{3,10}$'),
  city             text check (char_length(city) <= 80),
  province         text check (char_length(province) <= 80),
  phone            text check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  email            extensions.citext check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  timezone         text,  -- null = hereda de la organización
  is_primary       boolean not null default false,
  status           text not null default 'active' check (status in ('active', 'archived')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint branches_org_id_key unique (organization_id, id),
  constraint branches_slug_key unique (organization_id, slug),
  constraint branches_primary_not_archived check (not (is_primary and status = 'archived'))
);
create unique index branches_one_primary_idx on public.branches (organization_id) where is_primary;
create trigger branches_updated_at before update on public.branches
  for each row execute function app.set_updated_at();
create trigger branches_tenant_immutable before update on public.branches
  for each row execute function app.forbid_tenant_change();
create trigger branches_timezone before insert or update of timezone on public.branches
  for each row execute function app.validate_timezone();

-- -----------------------------------------------------------------------------
-- organization_members (usuario <-> organización, rol, permisos, alcance)
-- -----------------------------------------------------------------------------
create table public.organization_members (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  role             text not null check (role in ('admin', 'operator')),
  is_owner         boolean not null default false,
  permissions      text[] not null default '{}',
  branch_scope     text not null default 'all' check (branch_scope in ('all', 'selected')),
  status           text not null default 'active' check (status in ('active', 'suspended')),
  invited_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint organization_members_unique unique (organization_id, user_id),
  constraint organization_members_org_id_key unique (organization_id, id),
  constraint organization_members_owner_is_full_admin
    check (not is_owner or (role = 'admin' and branch_scope = 'all')),
  -- Los administradores tienen todos los permisos de forma implícita.
  constraint organization_members_admin_no_permissions
    check (role = 'operator' or permissions = '{}'),
  constraint organization_members_permissions_valid check (
    permissions <@ array[
      'customers.write', 'customers.delete',
      'vehicles.write', 'vehicles.delete',
      'maintenance.write', 'imports.run',
      'reminders.read', 'appointments.manage',
      'quotes.manage', 'reports.read'
    ]::text[]
  )
);
create unique index organization_members_one_owner_idx
  on public.organization_members (organization_id) where is_owner;
create index organization_members_user_idx on public.organization_members (user_id) where status = 'active';
create trigger organization_members_updated_at before update on public.organization_members
  for each row execute function app.set_updated_at();
create trigger organization_members_tenant_immutable before update on public.organization_members
  for each row execute function app.forbid_tenant_change();

-- Protección del propietario: un usuario (no el sistema) no puede degradarlo,
-- suspenderlo ni eliminarlo. La transferencia de propiedad se hace en servidor.
create function app.protect_owner_membership()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return coalesce(new, old);  -- proceso de sistema (service_role)
  end if;
  if tg_op = 'DELETE' then
    if old.is_owner then
      raise exception 'owner_protected' using errcode = '42501';
    end if;
    return old;
  end if;
  if old.is_owner and (new.is_owner is distinct from old.is_owner
                       or new.role <> 'admin'
                       or new.status <> 'active'
                       or new.branch_scope <> 'all') then
    raise exception 'owner_protected' using errcode = '42501';
  end if;
  if new.is_owner and not old.is_owner then
    raise exception 'owner_protected' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger organization_members_protect_owner
  before update or delete on public.organization_members
  for each row execute function app.protect_owner_membership();

-- Sucursales asignadas a un miembro con branch_scope = 'selected'.
create table public.member_branches (
  member_id        uuid not null,
  organization_id  uuid not null,
  branch_id        uuid not null,
  created_at       timestamptz not null default now(),
  primary key (member_id, branch_id),
  foreign key (organization_id, member_id)
    references public.organization_members (organization_id, id) on delete cascade,
  foreign key (organization_id, branch_id)
    references public.branches (organization_id, id) on delete cascade
);
create index member_branches_branch_idx on public.member_branches (branch_id);

-- -----------------------------------------------------------------------------
-- invitations
-- -----------------------------------------------------------------------------
create table public.invitations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  email            extensions.citext not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role             text not null check (role in ('admin', 'operator')),
  permissions      text[] not null default '{}',
  branch_scope     text not null default 'all' check (branch_scope in ('all', 'selected')),
  branch_ids       uuid[] not null default '{}',
  token_hash       bytea not null unique check (octet_length(token_hash) = 32),
  invited_by       uuid references public.profiles (id) on delete set null,
  expires_at       timestamptz not null default now() + interval '7 days',
  accepted_at      timestamptz,
  revoked_at       timestamptz,
  created_at       timestamptz not null default now(),
  constraint invitations_admin_no_permissions check (role = 'operator' or permissions = '{}'),
  constraint invitations_permissions_valid check (
    permissions <@ array[
      'customers.write', 'customers.delete',
      'vehicles.write', 'vehicles.delete',
      'maintenance.write', 'imports.run',
      'reminders.read', 'appointments.manage',
      'quotes.manage', 'reports.read'
    ]::text[]
  )
);
create unique index invitations_pending_unique
  on public.invitations (organization_id, email)
  where accepted_at is null and revoked_at is null;
create trigger invitations_tenant_immutable before update on public.invitations
  for each row execute function app.forbid_tenant_change();

-- =============================================================================
-- Funciones de acceso (usadas por las políticas RLS)
-- SECURITY DEFINER: leen las membresías reales del usuario autenticado sin
-- depender de lo que envíe el cliente. Se usan como `(select app.fn())` para
-- que PostgreSQL las evalúe una sola vez por consulta.
-- =============================================================================

-- Organizaciones de las que el usuario es miembro activo (y la organización
-- no está suspendida ni borrada).
create function app.member_orgs()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = (select auth.uid())
    and m.status = 'active'
    and o.status in ('active', 'pending_deletion');
$$;

-- Organizaciones en las que el usuario es administrador activo.
create function app.admin_orgs()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = (select auth.uid())
    and m.status = 'active'
    and m.role = 'admin'
    and o.status in ('active', 'pending_deletion');
$$;

-- Sucursales a las que el usuario tiene acceso (alcance 'all' o asignadas).
create function app.accessible_branches()
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
    and (
      m.branch_scope = 'all'
      or exists (
        select 1 from public.member_branches mb
        where mb.member_id = m.id and mb.branch_id = b.id
      )
    );
$$;

-- Usuarios que comparten alguna organización con el usuario actual.
create function app.co_member_user_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct m2.user_id
  from public.organization_members m1
  join public.organization_members m2 on m2.organization_id = m1.organization_id
  where m1.user_id = (select auth.uid()) and m1.status = 'active';
$$;

grant execute on function app.member_orgs(), app.admin_orgs(), app.accessible_branches(),
  app.co_member_user_ids() to authenticated, service_role;

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.organizations enable row level security;
alter table public.organizations force row level security;
alter table public.branches enable row level security;
alter table public.branches force row level security;
alter table public.organization_members enable row level security;
alter table public.organization_members force row level security;
alter table public.member_branches enable row level security;
alter table public.member_branches force row level security;
alter table public.invitations enable row level security;
alter table public.invitations force row level security;

-- profiles: el propio perfil y los de compañeros de organización.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or id in (select app.co_member_user_ids()));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (first_name, last_name, locale, last_seen_at) on public.profiles to authenticated;

-- organizations: lectura para miembros; edición de datos de empresa para admins.
-- La creación se hace mediante función de servidor (Fase 2).
create policy organizations_select on public.organizations for select to authenticated
  using (id in (select app.member_orgs()));
create policy organizations_update on public.organizations for update to authenticated
  using (id in (select app.admin_orgs())) with check (id in (select app.admin_orgs()));
revoke all on public.organizations from anon, authenticated;
grant select on public.organizations to authenticated;
grant update (slug, trade_name, legal_name, tax_id, address_line1, address_line2, postal_code,
              city, province, country, phone, email, logo_path, brand_primary, brand_secondary,
              timezone, locale)
  on public.organizations to authenticated;

-- branches
create policy branches_select on public.branches for select to authenticated
  using (id in (select app.accessible_branches()));
create policy branches_insert on public.branches for insert to authenticated
  with check (organization_id in (select app.admin_orgs()) and not is_primary);
create policy branches_update on public.branches for update to authenticated
  using (organization_id in (select app.admin_orgs()))
  with check (organization_id in (select app.admin_orgs()));
revoke all on public.branches from anon, authenticated;
grant select, insert on public.branches to authenticated;
grant update (name, slug, address_line1, address_line2, postal_code, city, province, phone,
              email, timezone, status)
  on public.branches to authenticated;

-- organization_members: el admin ve y gestiona; cada usuario ve su fila.
-- Las altas llegan por invitación aceptada (función de servidor).
create policy organization_members_select on public.organization_members for select to authenticated
  using (user_id = (select auth.uid()) or organization_id in (select app.admin_orgs()));
create policy organization_members_update on public.organization_members for update to authenticated
  using (organization_id in (select app.admin_orgs()))
  with check (organization_id in (select app.admin_orgs()));
create policy organization_members_delete on public.organization_members for delete to authenticated
  using (organization_id in (select app.admin_orgs()));
revoke all on public.organization_members from anon, authenticated;
grant select, delete on public.organization_members to authenticated;
grant update (role, permissions, branch_scope, status) on public.organization_members to authenticated;

-- member_branches
create policy member_branches_select on public.member_branches for select to authenticated
  using (
    organization_id in (select app.admin_orgs())
    or member_id in (select m.id from public.organization_members m where m.user_id = (select auth.uid()))
  );
create policy member_branches_write on public.member_branches for all to authenticated
  using (organization_id in (select app.admin_orgs()))
  with check (organization_id in (select app.admin_orgs()));
revoke all on public.member_branches from anon, authenticated;
grant select, insert, delete on public.member_branches to authenticated;

-- invitations: solo administradores. La aceptación la hace el servidor.
create policy invitations_admin on public.invitations for all to authenticated
  using (organization_id in (select app.admin_orgs()))
  with check (organization_id in (select app.admin_orgs()));
revoke all on public.invitations from anon, authenticated;
grant select, insert on public.invitations to authenticated;
grant update (revoked_at) on public.invitations to authenticated;
