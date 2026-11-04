-- =============================================================================
-- Helpers de test (solo base de datos LOCAL de pruebas).
-- Este archivo se ejecuta primero y CONFIRMA (commit) el esquema `tests`, para
-- que el resto de archivos —cada uno en su propia transacción revertida— lo
-- puedan usar. Nunca se aplica en staging/producción (no es una migración).
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

drop schema if exists tests cascade;
create schema tests;
grant usage on schema tests to authenticated, anon;

-- Crea un usuario en auth.users (el trigger crea su perfil).
create function tests.create_user(p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p_email, '',
          '{}'::jsonb, jsonb_build_object('first_name', split_part(p_email, '@', 1)), now(), now());
  return v_id;
end;
$$;

-- Crea una organización con sucursal principal, propietario y (opcionalmente)
-- suscripción con el estado indicado. Devuelve el id de la organización.
create function tests.create_org(p_owner uuid, p_slug text, p_plan text default 'pro',
                                 p_status text default 'active')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  insert into public.organizations (slug, trade_name, created_by)
  values (p_slug, initcap(replace(p_slug, '-', ' ')), p_owner)
  returning id into v_org;
  insert into public.branches (organization_id, name, slug, is_primary)
  values (v_org, 'Principal', 'principal', true);
  insert into public.organization_members (organization_id, user_id, role, is_owner)
  values (v_org, p_owner, 'admin', true);
  if p_plan is not null then
    insert into public.subscriptions (organization_id, plan_code, status, billing_interval,
                                      current_period_start, current_period_end)
    values (v_org, p_plan, p_status, 'month', now(), now() + interval '1 month');
  end if;
  return v_org;
end;
$$;

create function tests.primary_branch(p_org uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.branches where organization_id = p_org and is_primary;
$$;

create function tests.add_branch(p_org uuid, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.branches (organization_id, name, slug)
  values (p_org, initcap(p_slug), p_slug) returning id into v_id;
  return v_id;
end;
$$;

-- Añade un miembro (como hace la aceptación de invitación en servidor).
create function tests.add_member(p_org uuid, p_user uuid, p_role text,
                                 p_permissions text[] default '{}',
                                 p_branches uuid[] default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid;
  v_branch uuid;
begin
  insert into public.organization_members (organization_id, user_id, role, permissions, branch_scope)
  values (p_org, p_user, p_role, p_permissions, case when p_branches is null then 'all' else 'selected' end)
  returning id into v_member;
  if p_branches is not null then
    foreach v_branch in array p_branches loop
      insert into public.member_branches (member_id, organization_id, branch_id)
      values (v_member, p_org, v_branch);
    end loop;
  end if;
  return v_member;
end;
$$;

create function tests.add_customer(p_org uuid, p_branch uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.customers (organization_id, branch_id, first_name, email)
  values (p_org, p_branch, p_name, lower(p_name) || '@cliente.test')
  returning id into v_id;
  return v_id;
end;
$$;

create function tests.add_vehicle(p_org uuid, p_branch uuid, p_customer uuid, p_plate text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.vehicles (organization_id, branch_id, customer_id, plate, make, model)
  values (p_org, p_branch, p_customer, p_plate, 'Seat', 'Ibiza')
  returning id into v_id;
  return v_id;
end;
$$;

-- Simula una petición autenticada exactamente como la hará el servidor:
-- rol `authenticated` + claims del JWT verificado, locales a la transacción.
create function tests.authenticate_as(p_user uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create function tests.authenticate_anon()
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end;
$$;

create function tests.clear_authentication()
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end;
$$;

-- Registro de IDs entre sentencias (GUC local a la transacción), legible con
-- cualquier rol.
create function tests.set_id(p_name text, p_id uuid)
returns uuid
language sql
set search_path = ''
as $$
  select set_config('tests.' || p_name, p_id::text, true)::uuid;
$$;

create function tests.id(p_name text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('tests.' || p_name, true), '')::uuid;
$$;

grant execute on function tests.authenticate_as(uuid), tests.authenticate_anon(),
  tests.clear_authentication(), tests.set_id(text, uuid), tests.id(text) to authenticated, anon;

select extensions.plan(1);
select extensions.pass('Helpers de test instalados');
select * from extensions.finish();
commit;
