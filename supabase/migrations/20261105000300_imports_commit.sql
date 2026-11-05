-- =============================================================================
-- RevisaYa · Fase 4 · Importación Excel/CSV
--
-- La confirmación es UNA función que se ejecuta en UNA transacción con los
-- permisos del usuario (SECURITY INVOKER: RLS, triggers de límites y
-- restricciones se aplican igual que en un alta manual). Si cualquier fila
-- falla, no se guarda ninguna.
-- =============================================================================

-- Filas que el taller decide no importar.
alter table public.import_rows drop constraint import_rows_action_check;
alter table public.import_rows add constraint import_rows_action_check check (action in (
  'create_customer_and_vehicle', 'attach_to_existing_customer', 'skip_duplicate', 'skip_empty', 'skip_excluded'));

-- Trazabilidad del lote en las fichas creadas por una importación. La FK
-- compuesta (organización, sucursal, lote) impide apuntar a un lote ajeno.
-- `id`: la confirmación genera los UUID de antemano para enlazar cliente y vehículos
-- sin depender del orden de RETURNING (la clave primaria garantiza la unicidad).
grant insert (id, import_batch_id) on public.customers, public.vehicles to authenticated;

-- Estado intermedio mientras se confirma (lo fija y lo resuelve la propia función).
create function app.commit_import(p_batch uuid, p_allow_repeat boolean default false)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_batch public.import_batches;
  v_uid uuid := (select auth.uid());
  v_customers int := 0;
  v_vehicles int := 0;
  v_records int := 0;
  v_attached int := 0;
begin
  -- Bloquea el lote: dos confirmaciones simultáneas se serializan y la segunda
  -- encuentra el lote ya confirmado.
  select * into v_batch from public.import_batches where id = p_batch for update;
  if not found then
    raise exception 'import_not_found' using errcode = 'P0002';
  end if;
  if v_batch.status = 'committed' then
    raise exception 'import_already_committed' using errcode = 'RY006', detail = 'already_committed';
  end if;
  if v_batch.status <> 'validated' or v_batch.error_count > 0 then
    raise exception 'import_has_errors' using errcode = 'RY006', detail = 'has_errors';
  end if;
  if v_batch.expires_at < now() then
    raise exception 'import_expired' using errcode = 'RY006', detail = 'expired';
  end if;
  if not p_allow_repeat and exists (
       select 1 from public.import_batches b
       where b.branch_id = v_batch.branch_id and b.file_sha256 = v_batch.file_sha256
         and b.status = 'committed' and b.id <> v_batch.id) then
    raise exception 'import_repeated' using errcode = 'RY006', detail = 'repeated_file';
  end if;

  -- Filas importables con sus datos normalizados.
  create temporary table _rows on commit drop as
  select r.row_number,
         r.action,
         r.matched_customer_id,
         r.normalized ->> 'customerKey' as customer_key,
         r.normalized ->> 'firstName' as first_name,
         r.normalized ->> 'lastName' as last_name,
         nullif(r.normalized ->> 'email', '') as email,
         nullif(r.normalized ->> 'phone', '') as phone,
         r.normalized ->> 'plate' as plate,
         nullif(r.normalized ->> 'make', '') as make,
         nullif(r.normalized ->> 'model', '') as model,
         (r.normalized ->> 'lastService')::date as last_service,
         (r.normalized ->> 'km')::int as km,
         (r.normalized ->> 'nextService')::date as next_service
  from public.import_rows r
  where r.batch_id = p_batch
    and r.action in ('create_customer_and_vehicle', 'attach_to_existing_customer')
    and jsonb_array_length(r.errors) = 0;

  -- Un cliente nuevo por clave de agrupación (los datos de su primera fila).
  create temporary table _new_customers on commit drop as
  select distinct on (customer_key) customer_key, gen_random_uuid() as id, first_name, last_name, email, phone
  from _rows
  where action = 'create_customer_and_vehicle'
  order by customer_key, row_number;

  insert into public.customers (id, organization_id, branch_id, first_name, last_name, email, phone, source, import_batch_id, created_by)
  select id, v_batch.organization_id, v_batch.branch_id, first_name, last_name, email, phone, 'import', p_batch, v_uid
  from _new_customers;
  get diagnostics v_customers = row_count;

  select count(distinct matched_customer_id) into v_attached from _rows where action = 'attach_to_existing_customer';

  create temporary table _new_vehicles on commit drop as
  select gen_random_uuid() as id,
         coalesce(r.matched_customer_id, c.id) as customer_id,
         r.plate, r.make, r.model, r.km, r.last_service, r.next_service, r.row_number
  from _rows r
  left join _new_customers c on c.customer_key = r.customer_key and r.action = 'create_customer_and_vehicle';

  insert into public.vehicles (id, organization_id, branch_id, customer_id, plate, make, model, current_km, import_batch_id, created_by)
  select id, v_batch.organization_id, v_batch.branch_id, customer_id, plate, make, model, km, p_batch, v_uid
  from _new_vehicles;
  get diagnostics v_vehicles = row_count;

  -- La "última revisión" de cada fila entra en el historial; el trigger calcula
  -- la próxima (la indicada en el archivo o última + intervalo del taller).
  insert into public.maintenance_records
    (organization_id, branch_id, vehicle_id, service_date, km, work_performed, next_recommended_date, created_by)
  select v_batch.organization_id, v_batch.branch_id, id, last_service, km, 'Revisión importada', next_service, v_uid
  from _new_vehicles;
  get diagnostics v_records = row_count;

  update public.import_batches
     set status = 'committed',
         committed_at = now(),
         summary = summary || jsonb_build_object(
           'committed', jsonb_build_object('customers', v_customers, 'attachedCustomers', v_attached,
                                           'vehicles', v_vehicles, 'maintenanceRecords', v_records))
   where id = p_batch;

  return jsonb_build_object('customers', v_customers, 'attachedCustomers', v_attached, 'vehicles', v_vehicles, 'maintenanceRecords', v_records);
end;
$$;

grant execute on function app.commit_import(uuid, boolean) to authenticated;
