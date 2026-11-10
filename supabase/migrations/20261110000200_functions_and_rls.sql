-- =============================================================================
-- AnunciaPro · 0002 · Funciones de negocio, triggers de integridad y RLS
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers de autorización (SECURITY DEFINER para evitar recursión de RLS)
-- ---------------------------------------------------------------------------
create or replace function public.is_service_role()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.role()) = 'service_role', false);
$$;

create or replace function public.is_workspace_member(p_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members m
    join public.profiles p on p.id = m.user_id
    where m.workspace_id = p_workspace
      and m.user_id = (select auth.uid())
      and p.disabled_at is null
  );
$$;

create or replace function public.can_edit_workspace(p_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members m
    join public.profiles p on p.id = m.user_id
    where m.workspace_id = p_workspace
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'editor')
      and p.disabled_at is null
  );
$$;

create or replace function public.can_manage_workspace(p_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members m
    join public.profiles p on p.id = m.user_id
    where m.workspace_id = p_workspace
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
      and p.disabled_at is null
  );
$$;

create or replace function public.shares_workspace_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members mine
    join public.workspace_members theirs on theirs.workspace_id = mine.workspace_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = p_user
  );
$$;

create or replace function public.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_value::uuid;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Alta automática: perfil + workspace + membresía + suscripción gratuita
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 120);
  v_workspace uuid;
  v_plan uuid;
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, v_name, coalesce(new.email, ''));

  insert into public.workspaces (name, owner_id)
  values (case when v_name = '' then 'Mi espacio de trabajo' else left('Espacio de ' || v_name, 120) end, new.id)
  returning id into v_workspace;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace, new.id, 'owner');

  select id into v_plan from public.plans where code = 'free';
  if v_plan is null then
    raise exception 'El plan gratuito no existe: aplica las migraciones de datos de referencia';
  end if;

  insert into public.subscriptions (workspace_id, plan_id, status, provider)
  values (v_workspace, v_plan, 'active', 'none');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = coalesce(new.email, '') where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- Un único propietario por workspace.
create unique index workspace_members_single_owner_key
  on public.workspace_members (workspace_id) where role = 'owner';

-- ---------------------------------------------------------------------------
-- Planes, periodo de consumo y estado de uso
-- ---------------------------------------------------------------------------
create or replace function public.workspace_plan(p_workspace uuid)
returns public.plans
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select p
      from public.subscriptions s
      join public.plans p on p.id = s.plan_id
      where s.workspace_id = p_workspace
        and s.status in ('active', 'trialing', 'past_due')
        and (s.provider <> 'stripe' or s.current_period_end is null or s.current_period_end > now() - interval '3 days')
    ),
    (select p from public.plans p where p.code = 'free')
  );
$$;

-- Periodo vigente: el de la suscripción de pago si existe; si no, mes natural (UTC).
create or replace function public.workspace_usage_period(p_workspace uuid)
returns table (period_start timestamptz, period_end timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
begin
  select * into v_sub from public.subscriptions where workspace_id = p_workspace;
  if found
     and v_sub.provider = 'stripe'
     and v_sub.status in ('active', 'trialing', 'past_due')
     and v_sub.current_period_start is not null
     and v_sub.current_period_end is not null
     and now() >= v_sub.current_period_start
     and now() < v_sub.current_period_end then
    return query select v_sub.current_period_start, v_sub.current_period_end;
  else
    return query
      select date_trunc('month', now() at time zone 'utc') at time zone 'utc',
             (date_trunc('month', now() at time zone 'utc') + interval '1 month') at time zone 'utc';
  end if;
end;
$$;

create or replace function public.workspace_usage_state(p_workspace uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan public.plans;
  v_start timestamptz;
  v_end timestamptz;
  v_used integer;
  v_bulk_used integer;
begin
  v_plan := public.workspace_plan(p_workspace);
  select period_start, period_end into v_start, v_end from public.workspace_usage_period(p_workspace);

  select
    coalesce(sum(quantity), 0),
    coalesce(sum(quantity) filter (where operation_type = 'bulk_generation' or refund_of = 'bulk_generation'), 0)
  into v_used, v_bulk_used
  from public.usage_records
  where workspace_id = p_workspace and created_at >= v_start and created_at < v_end;

  return jsonb_build_object(
    'plan_code', v_plan.code,
    'plan_name', v_plan.name,
    'features', v_plan.features,
    'monthly_listing_limit', v_plan.monthly_listing_limit,
    'monthly_bulk_limit', v_plan.monthly_bulk_limit,
    'used', greatest(v_used, 0),
    'bulk_used', greatest(v_bulk_used, 0),
    'remaining', greatest(v_plan.monthly_listing_limit - greatest(v_used, 0), 0),
    'bulk_remaining', greatest(v_plan.monthly_bulk_limit - greatest(v_bulk_used, 0), 0),
    'period_start', v_start,
    'period_end', v_end
  );
end;
$$;

-- Resumen de consumo visible para los miembros del workspace.
create or replace function public.get_usage_summary(p_workspace uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_workspace_member(p_workspace) or public.is_service_role()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return public.workspace_usage_state(p_workspace);
end;
$$;

-- Consumo atómico de una generación individual.
-- El bloqueo de la fila de suscripción serializa las peticiones simultáneas
-- del mismo workspace, por lo que nunca se supera el límite.
create or replace function public.consume_usage(
  p_workspace uuid,
  p_operation text,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state jsonb;
  v_used integer;
  v_limit integer;
begin
  if p_operation not in ('generation', 'refinement') then
    raise exception 'INVALID_OPERATION' using errcode = '22023';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 200 then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;
  if not public.can_edit_workspace(p_workspace) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  perform 1 from public.subscriptions where workspace_id = p_workspace for update;

  v_state := public.workspace_usage_state(p_workspace);
  v_used := (v_state ->> 'used')::integer;
  v_limit := (v_state ->> 'monthly_listing_limit')::integer;

  if exists (
    select 1 from public.usage_records
    where workspace_id = p_workspace and idempotency_key = p_idempotency_key
  ) then
    return v_state || jsonb_build_object('allowed', true, 'duplicate', true);
  end if;

  if v_used + 1 > v_limit then
    return v_state || jsonb_build_object('allowed', false, 'duplicate', false, 'reason', 'monthly_limit');
  end if;

  insert into public.usage_records (workspace_id, user_id, operation_type, quantity, idempotency_key, metadata)
  values (p_workspace, (select auth.uid()), p_operation, 1, p_idempotency_key, coalesce(p_metadata, '{}'::jsonb));

  return public.workspace_usage_state(p_workspace) || jsonb_build_object('allowed', true, 'duplicate', false);
end;
$$;

-- Devolución por error interno del sistema. Solo service_role.
create or replace function public.refund_usage(p_workspace uuid, p_idempotency_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record public.usage_records;
begin
  if not public.is_service_role() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_record
  from public.usage_records
  where workspace_id = p_workspace and idempotency_key = p_idempotency_key and status = 'counted'
    and operation_type <> 'refund'
  for update;
  if not found then
    return false;
  end if;

  update public.usage_records set status = 'refunded' where id = v_record.id;
  insert into public.usage_records (workspace_id, user_id, operation_type, quantity, idempotency_key, refund_of, metadata)
  values (p_workspace, v_record.user_id, 'refund', -v_record.quantity, 'refund:' || p_idempotency_key,
          v_record.operation_type, jsonb_build_object('reason', 'system_error'))
  on conflict (workspace_id, idempotency_key) do nothing;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Generación masiva: creación atómica del trabajo + reserva de consumo
-- ---------------------------------------------------------------------------
create or replace function public.create_generation_job(
  p_workspace uuid,
  p_filename text,
  p_source_path text,
  p_options jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state jsonb;
  v_count integer;
  v_max_rows integer;
  v_job uuid;
begin
  if not public.can_edit_workspace(p_workspace) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'INVALID_ITEMS' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_items);
  if v_count < 1 then
    raise exception 'INVALID_ITEMS' using errcode = '22023';
  end if;

  perform 1 from public.subscriptions where workspace_id = p_workspace for update;
  v_state := public.workspace_usage_state(p_workspace);
  v_max_rows := coalesce((v_state -> 'features' ->> 'max_bulk_rows')::integer, 0);

  if (v_state ->> 'monthly_bulk_limit')::integer <= 0 then
    return jsonb_build_object('allowed', false, 'reason', 'plan_required');
  end if;
  if v_count > v_max_rows then
    return jsonb_build_object('allowed', false, 'reason', 'too_many_rows', 'max_rows', v_max_rows);
  end if;
  if (v_state ->> 'bulk_used')::integer + v_count > (v_state ->> 'monthly_bulk_limit')::integer then
    return jsonb_build_object('allowed', false, 'reason', 'bulk_limit', 'remaining', v_state -> 'bulk_remaining');
  end if;
  if (v_state ->> 'used')::integer + v_count > (v_state ->> 'monthly_listing_limit')::integer then
    return jsonb_build_object('allowed', false, 'reason', 'monthly_limit', 'remaining', v_state -> 'remaining');
  end if;
  if (
    select count(*) from public.generation_jobs
    where workspace_id = p_workspace and status in ('pending', 'processing')
  ) >= 3 then
    return jsonb_build_object('allowed', false, 'reason', 'too_many_active_jobs');
  end if;

  insert into public.generation_jobs (workspace_id, created_by, status, source_filename, source_path, options, total_items)
  values (p_workspace, (select auth.uid()), 'pending', left(p_filename, 255), left(p_source_path, 400),
          coalesce(p_options, '{}'::jsonb), v_count)
  returning id into v_job;

  insert into public.generation_job_items (job_id, workspace_id, row_number, input)
  select v_job, p_workspace, (elem ->> 'row_number')::integer, elem -> 'input'
  from jsonb_array_elements(p_items) as elem;

  insert into public.usage_records (workspace_id, user_id, operation_type, quantity, idempotency_key, metadata)
  values (p_workspace, (select auth.uid()), 'bulk_generation', v_count, 'job:' || v_job,
          jsonb_build_object('job_id', v_job));

  return jsonb_build_object('allowed', true, 'job_id', v_job, 'total_items', v_count);
end;
$$;

create or replace function public.can_process_job(p_job uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_service_role() or exists (
    select 1 from public.generation_jobs j
    where j.id = p_job and public.can_edit_workspace(j.workspace_id)
  );
$$;

-- Recalcula contadores y estado. Al terminar, devuelve la cuota de los
-- elementos fallidos por errores del sistema (una sola vez por intento).
create or replace function public.refresh_generation_job(p_job uuid)
returns public.generation_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.generation_jobs;
  v_ok integer;
  v_failed integer;
  v_open integer;
  v_system_failed integer;
  v_status text;
begin
  select * into v_job from public.generation_jobs where id = p_job for update;
  if not found then
    raise exception 'JOB_NOT_FOUND' using errcode = 'P0002';
  end if;

  select
    count(*) filter (where status = 'completed'),
    count(*) filter (where status = 'failed'),
    count(*) filter (where status in ('pending', 'processing')),
    count(*) filter (where status = 'failed' and system_error)
  into v_ok, v_failed, v_open, v_system_failed
  from public.generation_job_items where job_id = p_job;

  if v_open > 0 then
    v_status := case when v_job.status = 'pending' and v_ok + v_failed = 0 then 'pending' else 'processing' end;
  elsif v_failed = 0 then
    v_status := 'completed';
  elsif v_ok = 0 then
    v_status := 'failed';
  else
    v_status := 'partially_completed';
  end if;

  update public.generation_jobs
  set successful_items = v_ok,
      failed_items = v_failed,
      processed_items = v_ok + v_failed,
      status = v_status,
      completed_at = case when v_open = 0 then coalesce(completed_at, now()) else null end
  where id = p_job
  returning * into v_job;

  if v_open = 0 and v_system_failed > 0 then
    insert into public.usage_records (workspace_id, user_id, operation_type, quantity, idempotency_key, refund_of, metadata)
    values (v_job.workspace_id, v_job.created_by, 'refund', -v_system_failed,
            'job-refund:' || p_job || ':' || v_job.retry_count, 'bulk_generation',
            jsonb_build_object('job_id', p_job, 'reason', 'system_error'))
    on conflict (workspace_id, idempotency_key) do nothing;
  end if;

  return v_job;
end;
$$;

-- Reserva atómica de elementos pendientes (FOR UPDATE SKIP LOCKED) para que
-- dos procesos concurrentes nunca procesen la misma fila.
create or replace function public.claim_job_items(p_job uuid, p_limit integer default 20)
returns setof public.generation_job_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max_attempts constant integer := 3;
begin
  if not public.can_process_job(p_job) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- Elementos bloqueados por un proceso que murió y ya agotaron sus intentos.
  update public.generation_job_items
  set status = 'failed', system_error = true, locked_at = null,
      error_message = 'Se agotaron los reintentos por un error interno.'
  where job_id = p_job and status = 'processing'
    and locked_at < now() - interval '5 minutes' and attempts >= v_max_attempts;

  update public.generation_jobs
  set status = 'processing', started_at = coalesce(started_at, now())
  where id = p_job and status = 'pending';

  return query
  with picked as (
    select id from public.generation_job_items
    where job_id = p_job
      and (status = 'pending' or (status = 'processing' and locked_at < now() - interval '5 minutes'))
    order by row_number
    limit greatest(1, least(coalesce(p_limit, 20), 50))
    for update skip locked
  )
  update public.generation_job_items i
  set status = 'processing', attempts = i.attempts + 1, locked_at = now()
  from picked
  where i.id = picked.id
  returning i.*;
end;
$$;

-- Registra el resultado de un elemento. Los resultados correctos se conservan
-- aunque otros elementos del lote fallen.
create or replace function public.report_job_item(
  p_item uuid,
  p_status text,
  p_product uuid default null,
  p_listing uuid default null,
  p_error text default null,
  p_system_error boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.generation_job_items;
  v_max_attempts constant integer := 3;
begin
  if p_status not in ('progress', 'completed', 'failed') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;

  select * into v_item from public.generation_job_items where id = p_item for update;
  if not found then
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not public.can_process_job(v_item.job_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_item.status <> 'processing' then
    return; -- Ya resuelto por otro proceso: operación idempotente.
  end if;

  if p_status = 'progress' then
    update public.generation_job_items
    set product_id = coalesce(p_product, product_id) where id = p_item;
    return;
  end if;

  if p_status = 'completed' then
    update public.generation_job_items
    set status = 'completed', product_id = coalesce(p_product, product_id), listing_id = p_listing,
        error_message = null, system_error = false, locked_at = null
    where id = p_item;
  elsif coalesce(p_system_error, false) and v_item.attempts < v_max_attempts then
    -- Error interno transitorio: vuelve a la cola para un reintento controlado.
    update public.generation_job_items
    set status = 'pending', product_id = coalesce(p_product, product_id),
        error_message = left(p_error, 1000), locked_at = null
    where id = p_item;
  else
    update public.generation_job_items
    set status = 'failed', product_id = coalesce(p_product, product_id),
        error_message = left(coalesce(p_error, 'Error desconocido'), 1000),
        system_error = coalesce(p_system_error, false), locked_at = null
    where id = p_item;
  end if;

  perform public.refresh_generation_job(v_item.job_id);
end;
$$;

-- Reintento manual de los elementos fallidos de un trabajo terminado.
create or replace function public.retry_failed_job_items(p_job uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.generation_jobs;
  v_state jsonb;
  v_count integer;
begin
  select * into v_job from public.generation_jobs where id = p_job for update;
  if not found or not public.can_edit_workspace(v_job.workspace_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_job.status not in ('failed', 'partially_completed') then
    return jsonb_build_object('allowed', false, 'reason', 'job_not_retryable');
  end if;

  select count(*) into v_count from public.generation_job_items where job_id = p_job and status = 'failed';
  if v_count = 0 then
    return jsonb_build_object('allowed', false, 'reason', 'nothing_to_retry');
  end if;

  perform 1 from public.subscriptions where workspace_id = v_job.workspace_id for update;
  v_state := public.workspace_usage_state(v_job.workspace_id);
  if (v_state ->> 'monthly_bulk_limit')::integer <= 0 then
    return jsonb_build_object('allowed', false, 'reason', 'plan_required');
  end if;
  if (v_state ->> 'bulk_used')::integer + v_count > (v_state ->> 'monthly_bulk_limit')::integer then
    return jsonb_build_object('allowed', false, 'reason', 'bulk_limit', 'remaining', v_state -> 'bulk_remaining');
  end if;
  if (v_state ->> 'used')::integer + v_count > (v_state ->> 'monthly_listing_limit')::integer then
    return jsonb_build_object('allowed', false, 'reason', 'monthly_limit', 'remaining', v_state -> 'remaining');
  end if;

  update public.generation_jobs set retry_count = retry_count + 1 where id = p_job returning * into v_job;

  insert into public.usage_records (workspace_id, user_id, operation_type, quantity, idempotency_key, metadata)
  values (v_job.workspace_id, (select auth.uid()), 'bulk_generation', v_count,
          'job-retry:' || p_job || ':' || v_job.retry_count, jsonb_build_object('job_id', p_job, 'retry', v_job.retry_count));

  update public.generation_job_items
  set status = 'pending', attempts = 0, error_message = null, system_error = false, locked_at = null
  where job_id = p_job and status = 'failed';

  perform public.refresh_generation_job(p_job);
  update public.generation_jobs set status = 'pending' where id = p_job;

  return jsonb_build_object('allowed', true, 'retried', v_count);
end;
$$;

-- ---------------------------------------------------------------------------
-- Limitación de peticiones y auditoría
-- ---------------------------------------------------------------------------
create or replace function public.check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  if not public.is_service_role() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limit_buckets as b (key, window_start, count)
  values (left(p_key, 200), v_window, 1)
  on conflict (key, window_start) do update set count = b.count + 1
  returning b.count into v_count;

  if random() < 0.02 then
    delete from public.rate_limit_buckets where window_start < now() - interval '1 day';
  end if;

  return v_count <= p_max;
end;
$$;

create or replace function public.log_audit_event(
  p_workspace uuid,
  p_action text,
  p_resource_type text,
  p_resource_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null and not public.is_service_role() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_uid is not null and p_workspace is not null and not public.is_workspace_member(p_workspace) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  insert into public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, metadata)
  values (p_workspace, v_uid, left(p_action, 80), left(p_resource_type, 60), left(p_resource_id, 120),
          coalesce(p_metadata, '{}'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers de integridad de catálogo
-- ---------------------------------------------------------------------------
create or replace function public.category_is_usable(p_category uuid, p_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.categories c
    where c.id = p_category and (c.workspace_id is null or c.workspace_id = p_workspace)
  );
$$;

create or replace function public.products_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_count integer;
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);

    -- Límite de catálogo del plan, serializado por workspace.
    perform pg_advisory_xact_lock(hashtextextended('products:' || new.workspace_id::text, 0));
    v_limit := ((public.workspace_plan(new.workspace_id)).features ->> 'max_products')::integer;
    if v_limit is not null then
      select count(*) into v_count from public.products where workspace_id = new.workspace_id;
      if v_count >= v_limit then
        raise exception 'PRODUCT_LIMIT_REACHED' using errcode = 'AP001',
          detail = format('El plan actual permite %s productos.', v_limit);
      end if;
    end if;
  else
    new.workspace_id := old.workspace_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;

  if new.category_id is not null
     and (tg_op = 'INSERT' or new.category_id is distinct from old.category_id)
     and not public.category_is_usable(new.category_id, new.workspace_id) then
    raise exception 'INVALID_CATEGORY' using errcode = 'AP002';
  end if;

  new.sku := nullif(btrim(new.sku), '');
  return new;
end;
$$;

create trigger products_before_write before insert or update on public.products
  for each row execute function public.products_before_write();

create or replace function public.templates_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_count integer;
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
    perform pg_advisory_xact_lock(hashtextextended('templates:' || new.workspace_id::text, 0));
    v_limit := ((public.workspace_plan(new.workspace_id)).features ->> 'max_templates')::integer;
    if v_limit is not null then
      select count(*) into v_count from public.templates where workspace_id = new.workspace_id;
      if v_count >= v_limit then
        raise exception 'TEMPLATE_LIMIT_REACHED' using errcode = 'AP003',
          detail = format('El plan actual permite %s plantillas personalizadas.', v_limit);
      end if;
    end if;
  else
    new.workspace_id := old.workspace_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;

  if new.category_id is not null and not public.category_is_usable(new.category_id, new.workspace_id) then
    raise exception 'INVALID_CATEGORY' using errcode = 'AP002';
  end if;
  return new;
end;
$$;

create trigger templates_before_write before insert or update on public.templates
  for each row execute function public.templates_before_write();

create or replace function public.listings_validate_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
  else
    new.created_by := old.created_by;
  end if;
  if new.template_id is not null and not exists (
    select 1 from public.templates t where t.id = new.template_id and t.workspace_id = new.workspace_id
  ) then
    raise exception 'INVALID_TEMPLATE' using errcode = 'AP004';
  end if;
  return new;
end;
$$;

create trigger listings_validate_refs before insert or update on public.listings
  for each row execute function public.listings_validate_refs();

-- Categorías personalizadas: máximo dos niveles y padre visible para el workspace.
create or replace function public.categories_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent public.categories;
begin
  if tg_op = 'UPDATE' then
    new.workspace_id := old.workspace_id;
  end if;
  if new.parent_id is not null then
    select * into v_parent from public.categories where id = new.parent_id;
    if not found or v_parent.parent_id is not null
       or (v_parent.workspace_id is not null and v_parent.workspace_id is distinct from new.workspace_id) then
      raise exception 'INVALID_PARENT_CATEGORY' using errcode = 'AP002';
    end if;
  end if;
  return new;
end;
$$;

create trigger categories_before_write before insert or update on public.categories
  for each row execute function public.categories_before_write();

-- ---------------------------------------------------------------------------
-- Estadísticas del panel (SECURITY INVOKER: se aplican las políticas RLS)
-- ---------------------------------------------------------------------------
create or replace function public.get_dashboard_stats(p_workspace uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'products_total', (select count(*) from public.products where workspace_id = p_workspace and archived_at is null),
    'products_archived', (select count(*) from public.products where workspace_id = p_workspace and archived_at is not null),
    'listings_total', (select count(*) from public.listings where workspace_id = p_workspace),
    'listings_this_month', (
      select count(*) from public.listings
      where workspace_id = p_workspace
        and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
    ),
    'listings_by_status', (
      select coalesce(jsonb_object_agg(status, total), '{}'::jsonb)
      from (select status, count(*) as total from public.listings where workspace_id = p_workspace group by status) s
    ),
    'listings_by_platform', (
      select coalesce(jsonb_agg(jsonb_build_object('platform', platform, 'total', total) order by total desc), '[]'::jsonb)
      from (select platform, count(*) as total from public.listings where workspace_id = p_workspace group by platform) s
    ),
    'listings_by_category', (
      select coalesce(jsonb_agg(jsonb_build_object('category', category, 'total', total) order by total desc), '[]'::jsonb)
      from (
        select coalesce(parent.name, c.name, 'Sin categoría') as category, count(*) as total
        from public.listings l
        join public.products p on p.id = l.product_id
        left join public.categories c on c.id = p.category_id
        left join public.categories parent on parent.id = c.parent_id
        where l.workspace_id = p_workspace
        group by 1
        order by 2 desc
        limit 12
      ) s
    ),
    'activity_by_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', day, 'listings', listings, 'products', products) order by day), '[]'::jsonb)
      from (
        select d::date as day,
          (select count(*) from public.listings l
            where l.workspace_id = p_workspace and (l.created_at at time zone 'utc')::date = d::date) as listings,
          (select count(*) from public.products p
            where p.workspace_id = p_workspace and (p.created_at at time zone 'utc')::date = d::date) as products
        from generate_series(
          (now() at time zone 'utc')::date - 29, (now() at time zone 'utc')::date, interval '1 day'
        ) as d
      ) s
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

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
alter table public.profiles enable row level security;
alter table public.platform_admins enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.categories enable row level security;
alter table public.category_attributes enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.stripe_events enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.templates enable row level security;
alter table public.listings enable row level security;
alter table public.listing_versions enable row level security;
alter table public.favorites enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.generation_job_items enable row level security;
alter table public.usage_records enable row level security;
alter table public.audit_logs enable row level security;
alter table public.rate_limit_buckets enable row level security;

-- platform_admins, stripe_events y rate_limit_buckets no tienen políticas:
-- solo son accesibles con service_role (que omite RLS).

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_workspace_with(id));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- workspaces
create policy workspaces_select on public.workspaces for select to authenticated
  using (public.is_workspace_member(id));
create policy workspaces_update on public.workspaces for update to authenticated
  using (public.can_manage_workspace(id)) with check (public.can_manage_workspace(id));

-- workspace_members
create policy workspace_members_select on public.workspace_members for select to authenticated
  using (public.is_workspace_member(workspace_id));

-- categories
create policy categories_select on public.categories for select to authenticated
  using (workspace_id is null or public.is_workspace_member(workspace_id));
create policy categories_insert on public.categories for insert to authenticated
  with check (workspace_id is not null and public.can_edit_workspace(workspace_id));
create policy categories_update on public.categories for update to authenticated
  using (workspace_id is not null and public.can_edit_workspace(workspace_id))
  with check (workspace_id is not null and public.can_edit_workspace(workspace_id));
create policy categories_delete on public.categories for delete to authenticated
  using (workspace_id is not null and public.can_edit_workspace(workspace_id));

-- category_attributes
create policy category_attributes_select on public.category_attributes for select to authenticated
  using (exists (
    select 1 from public.categories c
    where c.id = category_id and (c.workspace_id is null or public.is_workspace_member(c.workspace_id))
  ));
create policy category_attributes_insert on public.category_attributes for insert to authenticated
  with check (exists (
    select 1 from public.categories c
    where c.id = category_id and c.workspace_id is not null and public.can_edit_workspace(c.workspace_id)
  ));
create policy category_attributes_update on public.category_attributes for update to authenticated
  using (exists (
    select 1 from public.categories c
    where c.id = category_id and c.workspace_id is not null and public.can_edit_workspace(c.workspace_id)
  ))
  with check (exists (
    select 1 from public.categories c
    where c.id = category_id and c.workspace_id is not null and public.can_edit_workspace(c.workspace_id)
  ));
create policy category_attributes_delete on public.category_attributes for delete to authenticated
  using (exists (
    select 1 from public.categories c
    where c.id = category_id and c.workspace_id is not null and public.can_edit_workspace(c.workspace_id)
  ));

-- plans (catálogo público de planes activos)
create policy plans_select on public.plans for select to anon, authenticated
  using (is_active);

-- subscriptions (solo lectura; se modifica desde webhooks/administración)
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (public.is_workspace_member(workspace_id));

-- products
create policy products_select on public.products for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy products_insert on public.products for insert to authenticated
  with check (public.can_edit_workspace(workspace_id));
create policy products_update on public.products for update to authenticated
  using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));
create policy products_delete on public.products for delete to authenticated
  using (public.can_edit_workspace(workspace_id));

-- product_images
create policy product_images_select on public.product_images for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy product_images_insert on public.product_images for insert to authenticated
  with check (public.can_edit_workspace(workspace_id));
create policy product_images_update on public.product_images for update to authenticated
  using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));
create policy product_images_delete on public.product_images for delete to authenticated
  using (public.can_edit_workspace(workspace_id));

-- templates
create policy templates_select on public.templates for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy templates_insert on public.templates for insert to authenticated
  with check (public.can_edit_workspace(workspace_id));
create policy templates_update on public.templates for update to authenticated
  using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));
create policy templates_delete on public.templates for delete to authenticated
  using (public.can_edit_workspace(workspace_id));

-- listings
create policy listings_select on public.listings for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy listings_insert on public.listings for insert to authenticated
  with check (public.can_edit_workspace(workspace_id));
create policy listings_update on public.listings for update to authenticated
  using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));
create policy listings_delete on public.listings for delete to authenticated
  using (public.can_edit_workspace(workspace_id));

-- listing_versions (inmutables: solo lectura; las escribe el trigger)
create policy listing_versions_select on public.listing_versions for select to authenticated
  using (public.is_workspace_member(workspace_id));

-- favorites
create policy favorites_select on public.favorites for select to authenticated
  using (user_id = (select auth.uid()));
create policy favorites_insert on public.favorites for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.listings l where l.id = listing_id and public.is_workspace_member(l.workspace_id))
  );
create policy favorites_delete on public.favorites for delete to authenticated
  using (user_id = (select auth.uid()));

-- generation_jobs / items (solo lectura; se escriben mediante funciones)
create policy generation_jobs_select on public.generation_jobs for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy generation_job_items_select on public.generation_job_items for select to authenticated
  using (public.is_workspace_member(workspace_id));

-- usage_records (solo lectura)
create policy usage_records_select on public.usage_records for select to authenticated
  using (public.is_workspace_member(workspace_id));

-- audit_logs (lectura para propietarios/administradores del workspace)
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (workspace_id is not null and public.can_manage_workspace(workspace_id));

-- =============================================================================
-- PRIVILEGIOS: se parte de cero y se concede solo lo necesario
-- =============================================================================
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;

grant select on public.plans to anon, authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, avatar_url, onboarding_completed_at) on public.profiles to authenticated;
grant select on public.workspaces to authenticated;
grant update (name) on public.workspaces to authenticated;
grant select on public.workspace_members to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.category_attributes to authenticated;
grant select on public.subscriptions to authenticated;
grant select, insert, update, delete on public.products to authenticated;
grant select, insert, update, delete on public.product_images to authenticated;
grant select, insert, update, delete on public.templates to authenticated;
grant select, insert, update, delete on public.listings to authenticated;
grant select on public.listing_versions to authenticated;
grant select, insert, delete on public.favorites to authenticated;
grant select on public.generation_jobs to authenticated;
grant select on public.generation_job_items to authenticated;
grant select on public.usage_records to authenticated;
grant select on public.audit_logs to authenticated;

-- Funciones invocables por usuarios autenticados.
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.can_edit_workspace(uuid) to authenticated;
grant execute on function public.can_manage_workspace(uuid) to authenticated;
grant execute on function public.shares_workspace_with(uuid) to authenticated;
grant execute on function public.is_service_role() to authenticated;
grant execute on function public.try_uuid(text) to authenticated;
grant execute on function public.get_usage_summary(uuid) to authenticated;
grant execute on function public.consume_usage(uuid, text, text, jsonb) to authenticated;
grant execute on function public.create_generation_job(uuid, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.claim_job_items(uuid, integer) to authenticated;
grant execute on function public.report_job_item(uuid, text, uuid, uuid, text, boolean) to authenticated;
grant execute on function public.retry_failed_job_items(uuid) to authenticated;
grant execute on function public.log_audit_event(uuid, text, text, text, jsonb) to authenticated;
grant execute on function public.get_dashboard_stats(uuid) to authenticated;
