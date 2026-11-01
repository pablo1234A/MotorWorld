-- =============================================================================
-- Legalito · Plan Agencia (49 €/mes)
-- -----------------------------------------------------------------------------
-- La gestión de clientes (modo agencia) pasa a ser exclusiva de los planes con
-- allows_clients = true. Básico, Medium y Business cubren la web propia.
-- La regla se aplica también en record_document_version.
-- =============================================================================

alter table public.products
  add column if not exists allows_clients boolean not null default false;

comment on column public.products.allows_clients is
  'Suscripciones: permite generar documentos de clientes (cuentas hijas) de una agencia o gestoría.';

-- La administración lo edita con su sesión (RLS: solo is_admin()).
grant update (allows_clients) on public.products to authenticated;

insert into public.products (code, name, description, kind, price_cents, currency, billing_interval,
  included_document_types, generations_limit, includes_updates, documents_per_period, allows_clients, features, sort_order)
values
  ('subscription_agency', 'Agencia', 'Para agencias web, gestorías y consultores que gestionan las webs de sus clientes.',
   'subscription', 4900, 'eur', 'month', array['aviso_legal', 'privacidad', 'cookies'], null, true, null, true,
   '["Clientes ilimitados", "Documentos ilimitados", "Un formulario y unos documentos por cliente", "Banner de cookies para cada cliente", "Documentos y banner sin la marca Legalito", "Nuevas versiones revisadas de las plantillas", "Cancela cuando quieras"]'::jsonb,
   5)
on conflict (code) do nothing;

-- Registro de versiones: además del cupo, exige un plan con clientes para las cuentas hijas.
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
  v_billing_org uuid;
  v_sub_org uuid;
  v_period_start timestamptz;
  v_limit int;
  v_used int;
  v_allows_clients boolean;
begin
  -- Cuenta que paga: la agencia para sus clientes, la propia cuenta en el resto de casos.
  select coalesce(o.parent_organization_id, o.id) into v_billing_org
    from public.organizations o where o.id = p_organization_id;
  if v_billing_org is null then
    raise exception 'Organización no encontrada';
  end if;

  if p_entitlement_source = 'subscription' then
    -- Bloqueo de la suscripción: las generaciones simultáneas se serializan y
    -- el cupo del periodo nunca se supera, aunque lleguen a la vez.
    select s.organization_id, s.current_period_start, p.documents_per_period, coalesce(p.allows_clients, false)
      into v_sub_org, v_period_start, v_limit, v_allows_clients
      from public.subscriptions s
      left join public.products p on p.id = s.product_id
     where s.id = p_subscription_id
       and s.status in ('active', 'trialing')
       for update of s;
    if not found or v_sub_org is distinct from v_billing_org then
      raise exception 'La suscripción no corresponde a esta cuenta' using errcode = '42501';
    end if;
    -- Los documentos de clientes de una agencia exigen un plan con gestión de clientes.
    if v_billing_org <> p_organization_id and not v_allows_clients then
      raise exception 'plan_without_clients' using errcode = 'P0001', hint = 'not_entitled';
    end if;
    if v_limit is not null then
      select count(*) into v_used
        from public.document_versions dv
       where dv.subscription_id = p_subscription_id
         and dv.generated_at >= coalesce(v_period_start, now() - interval '30 days');
      if v_used >= v_limit then
        raise exception 'quota_exceeded' using errcode = 'P0001', hint = 'limit_reached';
      end if;
    end if;
  elsif p_entitlement_source = 'purchase' then
    -- Las compras de pago único solo se usan en la cuenta que las pagó.
    if not exists (select 1 from public.purchases pu where pu.id = p_purchase_id and pu.organization_id = p_organization_id) then
      raise exception 'La compra no corresponde a esta cuenta' using errcode = '42501';
    end if;
  end if;

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

-- Preguntas frecuentes (bases de datos ya sembradas; las nuevas usan supabase/seed/base.sql).
update public.faqs
   set answer = 'Sí, con el plan Agencia (49 €/mes): clientes y documentos ilimitados, un formulario y unos documentos por cliente, y banner de cookies para cada web. Los documentos no llevan la marca de Legalito.'
 where question = '¿Puedo gestionar las webs de mis clientes?';
