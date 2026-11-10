-- =============================================================================
-- AnunciaPro · 0001 · Esquema principal
-- Tablas, restricciones, índices y triggers de integridad.
-- Todas las fechas son timestamptz (UTC). Todos los identificadores son UUID.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Perfiles (1:1 con auth.users; las contraseñas viven solo en Supabase Auth)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  email text not null check (char_length(email) <= 320),
  avatar_url text check (char_length(avatar_url) <= 500),
  onboarding_completed_at timestamptz,
  -- Campos gestionados exclusivamente por administración (service_role).
  disabled_at timestamptz,
  disabled_reason text check (char_length(disabled_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (lower(email));
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Administradores de plataforma. Solo se gestiona con service_role / SQL.
create table public.platform_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  granted_by uuid references public.profiles (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Espacios de trabajo y membresías
-- ---------------------------------------------------------------------------
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workspaces_owner_idx on public.workspaces (owner_id);
create trigger workspaces_set_updated_at before update on public.workspaces
  for each row execute function public.set_updated_at();

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'admin', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

-- ---------------------------------------------------------------------------
-- Categorías y atributos dinámicos
-- workspace_id NULL = categoría del sistema; con valor = categoría personalizada.
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  parent_id uuid references public.categories (id) on delete cascade,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);
create unique index categories_system_slug_key on public.categories (slug) where workspace_id is null;
create unique index categories_workspace_slug_key on public.categories (workspace_id, slug) where workspace_id is not null;
create index categories_parent_idx on public.categories (parent_id);

create table public.category_attributes (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete cascade,
  -- Clave estable usada dentro de products.attributes (JSONB).
  attribute_key text not null check (attribute_key ~ '^[a-z][a-z0-9_]*$' and char_length(attribute_key) <= 60),
  attribute_name text not null check (char_length(attribute_name) between 1 and 80),
  attribute_type text not null default 'text' check (attribute_type in ('text', 'number', 'select', 'boolean')),
  is_required boolean not null default false,
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  unit text check (char_length(unit) <= 20),
  -- Si el valor debe aparecer en el título comercial generado.
  show_in_title boolean not null default false,
  display_order integer not null default 0,
  unique (category_id, attribute_key)
);
create index category_attributes_category_idx on public.category_attributes (category_id, display_order);

-- ---------------------------------------------------------------------------
-- Planes y suscripciones
-- ---------------------------------------------------------------------------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  price numeric(10, 2) not null default 0 check (price >= 0),
  currency char(3) not null default 'EUR',
  monthly_listing_limit integer not null check (monthly_listing_limit >= 0),
  monthly_bulk_limit integer not null default 0 check (monthly_bulk_limit >= 0),
  features jsonb not null default '{}'::jsonb check (jsonb_typeof(features) = 'object'),
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger plans_set_updated_at before update on public.plans
  for each row execute function public.set_updated_at();

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces (id) on delete cascade,
  plan_id uuid not null references public.plans (id) on delete restrict,
  status text not null default 'active'
    check (status in ('active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused')),
  provider text not null default 'none' check (provider in ('none', 'manual', 'stripe')),
  provider_customer_id text,
  provider_subscription_id text unique,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (current_period_end is null or current_period_start is null or current_period_end > current_period_start)
);
create index subscriptions_customer_idx on public.subscriptions (provider_customer_id);
create trigger subscriptions_set_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- Idempotencia de webhooks de Stripe: cada evento se procesa una sola vez.
create table public.stripe_events (
  id text primary key,
  type text not null,
  status text not null default 'processing' check (status in ('processing', 'processed', 'failed')),
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  name text not null check (char_length(name) between 1 and 200),
  description text not null default '' check (char_length(description) <= 10000),
  category_id uuid references public.categories (id) on delete set null,
  brand text check (char_length(brand) <= 120),
  model text check (char_length(model) <= 120),
  price numeric(12, 2) check (price is null or (price >= 0 and price <= 9999999999.99)),
  currency char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  cost_price numeric(12, 2) check (cost_price is null or (cost_price >= 0 and cost_price <= 9999999999.99)),
  condition text not null default 'good'
    check (condition in ('new', 'like_new', 'very_good', 'good', 'acceptable', 'refurbished', 'for_parts', 'custom')),
  condition_custom text check (char_length(condition_custom) <= 120),
  sku text check (sku is null or char_length(sku) between 1 and 80),
  location text check (char_length(location) <= 160),
  features jsonb not null default '[]'::jsonb check (jsonb_typeof(features) = 'array'),
  defects text not null default '' check (char_length(defects) <= 3000),
  attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  -- Permite claves foráneas compuestas que garantizan que los recursos hijos
  -- pertenecen al mismo workspace que el producto.
  unique (id, workspace_id),
  check (condition <> 'custom' or coalesce(char_length(condition_custom), 0) > 0)
);
create unique index products_workspace_sku_key on public.products (workspace_id, sku) where sku is not null;
create index products_workspace_created_idx on public.products (workspace_id, created_at desc);
create index products_workspace_updated_idx on public.products (workspace_id, updated_at desc);
create index products_workspace_category_idx on public.products (workspace_id, category_id);
create index products_workspace_archived_idx on public.products (workspace_id, archived_at);
create index products_name_trgm_idx on public.products using gin (name extensions.gin_trgm_ops);
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) <= 400),
  filename text not null check (char_length(filename) <= 255),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size integer not null check (size > 0 and size <= 5242880),
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (product_id, workspace_id) references public.products (id, workspace_id) on delete cascade
);
create index product_images_product_idx on public.product_images (product_id, display_order);
create index product_images_workspace_idx on public.product_images (workspace_id);

-- ---------------------------------------------------------------------------
-- Plantillas personalizadas (los perfiles base de marketplace viven en código)
-- ---------------------------------------------------------------------------
create table public.templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  platform text not null default 'generic' check (platform ~ '^[a-z][a-z0-9_]*$' and char_length(platform) <= 40),
  category_id uuid references public.categories (id) on delete set null,
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);
create index templates_workspace_idx on public.templates (workspace_id, created_at desc);
create trigger templates_set_updated_at before update on public.templates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Anuncios y versiones
-- ---------------------------------------------------------------------------
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  product_id uuid not null,
  created_by uuid references public.profiles (id) on delete set null,
  title text not null check (char_length(title) between 1 and 300),
  description text not null default '' check (char_length(description) <= 20000),
  short_description text not null default '' check (char_length(short_description) <= 600),
  highlights jsonb not null default '[]'::jsonb check (jsonb_typeof(highlights) = 'array'),
  selling_points jsonb not null default '[]'::jsonb check (jsonb_typeof(selling_points) = 'array'),
  keywords jsonb not null default '[]'::jsonb check (jsonb_typeof(keywords) = 'array'),
  condition_info text not null default '' check (char_length(condition_info) <= 2000),
  cta text not null default '' check (char_length(cta) <= 300),
  platform text not null default 'generic' check (platform ~ '^[a-z][a-z0-9_]*$' and char_length(platform) <= 40),
  template_id uuid references public.templates (id) on delete set null,
  tone text not null default 'professional' check (tone in ('professional', 'friendly', 'persuasive', 'minimal')),
  status text not null default 'draft' check (status in ('draft', 'ready', 'archived')),
  language text not null default 'es' check (language in ('es', 'en')),
  generation_method text not null default 'template' check (generation_method in ('template', 'ai', 'manual')),
  current_version integer not null default 1 check (current_version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (product_id, workspace_id) references public.products (id, workspace_id) on delete cascade
);
create index listings_workspace_created_idx on public.listings (workspace_id, created_at desc);
create index listings_workspace_status_idx on public.listings (workspace_id, status);
create index listings_workspace_platform_idx on public.listings (workspace_id, platform);
create index listings_product_idx on public.listings (product_id);
create index listings_title_trgm_idx on public.listings using gin (title extensions.gin_trgm_ops);

create table public.listing_versions (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  version_number integer not null check (version_number >= 1),
  title text not null,
  description text not null default '',
  short_description text not null default '',
  -- Resto del contenido versionado: highlights, selling_points, keywords, etc.
  content jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object'),
  platform text not null default 'generic',
  generation_method text not null default 'template' check (generation_method in ('template', 'ai', 'manual')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (listing_id, version_number),
  foreign key (listing_id, workspace_id) references public.listings (id, workspace_id) on delete cascade
);
create index listing_versions_listing_idx on public.listing_versions (listing_id, version_number desc);

-- Versionado automático: cada cambio de contenido crea una versión inmutable.
create or replace function public.listings_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.current_version := 1;
    return new;
  end if;

  -- El producto y el workspace de un anuncio no pueden cambiar.
  new.workspace_id := old.workspace_id;
  new.product_id := old.product_id;
  new.created_at := old.created_at;
  new.updated_at := now();

  if (new.title, new.description, new.short_description, new.highlights, new.selling_points,
      new.keywords, new.condition_info, new.cta, new.platform)
     is distinct from
     (old.title, old.description, old.short_description, old.highlights, old.selling_points,
      old.keywords, old.condition_info, old.cta, old.platform) then
    new.current_version := old.current_version + 1;
  else
    new.current_version := old.current_version;
  end if;
  return new;
end;
$$;

create or replace function public.listings_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.current_version <> old.current_version then
    insert into public.listing_versions (
      listing_id, workspace_id, version_number, title, description, short_description,
      content, platform, generation_method, created_by
    ) values (
      new.id, new.workspace_id, new.current_version, new.title, new.description, new.short_description,
      jsonb_build_object(
        'highlights', new.highlights,
        'selling_points', new.selling_points,
        'keywords', new.keywords,
        'condition_info', new.condition_info,
        'cta', new.cta,
        'tone', new.tone,
        'language', new.language
      ),
      new.platform, new.generation_method, (select auth.uid())
    );
  end if;
  return new;
end;
$$;

create trigger listings_before_write before insert or update on public.listings
  for each row execute function public.listings_before_write();
create trigger listings_after_write after insert or update on public.listings
  for each row execute function public.listings_after_write();

-- ---------------------------------------------------------------------------
-- Favoritos
-- ---------------------------------------------------------------------------
create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, listing_id)
);
create index favorites_listing_idx on public.favorites (listing_id);

-- ---------------------------------------------------------------------------
-- Generación masiva
-- ---------------------------------------------------------------------------
create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'partially_completed', 'failed')),
  source_filename text check (char_length(source_filename) <= 255),
  source_path text check (char_length(source_path) <= 400),
  options jsonb not null default '{}'::jsonb check (jsonb_typeof(options) = 'object'),
  total_items integer not null default 0 check (total_items >= 0),
  processed_items integer not null default 0 check (processed_items >= 0),
  successful_items integer not null default 0 check (successful_items >= 0),
  failed_items integer not null default 0 check (failed_items >= 0),
  -- Número de reintentos manuales lanzados sobre los elementos fallidos.
  retry_count integer not null default 0 check (retry_count >= 0),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  check (processed_items <= total_items),
  check (successful_items + failed_items = processed_items)
);
create index generation_jobs_workspace_idx on public.generation_jobs (workspace_id, created_at desc);
create index generation_jobs_active_idx on public.generation_jobs (status, created_at)
  where status in ('pending', 'processing');
create trigger generation_jobs_set_updated_at before update on public.generation_jobs
  for each row execute function public.set_updated_at();

create table public.generation_job_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  row_number integer not null check (row_number >= 1),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  -- Fila validada del CSV ya convertida a los campos del producto.
  input jsonb not null default '{}'::jsonb check (jsonb_typeof(input) = 'object'),
  product_id uuid references public.products (id) on delete set null,
  listing_id uuid references public.listings (id) on delete set null,
  error_message text check (char_length(error_message) <= 1000),
  -- true si el fallo es atribuible al sistema (no consume cuota).
  system_error boolean not null default false,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, row_number),
  foreign key (job_id, workspace_id) references public.generation_jobs (id, workspace_id) on delete cascade
);
create index generation_job_items_job_status_idx on public.generation_job_items (job_id, status, row_number);
create trigger generation_job_items_set_updated_at before update on public.generation_job_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Consumo
-- ---------------------------------------------------------------------------
create table public.usage_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  operation_type text not null
    check (operation_type in ('generation', 'refinement', 'bulk_generation', 'refund')),
  -- Positivo = consumo. Negativo = devolución por error interno del sistema.
  quantity integer not null check (quantity <> 0),
  status text not null default 'counted' check (status in ('counted', 'refunded')),
  -- Evita contabilizar dos veces la misma operación ante reintentos técnicos.
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  -- Solo en devoluciones: tipo de operación original que se devuelve.
  refund_of text check (refund_of in ('generation', 'refinement', 'bulk_generation')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key),
  check ((operation_type = 'refund') = (quantity < 0)),
  check ((operation_type = 'refund') = (refund_of is not null))
);
create index usage_records_workspace_created_idx on public.usage_records (workspace_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Auditoría
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete set null,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (char_length(action) between 1 and 80),
  resource_type text not null check (char_length(resource_type) between 1 and 60),
  resource_id text check (char_length(resource_id) <= 120),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index audit_logs_workspace_created_idx on public.audit_logs (workspace_id, created_at desc);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Limitación de peticiones (ventana fija, compartida entre instancias)
-- ---------------------------------------------------------------------------
create table public.rate_limit_buckets (
  key text not null check (char_length(key) <= 200),
  window_start timestamptz not null,
  count integer not null default 1,
  primary key (key, window_start)
);
create index rate_limit_buckets_window_idx on public.rate_limit_buckets (window_start);
