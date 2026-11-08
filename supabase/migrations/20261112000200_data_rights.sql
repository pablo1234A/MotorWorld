-- =============================================================================
-- RevisaYa · Derechos de protección de datos y retención de registros.
--  · app.erase_customer: supresión INMEDIATA de un cliente (art. 17 RGPD) por
--    un administrador del taller: cliente, vehículos, historial, avisos,
--    presupuestos y citas; los registros de correo se anonimizan. La lista de
--    bajas (email_suppressions) se conserva: es la garantía de no volver a
--    escribirle si vuelve a aparecer en un Excel.
--  · private.purge_old_logs: registros de correo y de auditoría a los 24 meses.
-- Funciones nuevas; los borrados son los que pide el interesado o la retención
-- aprobada (P9), no cambios de esquema.
-- =============================================================================

create function app.erase_customer(p_customer uuid)
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
begin
  select c.organization_id into v_org from public.customers c where c.id = p_customer;
  if v_org is null or v_org not in (select app.admin_orgs()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform set_config('app.purging', 'on', true);

  select coalesce(array_agg(v.id), '{}') into v_vehicles from public.vehicles v where v.customer_id = p_customer;
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
                                'quotes', n_quotes, 'appointments', n_appts, 'email_logs_anonymized', n_logs);
  insert into public.data_subject_requests (organization_id, customer_id, type, status, completed_at, handled_by, notes)
  values (v_org, null, 'erasure', 'completed', now(), (select auth.uid()), 'Supresión inmediata desde la ficha del cliente');
  insert into public.audit_logs (organization_id, actor_type, actor_id, action, resource_type, resource_id, metadata)
  values (v_org, 'user', (select auth.uid()), 'customer.erased', 'customer', p_customer::text, v_stats);
  perform set_config('app.purging', '', true);
  return v_stats || jsonb_build_object('pdf_paths', to_jsonb(v_pdfs));
end;
$$;
revoke all on function app.erase_customer(uuid) from public, anon;
grant execute on function app.erase_customer(uuid) to authenticated;

create function private.purge_old_logs(p_keep interval default interval '24 months')
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n_mail int; n_audit int; n_events int;
begin
  perform set_config('app.purging', 'on', true);
  delete from public.email_logs where created_at < now() - p_keep;
  get diagnostics n_mail = row_count;
  delete from public.audit_logs where created_at < now() - p_keep;
  get diagnostics n_audit = row_count;
  delete from public.stripe_events where received_at < now() - p_keep;
  get diagnostics n_events = row_count;
  perform set_config('app.purging', '', true);
  return jsonb_build_object('email_logs', n_mail, 'audit_logs', n_audit, 'stripe_events', n_events);
end;
$$;
revoke all on function private.purge_old_logs(interval) from public, anon, authenticated;

select cron.schedule('revisaya-purge-old-logs', '47 3 * * *', $$select private.purge_old_logs()$$);
