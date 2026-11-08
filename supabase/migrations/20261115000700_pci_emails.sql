-- PCI: correo «próxima actuación» (aviso al cliente de una orden de trabajo
-- programada). Solo amplía las listas de tipos; no toca datos.
alter table public.email_logs drop constraint email_logs_kind_check,
  add constraint email_logs_kind_check check (kind in (
    'reminder', 'booking_received', 'booking_confirmed', 'booking_rejected', 'booking_rescheduled', 'booking_canceled',
    'booking_request', 'quote', 'invitation', 'test', 'digest', 'usage_alert', 'billing', 'welcome',
    'service_completed', 'incident_detected', 'report_sent', 'action_upcoming'));

alter table public.email_templates drop constraint email_templates_kind_check,
  add constraint email_templates_kind_check check (kind in (
    'reminder_service_date', 'reminder_service_km', 'reminder_maintenance',
    'booking_received', 'booking_confirmed', 'booking_rejected', 'booking_rescheduled', 'booking_canceled',
    'service_completed', 'incident_detected', 'report_sent', 'action_upcoming'));

-- Incidencia comunicada al cliente: queda constancia en el registro de correos.
alter table public.email_logs add column incident_id uuid,
  add foreign key (organization_id, branch_id, incident_id) references public.equipment_incidents (organization_id, branch_id, id) on delete set null (incident_id);
create index email_logs_work_order_idx on public.email_logs (work_order_id) where work_order_id is not null;
create index email_logs_incident_idx on public.email_logs (incident_id) where incident_id is not null;
