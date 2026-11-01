-- =============================================================================
-- Legalito · Esquema principal
-- -----------------------------------------------------------------------------
-- Convenciones:
--   * Todas las tablas viven en `public` con RLS activado (ver migración 0200).
--   * Los registros económicos (subscriptions, payments, purchases) NO se borran
--     en cascada al eliminar una organización: se desvinculan (set null) para
--     conservar la trazabilidad contable exigible.
--   * Los identificadores de Stripe son únicos para garantizar idempotencia.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'support', 'legal_reviewer');
create type public.owner_type as enum ('persona_fisica', 'persona_juridica');
create type public.product_kind as enum ('one_time', 'subscription');
create type public.subscription_status as enum (
  'incomplete', 'incomplete_expired', 'trialing', 'active',
  'past_due', 'canceled', 'unpaid', 'paused'
);
create type public.payment_status as enum (
  'pending', 'succeeded', 'failed', 'refunded', 'partially_refunded', 'disputed'
);
create type public.purchase_status as enum ('active', 'refunded', 'revoked');
create type public.template_status as enum ('draft', 'in_review', 'approved', 'published', 'retired');
create type public.form_status as enum ('draft', 'completed');
create type public.support_status as enum ('open', 'in_progress', 'closed');
create type public.legal_update_status as enum ('draft', 'published');
create type public.email_status as enum ('queued', 'sent', 'failed', 'skipped');
create type public.notice_level as enum ('info', 'warning', 'important');

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.try_uuid(p text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Catálogo de tipos de documento (ampliable sin migraciones)
-- ---------------------------------------------------------------------------
create table public.document_types (
  code        text primary key check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  name        text not null check (length(name) between 2 and 120),
  description text,
  sort_order  int  not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Usuarios y organizaciones
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  email                 text not null,
  full_name             text check (full_name is null or length(full_name) <= 160),
  notify_legal_updates  boolean not null default true,
  marketing_consent     boolean not null default false,
  marketing_consent_at  timestamptz,
  acquisition           jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index profiles_created_at_idx on public.profiles (created_at desc);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.organizations (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.profiles (id) on delete cascade,
  business_type       text check (business_type is null or business_type ~ '^[a-z_]{2,40}$'),
  owner_type          public.owner_type,
  legal_name          text check (legal_name is null or length(legal_name) <= 200),
  trade_name          text check (trade_name is null or length(trade_name) <= 200),
  nif                 text check (nif is null or nif ~ '^[A-Z0-9]{8,10}$'),
  address_line        text check (address_line is null or length(address_line) <= 250),
  postal_code         text check (postal_code is null or postal_code ~ '^[0-9]{5}$'),
  city                text check (city is null or length(city) <= 120),
  province            text check (province is null or length(province) <= 120),
  country             text not null default 'ES' check (country ~ '^[A-Z]{2}$'),
  contact_email       text check (contact_email is null or length(contact_email) <= 254),
  phone               text check (phone is null or length(phone) <= 30),
  website_url         text check (website_url is null or length(website_url) <= 300),
  activity            text check (activity is null or length(activity) <= 500),
  stripe_customer_id  text unique,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index organizations_owner_idx on public.organizations (owner_id);
create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  role            text not null default 'owner' check (role in ('owner', 'member')),
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

create table public.user_roles (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        public.app_role not null,
  granted_at  timestamptz not null default now(),
  granted_by  uuid references public.profiles (id) on delete set null,
  primary key (user_id, role)
);

-- ---------------------------------------------------------------------------
-- Catálogo comercial (configurable desde administración)
-- ---------------------------------------------------------------------------
create table public.products (
  id                       uuid primary key default gen_random_uuid(),
  code                     text not null unique check (code ~ '^[a-z][a-z0-9_]{2,40}$'),
  name                     text not null,
  description              text,
  kind                     public.product_kind not null,
  price_cents              int not null check (price_cents >= 0),
  currency                 text not null default 'eur' check (currency ~ '^[a-z]{3}$'),
  billing_interval         text check (billing_interval in ('month', 'year')),
  stripe_price_id          text unique,
  included_document_types  text[] not null default '{}',
  generations_limit        int check (generations_limit is null or generations_limit > 0),
  includes_updates         boolean not null default false,
  features                 jsonb not null default '[]'::jsonb check (jsonb_typeof(features) = 'array'),
  active                   boolean not null default true,
  sort_order               int not null default 0,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint products_interval_matches_kind
    check ((kind = 'subscription') = (billing_interval is not null))
);
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Suscripciones, pagos y compras
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid references public.organizations (id) on delete set null,
  product_id              uuid references public.products (id),
  stripe_subscription_id  text not null unique,
  stripe_customer_id      text not null,
  stripe_price_id         text,
  status                  public.subscription_status not null,
  amount_cents            int,
  currency                text,
  billing_interval        text,
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  cancel_at_period_end    boolean not null default false,
  cancel_at               timestamptz,
  canceled_at             timestamptz,
  ended_at                timestamptz,
  trial_end               timestamptz,
  latest_invoice_id       text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index subscriptions_org_status_idx on public.subscriptions (organization_id, status);
create index subscriptions_customer_idx on public.subscriptions (stripe_customer_id);
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

create table public.payments (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid references public.organizations (id) on delete set null,
  product_id                  uuid references public.products (id),
  subscription_id             uuid references public.subscriptions (id) on delete set null,
  kind                        public.product_kind not null,
  status                      public.payment_status not null,
  amount_cents                int not null check (amount_cents >= 0),
  amount_refunded_cents       int not null default 0 check (amount_refunded_cents >= 0),
  currency                    text not null,
  stripe_checkout_session_id  text unique,
  stripe_payment_intent_id    text unique,
  stripe_invoice_id           text unique,
  stripe_charge_id            text,
  attempt_count               int,
  failure_reason              text,
  hosted_invoice_url          text,
  receipt_url                 text,
  paid_at                     timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create index payments_org_idx on public.payments (organization_id, created_at desc);
create index payments_status_idx on public.payments (status, created_at desc);
create index payments_charge_idx on public.payments (stripe_charge_id);
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

create table public.purchases (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid references public.organizations (id) on delete set null,
  product_id            uuid not null references public.products (id),
  payment_id            uuid unique references public.payments (id) on delete set null,
  status                public.purchase_status not null default 'active',
  document_types        text[] not null,
  -- Versiones de plantilla congeladas en el momento de la compra: {"aviso_legal": "<uuid>", ...}
  template_version_ids  jsonb not null default '{}'::jsonb,
  generations_limit     int check (generations_limit is null or generations_limit > 0),
  generations_used      int not null default 0 check (generations_used >= 0),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint purchases_generation_limit
    check (generations_limit is null or generations_used <= generations_limit)
);
create index purchases_org_idx on public.purchases (organization_id, status);
create trigger purchases_updated_at before update on public.purchases
  for each row execute function public.set_updated_at();

-- Registro de eventos de Stripe para idempotencia. No se guarda el payload
-- completo (contiene datos personales); solo lo necesario para trazabilidad.
create table public.stripe_events (
  id            text primary key,
  type          text not null,
  livemode      boolean not null default false,
  status        text not null default 'processing' check (status in ('processing', 'processed', 'failed')),
  attempts      int not null default 1,
  error         text,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz
);
create index stripe_events_status_idx on public.stripe_events (status, received_at desc);

-- ---------------------------------------------------------------------------
-- Plantillas y versionado
-- ---------------------------------------------------------------------------
create table public.templates (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  name                  text not null,
  document_type         text not null unique references public.document_types (code),
  description           text,
  published_version_id  uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create trigger templates_updated_at before update on public.templates
  for each row execute function public.set_updated_at();

create table public.template_versions (
  id                          uuid primary key default gen_random_uuid(),
  template_id                 uuid not null references public.templates (id) on delete cascade,
  version_number              int not null check (version_number > 0),
  version_label               text not null check (version_label ~ '^[0-9]+\.[0-9]+(\.[0-9]+)?(-[a-z0-9.]+)?$'),
  status                      public.template_status not null default 'draft',
  is_demo                     boolean not null default false,
  content                     jsonb not null check (jsonb_typeof(content) = 'object'),
  variables                   jsonb not null default '[]'::jsonb check (jsonb_typeof(variables) = 'array'),
  rules                       jsonb not null default '[]'::jsonb check (jsonb_typeof(rules) = 'array'),
  changelog                   text not null default '',
  questionnaire_version       int not null,
  legal_reviewer_name         text,
  legal_reviewer_credentials  text,
  legal_reviewed_at           timestamptz,
  review_reference            text,
  review_notes                text,
  reviewed_by                 uuid references public.profiles (id) on delete set null,
  published_at                timestamptz,
  published_by                uuid references public.profiles (id) on delete set null,
  created_by                  uuid references public.profiles (id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (template_id, version_number),
  -- Ninguna versión puede aprobarse/publicarse sin revisión profesional documentada,
  -- y las versiones de demostración nunca pueden llegar a producción.
  constraint template_versions_review_required check (
    status not in ('approved', 'published')
    or (
      is_demo = false
      and legal_reviewer_name is not null
      and legal_reviewed_at is not null
      and review_reference is not null
    )
  ),
  constraint template_versions_published_at check (status <> 'published' or published_at is not null)
);
create index template_versions_template_idx on public.template_versions (template_id, version_number desc);
create trigger template_versions_updated_at before update on public.template_versions
  for each row execute function public.set_updated_at();

alter table public.templates
  add constraint templates_published_version_fk
  foreign key (published_version_id) references public.template_versions (id) on delete restrict;

-- ---------------------------------------------------------------------------
-- Formularios, documentos y versiones generadas
-- ---------------------------------------------------------------------------
create table public.form_responses (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations (id) on delete cascade,
  created_by             uuid references public.profiles (id) on delete set null,
  questionnaire_version  int not null,
  answers                jsonb not null default '{}'::jsonb
                           check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) < 65536),
  status                 public.form_status not null default 'draft',
  current_step           text check (current_step is null or length(current_step) <= 40),
  completed_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index form_responses_org_idx on public.form_responses (organization_id, updated_at desc);
create trigger form_responses_updated_at before update on public.form_responses
  for each row execute function public.set_updated_at();

create table public.documents (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  document_type       text not null references public.document_types (code),
  title               text not null,
  current_version_id  uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (organization_id, document_type)
);
create trigger documents_updated_at before update on public.documents
  for each row execute function public.set_updated_at();

create table public.document_versions (
  id                   uuid primary key default gen_random_uuid(),
  document_id          uuid not null references public.documents (id) on delete cascade,
  organization_id      uuid not null references public.organizations (id) on delete cascade,
  version_number       int not null check (version_number > 0),
  template_version_id  uuid not null references public.template_versions (id),
  form_response_id     uuid references public.form_responses (id) on delete set null,
  answers_snapshot     jsonb not null,
  entitlement_source   text not null check (entitlement_source in ('subscription', 'purchase')),
  subscription_id      uuid references public.subscriptions (id) on delete set null,
  purchase_id          uuid references public.purchases (id) on delete set null,
  generation_key       text not null unique,
  is_demo              boolean not null default false,
  html_path            text not null,
  pdf_path             text not null,
  content_hash         text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  generated_by         uuid references public.profiles (id) on delete set null,
  generated_at         timestamptz not null default now(),
  revoked_at           timestamptz,
  revoked_reason       text,
  unique (document_id, version_number)
);
create index document_versions_org_idx on public.document_versions (organization_id, generated_at desc);
create index document_versions_purchase_idx on public.document_versions (purchase_id);

alter table public.documents
  add constraint documents_current_version_fk
  foreign key (current_version_id) references public.document_versions (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Contenido editorial: actualizaciones legales, avisos y FAQ
-- ---------------------------------------------------------------------------
create table public.legal_updates (
  id                    uuid primary key default gen_random_uuid(),
  title                 text not null check (length(title) between 4 and 200),
  summary               text not null check (length(summary) between 10 and 1000),
  body                  text not null default '',
  document_types        text[] not null default '{}',
  template_version_ids  uuid[] not null default '{}',
  status                public.legal_update_status not null default 'draft',
  review_reference      text,
  reviewed_by_name      text,
  published_at          timestamptz,
  notified_at           timestamptz,
  created_by            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- No se publican actualizaciones sin revisión documentada.
  constraint legal_updates_review_required check (
    status <> 'published'
    or (review_reference is not null and reviewed_by_name is not null and published_at is not null)
  )
);
create index legal_updates_published_idx on public.legal_updates (status, published_at desc);
create trigger legal_updates_updated_at before update on public.legal_updates
  for each row execute function public.set_updated_at();

create table public.notices (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(title) between 2 and 160),
  body        text not null check (length(body) <= 2000),
  level       public.notice_level not null default 'info',
  active      boolean not null default true,
  starts_at   timestamptz,
  ends_at     timestamptz,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger notices_updated_at before update on public.notices
  for each row execute function public.set_updated_at();

create table public.faqs (
  id          uuid primary key default gen_random_uuid(),
  question    text not null check (length(question) between 5 and 300),
  answer      text not null check (length(answer) between 5 and 4000),
  category    text not null default 'general',
  sort_order  int not null default 0,
  published   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger faqs_updated_at before update on public.faqs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Comunicaciones, soporte, auditoría y observabilidad
-- ---------------------------------------------------------------------------
create table public.email_events (
  id                   uuid primary key default gen_random_uuid(),
  idempotency_key      text not null unique,
  template             text not null,
  to_email             text not null,
  user_id              uuid references public.profiles (id) on delete set null,
  organization_id      uuid references public.organizations (id) on delete set null,
  status               public.email_status not null default 'queued',
  provider_message_id  text,
  error                text,
  created_at           timestamptz not null default now(),
  sent_at              timestamptz
);
create index email_events_created_idx on public.email_events (created_at desc);

create table public.support_requests (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references public.profiles (id) on delete set null,
  organization_id  uuid references public.organizations (id) on delete set null,
  name             text not null check (length(name) between 2 and 120),
  email            text not null check (length(email) <= 254),
  subject          text not null check (length(subject) between 3 and 160),
  message          text not null check (length(message) between 10 and 5000),
  category         text not null default 'general',
  status           public.support_status not null default 'open',
  admin_notes      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index support_requests_status_idx on public.support_requests (status, created_at desc);
create index support_requests_user_idx on public.support_requests (user_id);
create trigger support_requests_updated_at before update on public.support_requests
  for each row execute function public.set_updated_at();

create table public.audit_logs (
  id               bigint generated always as identity primary key,
  actor_id         uuid references public.profiles (id) on delete set null,
  actor_type       text not null default 'user' check (actor_type in ('user', 'admin', 'system', 'stripe')),
  action           text not null,
  entity_type      text,
  entity_id        text,
  organization_id  uuid,
  metadata         jsonb not null default '{}'::jsonb,
  ip_hash          text,
  created_at       timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

create table public.app_errors (
  id          bigint generated always as identity primary key,
  source      text not null,
  message     text not null,
  context     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index app_errors_created_idx on public.app_errors (created_at desc);

-- Analítica de primera parte, sin cookies ni identificadores de dispositivo.
create table public.analytics_events (
  id             bigint generated always as identity primary key,
  name           text not null check (name ~ '^[a-z][a-z_]{1,40}$'),
  path           text check (path is null or length(path) <= 300),
  referrer_host  text check (referrer_host is null or length(referrer_host) <= 255),
  utm_source     text check (utm_source is null or length(utm_source) <= 100),
  utm_medium     text check (utm_medium is null or length(utm_medium) <= 100),
  utm_campaign   text check (utm_campaign is null or length(utm_campaign) <= 100),
  user_id        uuid references public.profiles (id) on delete set null,
  props          jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index analytics_events_name_idx on public.analytics_events (name, created_at desc);

create table public.rate_limits (
  key           text not null,
  window_start  timestamptz not null,
  count         int not null default 0,
  primary key (key, window_start)
);
