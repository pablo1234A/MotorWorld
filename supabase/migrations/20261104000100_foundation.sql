-- =============================================================================
-- RevisaYa · 0100 · Fundamentos
-- Extensiones, esquemas internos y funciones genéricas de triggers.
-- =============================================================================

create extension if not exists citext with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Esquema `app`: funciones auxiliares de seguridad usadas por las políticas RLS.
-- No se expone por la Data API.
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- Esquema `private`: secretos, colas internas. Solo service_role.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

-- Ninguna función nueva de `app`/`private` es ejecutable por PUBLIC por defecto.
alter default privileges in schema app revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from public;

-- Los roles anónimos no reciben privilegios automáticos sobre tablas nuevas de public.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon, public;

-- -----------------------------------------------------------------------------
-- updated_at automático
-- -----------------------------------------------------------------------------
create function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- La tenencia (organization_id / branch_id) es inmutable: un registro nunca
-- puede "moverse" a otra organización o sucursal.
-- -----------------------------------------------------------------------------
create function app.forbid_tenant_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := to_jsonb(old);
begin
  if (v_new ->> 'organization_id') is distinct from (v_old ->> 'organization_id')
     or (v_new ? 'branch_id' and (v_new ->> 'branch_id') is distinct from (v_old ->> 'branch_id')) then
    raise exception 'tenant_immutable'
      using errcode = '42501',
            detail = format('No se puede cambiar la organización o sucursal de %s', tg_table_name);
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Validación de zona horaria IANA (no se puede hacer en un CHECK).
-- -----------------------------------------------------------------------------
create function app.validate_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.timezone is not null
     and not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'invalid_timezone' using errcode = '22023', detail = new.timezone;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Normalización de matrícula (misma regla que src/lib/plate.ts).
-- -----------------------------------------------------------------------------
create function app.normalize_plate(p_plate text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(p_plate, ''), '[^A-Za-z0-9]', '', 'g'));
$$;
grant execute on function app.normalize_plate(text) to authenticated, service_role;
