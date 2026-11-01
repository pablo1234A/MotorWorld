-- =============================================================================
-- Legalito · Nuevos precios de los planes
--   Medium   10,99 € → 9,99 €/mes
--   Business 30,99 € → 19,99 €/mes
-- Los precios de Stripe son inmutables: hay que crear precios nuevos en Stripe
-- (scripts/stripe-setup.ts) y asignarlos en /admin/productos. Las suscripciones
-- existentes conservan su precio salvo que se migren desde Stripe.
-- =============================================================================
update public.products set price_cents = 999 where code = 'subscription_medium';
update public.products set price_cents = 1999 where code = 'subscription_business';

update public.faqs
   set answer = 'Hay tres planes: Básico (5,99 €/mes, hasta 20 documentos al mes), Medium (9,99 €/mes, hasta 50) y Business (19,99 €/mes, ilimitados). Todos incluyen aviso legal, privacidad y cookies, las nuevas versiones de las plantillas cuando se publiquen tras una revisión documentada, el historial de versiones y avisos de cambios relevantes.'
 where question = '¿Qué incluye la suscripción?';
