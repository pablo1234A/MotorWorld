-- =============================================================================
-- RevisaYa · 1400 · Endurecimiento y verificaciones de esquema.
-- Esta migración FALLA si alguna tabla de public/private queda sin RLS o si
-- el rol anónimo conserva privilegios sobre tablas distintas de `plans`.
-- =============================================================================

-- Ningún privilegio para anon salvo el catálogo de planes.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select on public.plans to anon;

-- Funciones de `app`: nunca ejecutables por PUBLIC/anon.
revoke execute on all functions in schema app from public, anon;

-- Secuencias de identidad usadas por inserciones de usuarios autenticados.
grant usage on all sequences in schema public to authenticated, service_role;

do $$
declare
  r record;
begin
  -- 1) Todas las tablas con RLS activada y forzada.
  for r in
    select n.nspname, c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p')
      and n.nspname in ('public', 'private')
      and (not c.relrowsecurity or not c.relforcerowsecurity)
      and not (n.nspname = 'private')  -- private: sin acceso para usuarios (se comprueba abajo)
  loop
    raise exception 'La tabla %.% no tiene RLS activada y forzada', r.nspname, r.relname;
  end loop;

  -- 2) anon solo puede leer plans.
  for r in
    select table_schema, table_name, privilege_type
    from information_schema.role_table_grants
    where grantee = 'anon' and table_schema in ('public', 'private')
      and not (table_name = 'plans' and privilege_type = 'SELECT')
  loop
    raise exception 'anon tiene % sobre %.%', r.privilege_type, r.table_schema, r.table_name;
  end loop;

  -- 3) authenticated no tiene ningún privilegio en private.
  for r in
    select table_name, privilege_type
    from information_schema.role_table_grants
    where grantee in ('authenticated', 'anon') and table_schema = 'private'
  loop
    raise exception 'authenticated tiene % sobre private.%', r.privilege_type, r.table_name;
  end loop;

  -- 4) Toda tabla de public con organization_id tiene al menos una política.
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'organization_id' and not a.attisdropped
    where n.nspname = 'public' and c.relkind = 'r'
      and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
      and c.relname not in ('document_sequences')  -- solo accesible vía trigger de numeración
  loop
    raise exception 'La tabla multi-tenant public.% no tiene políticas RLS', r.relname;
  end loop;

  -- 5) Todas las funciones SECURITY DEFINER de app/private fijan search_path.
  for r in
    select n.nspname, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('app', 'private') and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')
  loop
    raise exception 'La función SECURITY DEFINER %.% no fija search_path', r.nspname, r.proname;
  end loop;
end;
$$;
