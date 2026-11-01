-- =============================================================================
-- Legalito · Funciones, disparadores y reglas de negocio en base de datos
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers de autorización (SECURITY DEFINER para evitar recursión de RLS)
-- ---------------------------------------------------------------------------
create or replace function public.has_role(p_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = p_role
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('admin'::public.app_role);
$$;

create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_org is not null and exists (
    select 1 from public.organization_members
    where organization_id = p_org and user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Alta de usuario: perfil + organización + membresía
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_acq jsonb := '{}'::jsonb;
begin
  -- Solo se aceptan claves de captación conocidas y acotadas en longitud.
  if jsonb_typeof(v_meta -> 'acquisition') = 'object' then
    select coalesce(jsonb_object_agg(key, left(value #>> '{}', 100)), '{}'::jsonb)
      into v_acq
      from jsonb_each(v_meta -> 'acquisition')
     where key in ('utm_source', 'utm_medium', 'utm_campaign', 'ref', 'landing');
  end if;

  insert into public.profiles (id, email, full_name, marketing_consent, marketing_consent_at, acquisition)
  values (
    new.id,
    new.email,
    nullif(left(v_meta ->> 'full_name', 160), ''),
    coalesce((v_meta ->> 'marketing_consent')::boolean, false),
    case when coalesce((v_meta ->> 'marketing_consent')::boolean, false) then now() end,
    v_acq
  );

  insert into public.organizations (owner_id, contact_email)
  values (new.id, new.email)
  returning id into v_org_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org_id, new.id, 'owner');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Plantillas: inmutabilidad y transiciones de estado
-- ---------------------------------------------------------------------------
create or replace function public.template_versions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  allowed boolean;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'Las versiones de plantilla se crean siempre en borrador';
    end if;
    if new.version_number is null then
      select coalesce(max(version_number), 0) + 1 into new.version_number
        from public.template_versions where template_id = new.template_id;
    end if;
    new.created_by := coalesce(new.created_by, auth.uid());
    return new;
  end if;

  -- UPDATE
  if new.template_id <> old.template_id or new.version_number <> old.version_number then
    raise exception 'No se puede cambiar la identidad de una versión de plantilla';
  end if;

  -- El contenido solo puede editarse mientras la versión es un borrador.
  if old.status <> 'draft' and (
       new.content is distinct from old.content
    or new.variables is distinct from old.variables
    or new.rules is distinct from old.rules
    or new.is_demo is distinct from old.is_demo
    or new.questionnaire_version is distinct from old.questionnaire_version
    or new.version_label is distinct from old.version_label
  ) then
    raise exception 'El contenido de una versión enviada a revisión es inmutable; crea una nueva versión';
  end if;

  if new.status <> old.status then
    allowed := (old.status, new.status) in (
      ('draft'::public.template_status, 'in_review'::public.template_status),
      ('in_review', 'draft'),
      ('in_review', 'approved'),
      ('approved', 'published'),
      ('approved', 'retired'),
      ('published', 'retired'),
      ('draft', 'retired')
    );
    if not allowed then
      raise exception 'Transición de estado no permitida: % -> %', old.status, new.status;
    end if;
  end if;

  -- Los datos de revisión no se pueden alterar después de aprobar.
  if old.status in ('approved', 'published', 'retired') and (
       new.legal_reviewer_name is distinct from old.legal_reviewer_name
    or new.legal_reviewed_at is distinct from old.legal_reviewed_at
    or new.review_reference is distinct from old.review_reference
  ) then
    raise exception 'Los datos de revisión jurídica son inmutables tras la aprobación';
  end if;

  return new;
end;
$$;

create trigger template_versions_guard_ins
  before insert on public.template_versions
  for each row execute function public.template_versions_guard();
create trigger template_versions_guard_upd
  before update on public.template_versions
  for each row execute function public.template_versions_guard();

create or replace function public.templates_published_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.published_version_id is not null and not exists (
    select 1 from public.template_versions v
     where v.id = new.published_version_id
       and v.template_id = new.id
       and v.status = 'published'
  ) then
    raise exception 'La versión publicada debe pertenecer a la plantilla y estar en estado publicado';
  end if;
  return new;
end;
$$;

create trigger templates_published_guard
  before insert or update of published_version_id on public.templates
  for each row execute function public.templates_published_guard();

-- Flujo editorial: enviar a revisión, aprobar y publicar.
create or replace function public.submit_template_version(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  update public.template_versions set status = 'in_review'
   where id = p_version_id and status = 'draft';
  if not found then
    raise exception 'La versión no existe o no está en borrador';
  end if;
  insert into public.audit_logs (actor_id, actor_type, action, entity_type, entity_id)
  values (auth.uid(), 'admin', 'template_version.submitted', 'template_version', p_version_id::text);
end;
$$;

create or replace function public.approve_template_version(
  p_version_id uuid,
  p_reviewer_name text,
  p_reviewer_credentials text,
  p_reviewed_at timestamptz,
  p_review_reference text,
  p_review_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.is_admin() or public.has_role('legal_reviewer')) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if coalesce(length(trim(p_reviewer_name)), 0) < 3
     or coalesce(length(trim(p_review_reference)), 0) < 3
     or p_reviewed_at is null
     or p_reviewed_at > now() then
    raise exception 'Faltan datos de la revisión jurídica (revisor, fecha y referencia documental)';
  end if;
  update public.template_versions
     set status = 'approved',
         legal_reviewer_name = trim(p_reviewer_name),
         legal_reviewer_credentials = nullif(trim(p_reviewer_credentials), ''),
         legal_reviewed_at = p_reviewed_at,
         review_reference = trim(p_review_reference),
         review_notes = nullif(trim(p_review_notes), ''),
         reviewed_by = auth.uid()
   where id = p_version_id and status = 'in_review';
  if not found then
    raise exception 'La versión no existe o no está en revisión';
  end if;
  insert into public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'admin', 'template_version.approved', 'template_version', p_version_id::text,
          jsonb_build_object('reviewer', trim(p_reviewer_name), 'reference', trim(p_review_reference)));
end;
$$;

create or replace function public.publish_template_version(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template_id uuid;
  v_previous uuid;
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select template_id into v_template_id
    from public.template_versions where id = p_version_id and status = 'approved'
    for update;
  if v_template_id is null then
    raise exception 'Solo se pueden publicar versiones aprobadas';
  end if;

  select published_version_id into v_previous from public.templates where id = v_template_id for update;

  update public.template_versions
     set status = 'published', published_at = now(), published_by = auth.uid()
   where id = p_version_id;
  update public.templates set published_version_id = p_version_id where id = v_template_id;
  if v_previous is not null and v_previous <> p_version_id then
    update public.template_versions set status = 'retired' where id = v_previous;
  end if;

  insert into public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'admin', 'template_version.published', 'template_version', p_version_id::text,
          jsonb_build_object('previous_version_id', v_previous));
end;
$$;

-- ---------------------------------------------------------------------------
-- Generación de documentos (solo service_role)
-- ---------------------------------------------------------------------------

-- Consume una generación de una compra de pago único de forma atómica.
create or replace function public.consume_purchase_generation(p_purchase_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.purchases
     set generations_used = generations_used + 1
   where id = p_purchase_id
     and status = 'active'
     and (generations_limit is null or generations_used < generations_limit);
  return found;
end;
$$;

-- Devuelve una generación consumida si la generación posterior falla.
create or replace function public.release_purchase_generation(p_purchase_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.purchases
     set generations_used = greatest(generations_used - 1, 0)
   where id = p_purchase_id;
$$;

-- Registra una versión de documento de forma atómica y la marca como actual.
create or replace function public.record_document_version(
  p_version_id uuid,
  p_organization_id uuid,
  p_document_type text,
  p_title text,
  p_template_version_id uuid,
  p_form_response_id uuid,
  p_answers_snapshot jsonb,
  p_entitlement_source text,
  p_subscription_id uuid,
  p_purchase_id uuid,
  p_generation_key text,
  p_is_demo boolean,
  p_html_path text,
  p_pdf_path text,
  p_content_hash text,
  p_generated_by uuid
)
returns table (document_id uuid, version_number int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document_id uuid;
  v_number int;
begin
  insert into public.documents (organization_id, document_type, title)
  values (p_organization_id, p_document_type, p_title)
  on conflict (organization_id, document_type) do update set title = excluded.title
  returning id into v_document_id;

  -- Bloqueo de la fila del documento para numerar versiones sin carreras.
  perform 1 from public.documents where id = v_document_id for update;
  select coalesce(max(dv.version_number), 0) + 1 into v_number
    from public.document_versions dv where dv.document_id = v_document_id;

  insert into public.document_versions (
    id, document_id, organization_id, version_number, template_version_id, form_response_id,
    answers_snapshot, entitlement_source, subscription_id, purchase_id, generation_key,
    is_demo, html_path, pdf_path, content_hash, generated_by
  ) values (
    p_version_id, v_document_id, p_organization_id, v_number, p_template_version_id, p_form_response_id,
    p_answers_snapshot, p_entitlement_source, p_subscription_id, p_purchase_id, p_generation_key,
    p_is_demo, p_html_path, p_pdf_path, p_content_hash, p_generated_by
  );

  update public.documents set current_version_id = p_version_id where id = v_document_id;

  insert into public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, organization_id, metadata)
  values (p_generated_by, case when p_generated_by is null then 'system' else 'user' end,
          'document.generated', 'document_version', p_version_id::text, p_organization_id,
          jsonb_build_object('document_type', p_document_type, 'version', v_number,
                             'template_version_id', p_template_version_id, 'source', p_entitlement_source));

  return query select v_document_id, v_number;
end;
$$;

-- ---------------------------------------------------------------------------
-- Limitación de frecuencia (ventana fija)
-- ---------------------------------------------------------------------------
create or replace function public.check_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count int;
begin
  insert into public.rate_limits (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = public.rate_limits.count + 1
  returning count into v_count;

  -- Limpieza oportunista de ventanas antiguas.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_count <= p_max;
end;
$$;

-- ---------------------------------------------------------------------------
-- Métricas de negocio para administración (datos reales, sin estimaciones)
-- ---------------------------------------------------------------------------
create or replace function public.admin_metrics(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(p_days, 1));
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  with
  active_subs as (
    select s.*, coalesce(s.billing_interval, p.billing_interval) as interval_
      from public.subscriptions s left join public.products p on p.id = s.product_id
     where s.status in ('active', 'trialing', 'past_due')
  ),
  paid as (
    select * from public.payments where status in ('succeeded', 'partially_refunded', 'refunded')
  )
  select jsonb_build_object(
    'period_days', p_days,
    'total_users', (select count(*) from public.profiles),
    'new_users', (select count(*) from public.profiles where created_at >= v_since),
    'page_views', (select count(*) from public.analytics_events where name = 'page_view' and created_at >= v_since),
    'pricing_views', (select count(*) from public.analytics_events where name = 'pricing_view' and created_at >= v_since),
    'forms_started', (select count(*) from public.form_responses where created_at >= v_since),
    'forms_completed', (select count(*) from public.form_responses where status = 'completed' and completed_at >= v_since),
    'checkouts_started', (select count(*) from public.analytics_events where name = 'checkout_started' and created_at >= v_since),
    'one_time_purchases', (select count(*) from paid where kind = 'one_time' and paid_at >= v_since),
    'new_subscriptions', (select count(*) from public.subscriptions where created_at >= v_since and status not in ('incomplete', 'incomplete_expired')),
    'active_subscriptions', (select count(*) from active_subs),
    'past_due_subscriptions', (select count(*) from active_subs where status = 'past_due'),
    'mrr_cents', (select coalesce(sum(case when interval_ = 'year' then round(coalesce(amount_cents, 0) / 12.0)
                                           else coalesce(amount_cents, 0) end), 0)::bigint
                    from active_subs),
    'scheduled_cancellations', (select count(*) from active_subs where cancel_at_period_end),
    'cancellations', (select count(*) from public.subscriptions where canceled_at >= v_since),
    'revenue_cents', (select coalesce(sum(amount_cents - amount_refunded_cents), 0) from paid where paid_at >= v_since),
    'refunds_cents', (select coalesce(sum(amount_refunded_cents), 0) from paid where updated_at >= v_since),
    'paying_customers', (select count(distinct organization_id) from paid where organization_id is not null),
    'failed_payments', (select count(*) from public.payments where status = 'failed' and created_at >= v_since),
    'errors', (select count(*) from public.app_errors where created_at >= v_since),
    'documents_generated', (select count(*) from public.document_versions where generated_at >= v_since),
    'retention_30d', (
      select case when count(*) = 0 then null
             else round(100.0 * count(*) filter (where status in ('active', 'trialing', 'past_due')) / count(*), 1) end
        from public.subscriptions
       where created_at <= now() - interval '30 days' and status not in ('incomplete', 'incomplete_expired')
    )
  ) into v_result;

  return v_result;
end;
$$;
