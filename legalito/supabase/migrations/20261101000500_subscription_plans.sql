-- =============================================================================
-- Legalito · Tres planes de suscripción con cupo mensual de documentos
-- -----------------------------------------------------------------------------
--   Básico    5,99 €/mes  · hasta 20 documentos por periodo de facturación
--   Medium   10,99 €/mes  · hasta 50 documentos por periodo de facturación
--   Business 30,99 €/mes  · documentos ilimitados
-- Cada documento generado (aviso legal, privacidad o cookies) cuenta 1.
-- La suscripción única anterior (subscription_monthly) se desactiva para nuevas
-- ventas, pero se conserva para no alterar a los clientes que ya la tengan.
-- =============================================================================

alter table public.products
  add column if not exists documents_per_period int
  check (documents_per_period is null or documents_per_period > 0);

comment on column public.products.documents_per_period is
  'Suscripciones: documentos que se pueden generar por periodo de facturación (null = ilimitados).';

-- La administración edita el cupo con su sesión (RLS: solo is_admin()).
grant update (documents_per_period) on public.products to authenticated;

insert into public.products (code, name, description, kind, price_cents, currency, billing_interval,
  included_document_types, generations_limit, includes_updates, documents_per_period, features, sort_order)
values
  ('subscription_basic', 'Básico', 'Para mantener al día los textos legales de una web.',
   'subscription', 599, 'eur', 'month', array['aviso_legal', 'privacidad', 'cookies'], null, true, 20,
   '["Hasta 20 documentos al mes", "Aviso legal, privacidad y cookies", "Descarga en PDF y código HTML", "Nuevas versiones revisadas de las plantillas", "Avisos de cambios relevantes", "Cancela cuando quieras"]'::jsonb,
   2),
  ('subscription_medium', 'Medium', 'Para negocios que actualizan su web con frecuencia.',
   'subscription', 1099, 'eur', 'month', array['aviso_legal', 'privacidad', 'cookies'], null, true, 50,
   '["Hasta 50 documentos al mes", "Aviso legal, privacidad y cookies", "Descarga en PDF y código HTML", "Nuevas versiones revisadas de las plantillas", "Avisos de cambios relevantes", "Cancela cuando quieras"]'::jsonb,
   3),
  ('subscription_business', 'Business', 'Sin límites para negocios con mucha actividad.',
   'subscription', 3099, 'eur', 'month', array['aviso_legal', 'privacidad', 'cookies'], null, true, null,
   '["Documentos ilimitados", "Aviso legal, privacidad y cookies", "Descarga en PDF y código HTML", "Nuevas versiones revisadas de las plantillas", "Avisos de cambios relevantes", "Cancela cuando quieras"]'::jsonb,
   4)
on conflict (code) do nothing;

update public.products set active = false where code = 'subscription_monthly';
