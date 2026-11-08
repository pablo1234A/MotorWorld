-- =============================================================================
-- RevisaYa · Fin de la conservación tras la baja (P9, aprobada): 60 días
-- después de terminar la suscripción se borran los datos del taller, con aviso
-- por correo 7 días antes (lo envía el proceso `retention`).
--
-- Se borran los datos de negocio (clientes, vehículos, historial, avisos,
-- citas, presupuestos, correos, importaciones, integraciones, claves de API,
-- plantillas, dominios…). Se CONSERVAN, por obligación legal o para poder
-- demostrar lo ocurrido: la organización (estado «deleted»), sus usuarios,
-- la suscripción y las facturas, las aceptaciones de los textos legales y la
-- auditoría (que se purga a los 24 meses). Si el taller vuelve a contratar
-- antes de la fecha, data_retention_until se anula y no se borra nada.
-- =============================================================================

create table private.retention_notices (
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  retention_until  date not null,
  sent_at          timestamptz not null default now(),
  primary key (organization_id, retention_until)
);
revoke all on private.retention_notices from public, anon, authenticated;
grant select, insert on private.retention_notices to service_role;

-- ¿Se puede purgar? Fecha vencida y sin suscripción con acceso.
create function private.retention_due(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select o.data_retention_until is not null and o.data_retention_until < current_date
     and not exists (select 1 from public.subscriptions s where s.organization_id = o.id
                      and (app.subscription_is_active(s.status, s.past_due_since) or s.status in ('trialing', 'active', 'past_due', 'unpaid', 'paused', 'incomplete')))
    from public.organizations o where o.id = p_org;
$$;

-- Borra los datos de UN taller. Devuelve las rutas de archivos para borrarlas del almacenamiento.
create function private.purge_organization_data(p_org uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_files text[];
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
revoke all on function private.retention_due(uuid), private.purge_organization_data(uuid) from public, anon, authenticated;
