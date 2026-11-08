-- =============================================================================
-- RevisaYa PCI · 3 · Ciclo de vida de los datos PCI: papelera y purga a 30
-- días, supresión inmediata a petición (art. 17 RGPD) y fin de la
-- conservación tras la baja (P9). Se redefinen las funciones existentes para
-- que cubran las tablas nuevas; su comportamiento anterior no cambia.
-- Los archivos de Storage se borran desde la aplicación: aquí solo se anotan
-- en una cola (private.storage_deletions).
-- =============================================================================

create table private.storage_deletions (
  id          bigint generated always as identity primary key,
  bucket      text not null,
  path        text not null,
  created_at  timestamptz not null default now()
);
revoke all on private.storage_deletions from public, anon, authenticated;
grant select, delete on private.storage_deletions to service_role;

-- Borra una instalación con todo lo que cuelga de ella (solo funciones del sistema).
create function private.delete_installation_tree(p_installation uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform set_config('app.purging', 'on', true);
  insert into private.storage_deletions (bucket, path)
    select 'documents', d.storage_path from public.pci_documents d
     where d.installation_id = p_installation
        or d.equipment_id in (select id from public.equipment where installation_id = p_installation)
        or d.work_order_id in (select id from public.work_orders where installation_id = p_installation)
        or d.incident_id in (select id from public.equipment_incidents where installation_id = p_installation)
        or d.record_id in (select id from public.equipment_maintenance_records where installation_id = p_installation);
  insert into private.storage_deletions (bucket, path)
    select 'documents', w.report_pdf_path from public.work_orders w where w.installation_id = p_installation and w.report_pdf_path is not null;
  delete from public.pci_documents d
   where d.installation_id = p_installation
      or d.equipment_id in (select id from public.equipment where installation_id = p_installation)
      or d.work_order_id in (select id from public.work_orders where installation_id = p_installation)
      or d.incident_id in (select id from public.equipment_incidents where installation_id = p_installation)
      or d.record_id in (select id from public.equipment_maintenance_records where installation_id = p_installation);
  delete from public.equipment_incidents where installation_id = p_installation;
  delete from public.work_order_items where work_order_id in (select id from public.work_orders where installation_id = p_installation);
  delete from public.equipment_maintenance_records where installation_id = p_installation;
  delete from public.work_orders where installation_id = p_installation;
  delete from public.equipment where installation_id = p_installation;
  delete from public.installations where id = p_installation;
end;
$$;

-- Borra un equipo con su historial (equipo en la papelera más del plazo).
create function private.delete_equipment_tree(p_equipment uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform set_config('app.purging', 'on', true);
  insert into private.storage_deletions (bucket, path)
    select 'documents', d.storage_path from public.pci_documents d
     where d.equipment_id = p_equipment
        or d.record_id in (select id from public.equipment_maintenance_records where equipment_id = p_equipment)
        or d.incident_id in (select id from public.equipment_incidents where equipment_id = p_equipment);
  delete from public.pci_documents d
   where d.equipment_id = p_equipment
      or d.record_id in (select id from public.equipment_maintenance_records where equipment_id = p_equipment)
      or d.incident_id in (select id from public.equipment_incidents where equipment_id = p_equipment);
  delete from public.equipment_incidents where equipment_id = p_equipment;
  delete from public.work_order_items where equipment_id = p_equipment;
  delete from public.equipment_maintenance_records where equipment_id = p_equipment;
  delete from public.equipment where id = p_equipment;
end;
$$;

create function private.purge_expired_pci_data(p_cutoff timestamptz)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  n_inst int := 0;
  n_eq int := 0;
begin
  perform set_config('app.purging', 'on', true);
  for v_id in select i.id from public.installations i
               left join public.customers c on c.id = i.customer_id
              where i.deleted_at < p_cutoff or c.deleted_at < p_cutoff loop
    perform private.delete_installation_tree(v_id);
    n_inst := n_inst + 1;
  end loop;
  for v_id in select e.id from public.equipment e where e.deleted_at < p_cutoff loop
    perform private.delete_equipment_tree(v_id);
    n_eq := n_eq + 1;
  end loop;
  return jsonb_build_object('installations', n_inst, 'equipment', n_eq);
end;
$$;

revoke all on function private.delete_installation_tree(uuid), private.delete_equipment_tree(uuid),
  private.purge_expired_pci_data(timestamptz) from public, anon, authenticated;

create or replace function private.purge_expired_data(
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
  v_pci jsonb;
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

  -- PCI (antes que los clientes, por las FK): equipos e instalaciones en la
  -- papelera más tiempo del plazo, y todo lo de los clientes que se purgan.
  v_pci := private.purge_expired_pci_data(v_cutoff);

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
    'import_rows', v_n_rows, 'rate_limit_buckets', v_n_buckets) || jsonb_build_object('pci', v_pci);
  update private.job_runs set finished_at = now(), status = 'succeeded', stats = v_stats where id = v_run;
  perform set_config('app.purging', '', true);
  return v_stats;
end;
$$;

create or replace function app.erase_customer(p_customer uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_vehicles uuid[];
  v_pdfs text[];
  v_stats jsonb;
  n_vehicles int; n_records int; n_reminders int; n_quotes int; n_appts int; n_logs int;
  n_installations int := 0;
  v_inst uuid;
begin
  select c.organization_id into v_org from public.customers c where c.id = p_customer;
  if v_org is null or v_org not in (select app.admin_orgs()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform set_config('app.purging', 'on', true);

  select coalesce(array_agg(v.id), '{}') into v_vehicles from public.vehicles v where v.customer_id = p_customer;
  -- Instalaciones del cliente con sus equipos, historial, órdenes, incidencias y documentos.
  for v_inst in select id from public.installations where customer_id = p_customer loop
    perform private.delete_installation_tree(v_inst);
    n_installations := n_installations + 1;
  end loop;
  select coalesce(array_agg(q.pdf_path) filter (where q.pdf_path is not null), '{}') into v_pdfs from public.quotes q where q.customer_id = p_customer;

  delete from public.quotes where customer_id = p_customer;
  get diagnostics n_quotes = row_count;
  update public.quotes set vehicle_id = null where vehicle_id = any (v_vehicles);
  delete from public.appointments where customer_id = p_customer or vehicle_id = any (v_vehicles);
  get diagnostics n_appts = row_count;
  delete from public.reminders where customer_id = p_customer or vehicle_id = any (v_vehicles);
  get diagnostics n_reminders = row_count;
  update public.email_logs
     set to_email = 'suprimido@revisaya.invalid', subject = '[suprimido]', customer_id = null, vehicle_id = null, reply_to = null
   where customer_id = p_customer or vehicle_id = any (v_vehicles);
  get diagnostics n_logs = row_count;
  delete from public.maintenance_records where vehicle_id = any (v_vehicles);
  get diagnostics n_records = row_count;
  delete from public.vehicles where id = any (v_vehicles);
  get diagnostics n_vehicles = row_count;
  delete from public.customers where id = p_customer;

  v_stats := jsonb_build_object('vehicles', n_vehicles, 'maintenance_records', n_records, 'reminders', n_reminders,
                                'quotes', n_quotes, 'appointments', n_appts, 'email_logs_anonymized', n_logs,
                                'installations', n_installations);
  insert into public.data_subject_requests (organization_id, customer_id, type, status, completed_at, handled_by, notes)
  values (v_org, null, 'erasure', 'completed', now(), (select auth.uid()), 'Supresión inmediata desde la ficha del cliente');
  insert into public.audit_logs (organization_id, actor_type, actor_id, action, resource_type, resource_id, metadata)
  values (v_org, 'user', (select auth.uid()), 'customer.erased', 'customer', p_customer::text, v_stats);
  perform set_config('app.purging', '', true);
  return v_stats || jsonb_build_object('pdf_paths', to_jsonb(v_pdfs));
end;
$$;

create or replace function private.purge_organization_data(p_org uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_files text[];
  v_docs text[];
  v_logo text;
  v_counts jsonb;
  n_customers int; n_vehicles int;
begin
  if not coalesce(private.retention_due(p_org), false) then
    raise exception 'retention_not_due' using errcode = '22023';
  end if;
  perform set_config('app.purging', 'on', true);
  select logo_path into v_logo from public.organizations where id = p_org;
  select coalesce(array_agg(pdf_path) filter (where pdf_path is not null), '{}') into v_files from public.quotes where organization_id = p_org;
  if v_logo is not null then v_files := v_files || v_logo; end if;
  select count(*) into n_customers from public.customers where organization_id = p_org;
  select count(*) into n_vehicles from public.vehicles where organization_id = p_org;

  select coalesce(array_agg(storage_path), '{}') into v_docs from public.pci_documents where organization_id = p_org;
  v_files := v_files || v_docs;
  delete from public.pci_documents where organization_id = p_org;
  delete from public.equipment_incidents where organization_id = p_org;
  delete from public.work_order_events where organization_id = p_org;
  delete from public.work_order_items where organization_id = p_org;
  delete from public.equipment_record_materials where organization_id = p_org;
  delete from public.equipment_maintenance_records where organization_id = p_org;
  delete from public.work_orders where organization_id = p_org;
  delete from public.equipment_action_schedules where organization_id = p_org;
  delete from public.equipment_extinguishers where organization_id = p_org;
  delete from public.equipment where organization_id = p_org;
  delete from public.installations where organization_id = p_org;
  delete from public.technicians where organization_id = p_org;
  delete from public.org_action_type_settings where organization_id = p_org;
  delete from public.maintenance_action_types where organization_id = p_org;
  delete from public.equipment_types where organization_id = p_org;
  delete from public.calendar_event_links where organization_id = p_org;
  delete from public.appointment_events where organization_id = p_org;
  delete from public.appointments where organization_id = p_org;
  delete from public.quote_items where organization_id = p_org;
  delete from public.quotes where organization_id = p_org;
  delete from public.document_sequences where organization_id = p_org;
  delete from public.email_logs where organization_id = p_org;
  delete from public.reminders where organization_id = p_org;
  delete from public.maintenance_parts where organization_id = p_org;
  delete from public.mileage_readings where organization_id = p_org;
  delete from public.maintenance_records where organization_id = p_org;
  delete from public.vehicles where organization_id = p_org;
  delete from public.data_subject_requests where organization_id = p_org;
  delete from public.customers where organization_id = p_org;
  delete from public.import_rows where organization_id = p_org;
  delete from public.import_batches where organization_id = p_org;
  delete from public.email_templates where organization_id = p_org;
  delete from public.email_suppressions where organization_id = p_org;
  delete from public.sending_domains where organization_id = p_org;
  delete from public.integrations where organization_id = p_org;
  delete from public.api_request_logs where organization_id = p_org;
  delete from public.api_keys where organization_id = p_org;
  delete from public.invitations where organization_id = p_org;
  delete from public.blackout_dates where organization_id = p_org;
  delete from public.availability_rules where organization_id = p_org;
  delete from public.usage_counters where organization_id = p_org;

  update public.organizations set logo_path = null, data_retention_until = null, status = 'deleted' where id = p_org;
  v_counts := jsonb_build_object('customers', n_customers, 'vehicles', n_vehicles, 'files', cardinality(v_files));
  insert into public.audit_logs (organization_id, actor_type, action, resource_type, resource_id, metadata)
  values (p_org, 'system', 'organization.purged', 'organization', p_org::text, v_counts);
  perform set_config('app.purging', '', true);
  return v_counts || jsonb_build_object('files', to_jsonb(v_files));
end;
$$;
