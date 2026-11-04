-- =============================================================================
-- RevisaYa · 0200 · Catálogo de planes
-- Fuente única de precios, límites y funcionalidades (espejo tipado en
-- src/server/entitlements/plans.ts; un test verifica que coinciden).
-- Precios y límites EXACTOS del PDF "RevisaYa: plan completo".
-- =============================================================================

create table public.plans (
  code                 text primary key
                       check (code in ('pro', 'max', 'business', 'excelencia')),
  name                 text not null,
  price_month_cents    integer not null check (price_month_cents > 0),
  price_year_cents     integer not null check (price_year_cents > 0),
  currency             text not null default 'EUR' check (currency = 'EUR'),
  max_customers        integer check (max_customers > 0),        -- null = ilimitado
  max_active_vehicles  integer check (max_active_vehicles > 0),  -- null = ilimitado
  monthly_emails       integer not null check (monthly_emails >= 0),
  max_users            integer check (max_users > 0),            -- null = ilimitado
  max_branches         integer check (max_branches > 0),         -- null = ilimitado
  features             text[] not null default '{}',
  sort_order           smallint not null unique,
  is_public            boolean not null default true,
  constraint plans_features_valid check (
    features <@ array[
      'import', 'date_reminders', 'quotes_pdf',
      'google_calendar', 'km_reminders', 'reports',
      'multi_branch', 'priority_support', 'onboarding',
      'api', 'custom_templates', 'included_domain', 'account_manager'
    ]::text[]
  )
);

comment on table public.plans is
  'Catálogo de planes. null en un límite = ilimitado. Solo lectura para usuarios.';

insert into public.plans
  (code, name, price_month_cents, price_year_cents, max_customers, max_active_vehicles,
   monthly_emails, max_users, max_branches, features, sort_order)
values
  ('pro', 'Pro', 3900, 39000, 150, 300, 500, 1, 1,
   array['import', 'date_reminders', 'quotes_pdf'], 1),
  ('max', 'Max', 7900, 79000, 800, 2000, 3000, 3, 1,
   array['import', 'date_reminders', 'quotes_pdf',
         'google_calendar', 'km_reminders', 'reports'], 2),
  ('business', 'Business', 14900, 149000, null, null, 15000, null, 3,
   array['import', 'date_reminders', 'quotes_pdf',
         'google_calendar', 'km_reminders', 'reports',
         'multi_branch', 'priority_support', 'onboarding'], 3),
  ('excelencia', 'Excelencia', 24900, 249000, null, null, 50000, null, null,
   array['import', 'date_reminders', 'quotes_pdf',
         'google_calendar', 'km_reminders', 'reports',
         'multi_branch', 'priority_support', 'onboarding',
         'api', 'custom_templates', 'included_domain', 'account_manager'], 4);

alter table public.plans enable row level security;
alter table public.plans force row level security;

create policy plans_public_read on public.plans
  for select to anon, authenticated
  using (is_public);

revoke all on public.plans from anon, authenticated;
grant select on public.plans to anon, authenticated;
