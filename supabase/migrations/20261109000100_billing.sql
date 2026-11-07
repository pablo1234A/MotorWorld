-- =============================================================================
-- RevisaYa · Fase 8 · Suscripciones con Stripe (modo TEST). docs/FACTURACION.md
-- Aditivo: los correos de facturación al taller se registran con su tipo.
-- =============================================================================
alter table public.email_logs drop constraint email_logs_kind_check,
  add constraint email_logs_kind_check check (kind in (
    'reminder', 'booking_received', 'booking_confirmed', 'booking_rejected',
    'booking_rescheduled', 'booking_canceled', 'booking_request', 'quote',
    'invitation', 'test', 'digest', 'usage_alert', 'billing'));
