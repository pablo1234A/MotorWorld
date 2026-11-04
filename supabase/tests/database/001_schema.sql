-- Esquema: catálogo de planes exacto y RLS en todas las tablas.
begin;
set search_path = extensions, public;
select plan(12);

select results_eq(
  $$ select code, price_month_cents, price_year_cents from public.plans order by sort_order $$,
  $$ values ('pro', 3900, 39000), ('max', 7900, 79000), ('business', 14900, 149000), ('excelencia', 24900, 249000) $$,
  'Precios exactos del PDF (mensual y anual)');

select results_eq(
  $$ select code, max_customers, max_active_vehicles, monthly_emails, max_users, max_branches
       from public.plans order by sort_order $$,
  $$ values ('pro', 150, 300, 500, 1, 1),
            ('max', 800, 2000, 3000, 3, 1),
            ('business', null::int, null::int, 15000, null::int, 3),
            ('excelencia', null::int, null::int, 50000, null::int, null::int) $$,
  'Límites exactos del PDF');

select ok((select price_year_cents = price_month_cents * 10 from public.plans where code = 'pro')
          and (select bool_and(price_year_cents = price_month_cents * 10) from public.plans),
          'Anual = 10 mensualidades (dos meses gratis) en todos los planes');

select ok((select 'km_reminders' = any(features) and 'google_calendar' = any(features) and 'reports' = any(features)
             from public.plans where code = 'max')
          and not (select 'km_reminders' = any(features) from public.plans where code = 'pro'),
          'Kilometraje, Calendar e informes desde Max, no en Pro');

select ok((select 'api' = any(features) from public.plans where code = 'excelencia')
          and not (select bool_or('api' = any(features)) from public.plans where code <> 'excelencia'),
          'API solo en Excelencia');

select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not (c.relrowsecurity and c.relforcerowsecurity) $$,
  'Todas las tablas de public tienen RLS activada y forzada');

select is_empty(
  $$ select table_name from information_schema.role_table_grants
      where grantee = 'anon' and table_schema = 'public' and table_name <> 'plans' $$,
  'anon no tiene privilegios sobre ninguna tabla salvo plans');

select is_empty(
  $$ select table_name from information_schema.role_table_grants
      where grantee in ('anon', 'authenticated') and table_schema = 'private' $$,
  'El esquema private no es accesible para usuarios');

select ok(not has_column_privilege('authenticated', 'public.api_keys', 'key_hash', 'SELECT'),
          'El hash de las API keys no es legible por usuarios');

select ok(not has_table_privilege('authenticated', 'public.subscriptions', 'INSERT')
          and not has_table_privilege('authenticated', 'public.subscriptions', 'UPDATE'),
          'Las suscripciones solo las escribe el sistema (webhooks)');

select ok(not has_table_privilege('authenticated', 'public.audit_logs', 'INSERT')
          and not has_table_privilege('authenticated', 'public.audit_logs', 'UPDATE')
          and not has_table_privilege('authenticated', 'public.audit_logs', 'DELETE'),
          'audit_logs es de solo inserción por el sistema');

select is(app.normalize_plate(' 1234-abc '), '1234ABC', 'Normalización de matrícula');

select * from finish();
rollback;
