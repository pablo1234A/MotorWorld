-- =============================================================================
-- Legalito · Modo agencia / gestoría
-- -----------------------------------------------------------------------------
-- Una cuenta de tipo «agency» gestiona los textos legales de varios clientes.
-- Cada cliente es una organización hija (parent_organization_id) con sus
-- propios datos, formulario y documentos. La facturación (cliente de Stripe,
-- suscripción y cupo de documentos) vive siempre en la cuenta principal.
--
-- Además, el cupo de documentos de las suscripciones pasa a comprobarse dentro
-- de record_document_version con bloqueo de fila (antes solo en la aplicación).
-- =============================================================================

alter table public.organizations
  add column account_type text not null default 'business' check (account_type in ('business', 'agency')),
  add column parent_organization_id uuid references public.organizations (id) on delete cascade,
  add column client_name text check (client_name is null or length(btrim(client_name)) between 1 and 120),
  add column client_notes text check (client_notes is null or length(client_notes) <= 500),
  add column archived_at timestamptz,
  add constraint organizations_client_shape check (
    parent_organization_id is null
    or (parent_organization_id <> id and account_type = 'business' and client_name is not null and stripe_customer_id is null)
  ),
  add constraint organizations_root_not_archived check (parent_organization_id is not null or archived_at is null);

create index organizations_parent_idx on public.organizations (parent_organization_id, archived_at)
  where parent_organization_id is not null;

comment on column public.organizations.account_type is 'business: un negocio. agency: agencia o gestoría que gestiona clientes.';
comment on column public.organizations.parent_organization_id is 'Clientes de una agencia: cuenta principal que los gestiona y paga.';

-- Reglas de jerarquía que no dependen de la aplicación.
create or replace function public.organizations_hierarchy_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent public.organizations%rowtype;
begin
  if tg_op = 'UPDATE' and new.parent_organization_id is distinct from old.parent_organization_id then
    raise exception 'No se puede cambiar la cuenta principal de un cliente';
  end if;
  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    raise exception 'No se puede cambiar el titular de una cuenta';
  end if;
  if new.parent_organization_id is not null then
    if tg_op = 'INSERT' then
      select * into v_parent from public.organizations where id = new.parent_organization_id;
      if not found or v_parent.account_type <> 'agency' or v_parent.parent_organization_id is not null then
        raise exception 'Solo una cuenta principal de tipo agencia puede tener clientes';
      end if;
      if v_parent.owner_id <> new.owner_id then
        raise exception 'El cliente debe pertenecer al titular de la agencia';
      end if;
    end if;
    if new.account_type <> 'business' then
      raise exception 'Un cliente no puede ser a su vez una agencia';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.account_type = 'agency' and new.account_type <> 'agency'
     and exists (select 1 from public.organizations c where c.parent_organization_id = new.id and c.archived_at is null) then
    raise exception 'Archiva primero tus clientes para desactivar el modo agencia';
  end if;
  return new;
end;
$$;

create trigger organizations_hierarchy_guard
  before insert or update on public.organizations
  for each row execute function public.organizations_hierarchy_guard();

-- Alta de clientes: solo el titular de una cuenta agencia, con un máximo razonable.
create or replace function public.create_client_organization(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_root uuid;
  v_count int;
  v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if auth.uid() is null then
    raise exception 'Sesión no válida' using errcode = '42501';
  end if;
  if length(v_name) < 1 or length(v_name) > 120 then
    raise exception 'El nombre del cliente debe tener entre 1 y 120 caracteres' using errcode = '22023';
  end if;

  select o.id into v_root
    from public.organizations o
    join public.organization_members m on m.organization_id = o.id and m.user_id = auth.uid() and m.role = 'owner'
   where o.parent_organization_id is null and o.account_type = 'agency'
   order by o.created_at
   limit 1
   for update of o;
  if v_root is null then
    raise exception 'Activa el modo agencia para añadir clientes' using errcode = '42501';
  end if;

  select count(*) into v_count
    from public.organizations where parent_organization_id = v_root and archived_at is null;
  if v_count >= 500 then
    raise exception 'Has alcanzado el máximo de 500 clientes activos' using errcode = '54000';
  end if;

  insert into public.organizations (owner_id, parent_organization_id, client_name, account_type)
  values (auth.uid(), v_root, v_name, 'business')
  returning id into v_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_id, auth.uid(), 'owner');

  insert into public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, organization_id)
  values (auth.uid(), 'user', 'client.created', 'organization', v_id::text, v_root);

  return v_id;
end;
$$;

-- El titular puede activar el modo agencia, nombrar y archivar clientes.
-- La jerarquía (parent_organization_id) y el titular nunca son editables.
grant update (account_type, client_name, client_notes, archived_at) on public.organizations to authenticated;

-- Alta de usuario: además acepta el tipo de cuenta elegido en el registro.
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
  v_type text := case when v_meta ->> 'account_type' = 'agency' then 'agency' else 'business' end;
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

  insert into public.organizations (owner_id, contact_email, account_type)
  values (new.id, new.email, v_type)
  returning id into v_org_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org_id, new.id, 'owner');

  return new;
end;
$$;

-- Registro de versiones con comprobación de cupo y de pertenencia en base de datos.
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
    select s.organization_id, s.current_period_start, p.documents_per_period
      into v_sub_org, v_period_start, v_limit
      from public.subscriptions s
      left join public.products p on p.id = s.product_id
     where s.id = p_subscription_id
       and s.status in ('active', 'trialing')
       for update of s;
    if not found or v_sub_org is distinct from v_billing_org then
      raise exception 'La suscripción no corresponde a esta cuenta' using errcode = '42501';
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

revoke execute on function public.create_client_organization(text) from public, anon;
revoke execute on function public.organizations_hierarchy_guard() from public, anon, authenticated;
grant execute on function public.create_client_organization(text) to authenticated, service_role;
grant execute on function public.record_document_version(uuid, uuid, text, text, uuid, uuid, jsonb, text, uuid, uuid, text, boolean, text, text, text, uuid) to service_role;
grant execute on function public.handle_new_user() to service_role;

-- Pregunta frecuente del modo agencia para bases de datos ya sembradas
-- (en una instalación nueva la añade supabase/seed/base.sql).
insert into public.faqs (question, answer, category, sort_order)
select '¿Puedo gestionar las webs de mis clientes?', 'Sí. Las agencias web, gestorías y consultores pueden activar el modo agencia: cada cliente tiene su propio formulario y sus documentos, y el cupo de la suscripción se comparte entre todos. Los documentos no llevan la marca de Legalito.', 'suscripcion', 6
where exists (select 1 from public.faqs)
  and not exists (select 1 from public.faqs where question = '¿Puedo gestionar las webs de mis clientes?');
