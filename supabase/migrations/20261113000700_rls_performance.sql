-- =============================================================================
-- AnunciaPro · 0007 · Rendimiento de RLS y de las estadísticas
--
-- Antes, cada política llamaba a is_workspace_member(workspace_id) UNA VEZ POR FILA.
-- Ahora las políticas comparan contra el conjunto de espacios del usuario, que
-- PostgreSQL calcula una sola vez por consulta (InitPlan) y puede resolver con índices.
-- La semántica de seguridad es idéntica (misma pertenencia, mismos roles, mismas
-- cuentas desactivadas excluidas); las pruebas de aislamiento lo verifican.
-- =============================================================================

create or replace function public.user_workspace_ids(p_min_role text default 'viewer')
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.workspace_id
  from public.workspace_members m
  join public.profiles p on p.id = m.user_id
  where m.user_id = (select auth.uid())
    and p.disabled_at is null
    and case p_min_role
          when 'manager' then m.role in ('owner', 'admin')
          when 'editor' then m.role in ('owner', 'admin', 'editor')
          else true
        end;
$$;
revoke all on function public.user_workspace_ids(text) from public, anon;
grant execute on function public.user_workspace_ids(text) to authenticated, service_role;

-- Recrea una política con la nueva condición.
create function pg_temp.repolicy(p_table text, p_name text, p_command text, p_using text, p_check text default null)
returns void language plpgsql as $$
begin
  execute format('drop policy if exists %I on public.%I', p_name, p_table);
  execute format('create policy %I on public.%I for %s to authenticated %s %s', p_name, p_table, p_command,
    case when p_using is not null then 'using (' || p_using || ')' else '' end,
    case when p_check is not null then 'with check (' || p_check || ')' else '' end);
end $$;

do $$
declare
  member constant text := 'workspace_id in (select public.user_workspace_ids())';
  editor constant text := 'workspace_id in (select public.user_workspace_ids(''editor''))';
  manager constant text := 'workspace_id in (select public.user_workspace_ids(''manager''))';
  t text;
begin
  perform pg_temp.repolicy('workspaces', 'workspaces_select', 'select', 'id in (select public.user_workspace_ids())');
  perform pg_temp.repolicy('workspaces', 'workspaces_update', 'update', 'id in (select public.user_workspace_ids(''manager''))', 'id in (select public.user_workspace_ids(''manager''))');
  perform pg_temp.repolicy('workspace_members', 'workspace_members_select', 'select', member);
  perform pg_temp.repolicy('subscriptions', 'subscriptions_select', 'select', member);
  perform pg_temp.repolicy('listing_versions', 'listing_versions_select', 'select', member);
  perform pg_temp.repolicy('generation_jobs', 'generation_jobs_select', 'select', member);
  perform pg_temp.repolicy('generation_job_items', 'generation_job_items_select', 'select', member);
  perform pg_temp.repolicy('usage_records', 'usage_records_select', 'select', member);
  perform pg_temp.repolicy('audit_logs', 'audit_logs_select', 'select', manager);
  perform pg_temp.repolicy('workspace_invitations', 'workspace_invitations_select', 'select', manager);

  foreach t in array array['products', 'product_images', 'templates', 'listings'] loop
    perform pg_temp.repolicy(t, t || '_select', 'select', member);
    perform pg_temp.repolicy(t, t || '_insert', 'insert', null, editor);
    perform pg_temp.repolicy(t, t || '_update', 'update', editor, editor);
    perform pg_temp.repolicy(t, t || '_delete', 'delete', editor);
  end loop;

  perform pg_temp.repolicy('categories', 'categories_select', 'select', 'workspace_id is null or ' || member);
  perform pg_temp.repolicy('categories', 'categories_insert', 'insert', null, editor);
  perform pg_temp.repolicy('categories', 'categories_update', 'update', editor, editor);
  perform pg_temp.repolicy('categories', 'categories_delete', 'delete', editor);

  perform pg_temp.repolicy('category_attributes', 'category_attributes_select', 'select',
    'category_id in (select c.id from public.categories c where c.workspace_id is null or c.workspace_id in (select public.user_workspace_ids()))');
  foreach t in array array['insert', 'update', 'delete'] loop
    perform pg_temp.repolicy('category_attributes', 'category_attributes_' || t, t,
      case when t = 'insert' then null else 'category_id in (select c.id from public.categories c where c.workspace_id in (select public.user_workspace_ids(''editor'')))' end,
      case when t = 'delete' then null else 'category_id in (select c.id from public.categories c where c.workspace_id in (select public.user_workspace_ids(''editor'')))' end);
  end loop;

  perform pg_temp.repolicy('favorites', 'favorites_insert', 'insert', null,
    'user_id = (select auth.uid()) and listing_id in (select l.id from public.listings l where l.workspace_id in (select public.user_workspace_ids()))');
end $$;

-- Índices que faltaban para las consultas más frecuentes del panel.
create index if not exists listings_workspace_updated_idx on public.listings (workspace_id, updated_at desc);
create index if not exists products_workspace_name_idx on public.products (workspace_id, name);
create index if not exists products_workspace_price_idx on public.products (workspace_id, price);
create index if not exists products_brand_trgm_idx on public.products using gin (brand extensions.gin_trgm_ops);
create index if not exists products_sku_trgm_idx on public.products using gin (sku extensions.gin_trgm_ops);

-- Estadísticas del panel: la actividad diaria se calcula con dos agregaciones por rango
-- (aprovechan los índices por fecha) en lugar de 60 subconsultas.
create or replace function public.get_dashboard_stats(p_workspace uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with bounds as (
    select ((now() at time zone 'utc')::date - 29) as first_day,
           (now() at time zone 'utc')::date as last_day,
           date_trunc('month', now() at time zone 'utc') at time zone 'utc' as month_start
  ),
  product_days as (
    select (p.created_at at time zone 'utc')::date as day, count(*) as total
    from public.products p, bounds b
    where p.workspace_id = p_workspace and p.created_at >= (b.first_day::timestamp at time zone 'utc')
    group by 1
  ),
  listing_days as (
    select (l.created_at at time zone 'utc')::date as day, count(*) as total
    from public.listings l, bounds b
    where l.workspace_id = p_workspace and l.created_at >= (b.first_day::timestamp at time zone 'utc')
    group by 1
  ),
  product_totals as (
    select count(*) filter (where archived_at is null) as active, count(*) filter (where archived_at is not null) as archived
    from public.products where workspace_id = p_workspace
  ),
  listing_rows as (
    select l.status, l.platform, l.created_at, l.product_id from public.listings l where l.workspace_id = p_workspace
  )
  select jsonb_build_object(
    'products_total', (select active from product_totals),
    'products_archived', (select archived from product_totals),
    'listings_total', (select count(*) from listing_rows),
    'listings_this_month', (select count(*) from listing_rows r, bounds b where r.created_at >= b.month_start),
    'listings_by_status', (
      select coalesce(jsonb_object_agg(status, total), '{}'::jsonb)
      from (select status, count(*) as total from listing_rows group by status) s
    ),
    'listings_by_platform', (
      select coalesce(jsonb_agg(jsonb_build_object('platform', platform, 'total', total) order by total desc), '[]'::jsonb)
      from (select platform, count(*) as total from listing_rows group by platform) s
    ),
    'listings_by_category', (
      select coalesce(jsonb_agg(jsonb_build_object('category', category, 'total', total) order by total desc), '[]'::jsonb)
      from (
        select coalesce(parent.name, c.name, 'Sin categoría') as category, count(*) as total
        from listing_rows r
        join public.products p on p.id = r.product_id
        left join public.categories c on c.id = p.category_id
        left join public.categories parent on parent.id = c.parent_id
        group by 1
        order by 2 desc
        limit 12
      ) s
    ),
    'activity_by_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'listings', coalesce(ld.total, 0), 'products', coalesce(pd.total, 0)) order by d), '[]'::jsonb)
      from bounds b
      cross join lateral generate_series(b.first_day::timestamp, b.last_day::timestamp, interval '1 day') as d
      left join listing_days ld on ld.day = d::date
      left join product_days pd on pd.day = d::date
    ),
    'jobs', (
      select jsonb_build_object(
        'completed', count(*) filter (where status = 'completed'),
        'partially_completed', count(*) filter (where status = 'partially_completed'),
        'failed', count(*) filter (where status = 'failed'),
        'active', count(*) filter (where status in ('pending', 'processing'))
      )
      from public.generation_jobs where workspace_id = p_workspace
    )
  );
$$;
