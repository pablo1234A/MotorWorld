-- =============================================================================
-- RevisaYa · Fase 10: correo de bienvenida al taller (PDF §11) y registro de
-- la aceptación de los textos legales (ADR-025). Solo amplía restricciones.
-- =============================================================================

alter table public.email_logs drop constraint email_logs_kind_check,
  add constraint email_logs_kind_check check (kind in (
    'reminder', 'booking_received', 'booking_confirmed', 'booking_rejected',
    'booking_rescheduled', 'booking_canceled', 'booking_request', 'quote',
    'invitation', 'test', 'digest', 'usage_alert', 'billing', 'welcome'));

-- Aceptación de términos y privacidad (al registrarse) y del encargo del
-- tratamiento (al crear el taller). Solo el sistema escribe; el usuario lee
-- las suyas (política ya existente).
create function app.record_legal_acceptance(p_user uuid, p_org uuid, p_document text, p_version text, p_ip inet)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.legal_acceptances (user_id, organization_id, document, version, ip_truncated)
  values (p_user, p_org, p_document, p_version, p_ip)
  on conflict (user_id, organization_id, document, version) do nothing;
$$;
revoke all on function app.record_legal_acceptance(uuid, uuid, text, text, inet) from public, anon, authenticated;
grant execute on function app.record_legal_acceptance(uuid, uuid, text, text, inet) to service_role;
