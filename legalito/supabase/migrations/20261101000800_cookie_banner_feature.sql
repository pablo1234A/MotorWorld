-- =============================================================================
-- Legalito · Banner de consentimiento de cookies incluido en las suscripciones
-- Se añade a la lista de características visible de los planes (sin duplicar).
-- =============================================================================
update public.products
   set features = (
     select jsonb_agg(f order by ord)
       from (
         select value as f, ordinality * 10 as ord from jsonb_array_elements(features) with ordinality
         union all
         select '"Banner de consentimiento de cookies"'::jsonb, 35
       ) x
   )
 where kind = 'subscription'
   and code in ('subscription_basic', 'subscription_medium', 'subscription_business')
   and not features @> '["Banner de consentimiento de cookies"]'::jsonb;
