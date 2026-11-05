-- =============================================================================
-- RevisaYa · Retención y purga (SEGURIDAD §6)
--
--  · Clientes y vehículos borrados (borrado lógico) hace más de 30 días se
--    eliminan definitivamente, con todo lo que cuelga de ellos (historial,
--    recordatorios, presupuestos del cliente). Las citas y los registros de
--    correo se conservan desvinculados (FK `set null`).
--  · Staging de importaciones: lotes no confirmados caducados se eliminan; de
--    los confirmados se eliminan las filas (datos personales) a los 7 días y
--    se conserva el resumen.
--  · Contadores de rate limiting sin uso en 1 día.
--
-- Se ejecuta a diario con pg_cron. La lista de supresión de correos NO se
-- purga: es la garantía de no volver a escribir a quien se dio de baja.
-- =============================================================================

-- La purga del sistema puede saltarse protecciones pensadas para usuarios
-- (presupuestos enviados no editables, auditoría fila a fila, recálculo de la
-- ficha de un vehículo que se va a borrar). Solo dentro de funciones del
-- sistema: un usuario (`authenticated`/`anon`) nunca activa esta excepción,
-- aunque fije el parámetro.
create function app.is_purging()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('app.purging', true), '') = 'on'
     and current_user not in ('authenticated', 'anon');
$$;
grant execute on function app.is_purging() to authenticated, service_role;

create or replace function app.guard_quote_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if app.is_purging() then
    return new;
  end if;
  if new.number is distinct from old.number or new.sequence is distinct from old.sequence
     or new.series_year is distinct from old.series_year then
    raise exception 'quote_number_immutable' using errcode = '23514';
  end if;
  if old.status <> 'draft' and (
       new.customer_id is distinct from old.customer_id
    or new.vehicle_id is distinct from old.vehicle_id
    or new.issue_date is distinct from old.issue_date
    or new.valid_until is distinct from old.valid_until
    or new.subtotal is distinct from old.subtotal
    or new.tax_total is distinct from old.tax_total
    or new.total is distinct from old.total) then
    raise exception 'quote_not_editable' using errcode = '23514';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'draft' and new.status in ('sent', 'expired'))
    or (old.status = 'sent' and new.status in ('accepted', 'rejected', 'expired'))) then
    raise exception 'invalid_quote_transition'
      using errcode = '23514', detail = format('%s -> %s', old.status, new.status);
  end if;
  return new;
end;
$$;

create or replace function app.guard_quote_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.is_purging() then
    return coalesce(new, old);
  end if;
  if exists (select 1 from public.quotes q
             where q.id = coalesce(new.quote_id, old.quote_id) and q.status <> 'draft') then
    raise exception 'quote_not_editable' using errcode = '23514';
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function app.on_maintenance_record_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.is_purging() then
    return null;
  end if;
  if tg_op = 'INSERT' and new.km is not null then
    insert into public.mileage_readings
      (organization_id, branch_id, vehicle_id, km, read_on, source, maintenance_record_id, created_by)
    values
      (new.organization_id, new.branch_id, new.vehicle_id, new.km, new.service_date, 'maintenance', new.id, new.created_by);
  elsif tg_op = 'UPDATE' and (new.km is distinct from old.km or new.service_date is distinct from old.service_date) then
    delete from public.mileage_readings where maintenance_record_id = new.id;
    if new.km is not null then
      insert into public.mileage_readings
        (organization_id, branch_id, vehicle_id, km, read_on, source, maintenance_record_id, created_by)
      values
        (new.organization_id, new.branch_id, new.vehicle_id, new.km, new.service_date, 'maintenance', new.id, new.created_by);
    end if;
  end if;
  perform app.refresh_vehicle_service(coalesce(new.vehicle_id, old.vehicle_id));
  return null;
end;
$$;

create or replace function app.audit_trigger()
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
  -- La purga registra un único evento resumen por organización.
  if app.is_purging() then
    return null;
  end if;
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

-- -----------------------------------------------------------------------------
-- Purga
-- -----------------------------------------------------------------------------
create function private.purge_expired_data(
  p_retention interval default interval '30 days',
  p_staging interval default interval '7 days'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run bigint;
  v_cutoff timestamptz := now() - p_retention;
  v_customers uuid[];
  v_vehicles uuid[];
  v_stats jsonb;
  v_org_customers jsonb;
  v_org_vehicles jsonb;
  v_n_customers int;
  v_n_vehicles int;
  v_n_records int;
  v_n_reminders int;
  v_n_quotes int;
  v_n_batches int;
  v_n_rows int;
  v_n_buckets int;
begin
  insert into private.job_runs (job_name) values ('purge_expired_data') returning id into v_run;
  perform set_config('app.purging', 'on', true);

  select coalesce(array_agg(c.id), '{}') into v_customers
  from public.customers c where c.deleted_at < v_cutoff;

  -- Vehículos borrados hace más del plazo, y todos los de clientes que se purgan.
  select coalesce(array_agg(v.id), '{}') into v_vehicles
  from public.vehicles v
  where v.deleted_at < v_cutoff or v.customer_id = any (v_customers);

  -- Recuentos por organización para la auditoría (antes de borrar).
  select coalesce(jsonb_object_agg(organization_id, n), '{}') into v_org_customers
  from (select organization_id, count(*) n from public.customers where id = any (v_customers) group by 1) s;
  select coalesce(jsonb_object_agg(organization_id, n), '{}') into v_org_vehicles
  from (select organization_id, count(*) n from public.vehicles where id = any (v_vehicles) group by 1) s;

  -- Presupuestos: los del cliente purgado se eliminan; los que solo apuntan a un
  -- vehículo purgado conservan el presupuesto sin vehículo (el snapshot guarda sus datos).
  delete from public.quotes q where q.customer_id = any (v_customers);
  get diagnostics v_n_quotes = row_count;
  update public.quotes set vehicle_id = null where vehicle_id = any (v_vehicles);

  delete from public.reminders r where r.vehicle_id = any (v_vehicles) or r.customer_id = any (v_customers);
  get diagnostics v_n_reminders = row_count;

  delete from public.maintenance_records m where m.vehicle_id = any (v_vehicles);
  get diagnostics v_n_records = row_count;

  delete from public.vehicles v where v.id = any (v_vehicles);
  get diagnostics v_n_vehicles = row_count;

  delete from public.customers c where c.id = any (v_customers);
  get diagnostics v_n_customers = row_count;

  -- Un evento de auditoría por organización afectada (solo recuentos, sin datos personales).
  insert into public.audit_logs (organization_id, actor_type, action, resource_type, resource_id, metadata)
  select k::uuid, 'system', 'data.purged', 'organizations', k,
         jsonb_build_object('customers', coalesce((v_org_customers ->> k)::int, 0),
                            'vehicles', coalesce((v_org_vehicles ->> k)::int, 0),
                            'retention_days', extract(day from p_retention)::int)
  from (select jsonb_object_keys(v_org_customers) as k
        union
        select jsonb_object_keys(v_org_vehicles)) keys;

  -- Staging de importaciones
  delete from public.import_batches b where b.status <> 'committed' and b.expires_at < now();
  get diagnostics v_n_batches = row_count;
  delete from public.import_rows r using public.import_batches b
  where r.batch_id = b.id and b.status = 'committed' and b.committed_at < now() - p_staging;
  get diagnostics v_n_rows = row_count;

  delete from private.rate_limit_buckets where updated_at < now() - interval '1 day';
  get diagnostics v_n_buckets = row_count;

  v_stats := jsonb_build_object(
    'customers', v_n_customers, 'vehicles', v_n_vehicles, 'maintenance_records', v_n_records,
    'reminders', v_n_reminders, 'quotes', v_n_quotes, 'import_batches', v_n_batches,
    'import_rows', v_n_rows, 'rate_limit_buckets', v_n_buckets);
  update private.job_runs set finished_at = now(), status = 'succeeded', stats = v_stats where id = v_run;
  perform set_config('app.purging', '', true);
  return v_stats;
end;
$$;

revoke all on function private.purge_expired_data(interval, interval) from public, anon, authenticated;
grant execute on function private.purge_expired_data(interval, interval) to service_role;

-- -----------------------------------------------------------------------------
-- Programación diaria (03:17 UTC, fuera de horas de envío de avisos)
-- -----------------------------------------------------------------------------
create extension if not exists pg_cron;

select cron.schedule('revisaya-purge-expired-data', '17 3 * * *', $$select private.purge_expired_data()$$);
