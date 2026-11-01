-- =============================================================================
-- Legalito · Privilegios y políticas RLS
-- -----------------------------------------------------------------------------
-- Principio: denegar por defecto. Se retiran todos los privilegios que Supabase
-- concede por defecto a `anon` y `authenticated` y se conceden explícitamente
-- solo los necesarios. Las escrituras sensibles (pagos, documentos generados,
-- eventos) se realizan exclusivamente desde el servidor con `service_role`.
--
-- IMPORTANTE para futuras migraciones: cada tabla nueva debe declarar sus
-- GRANT y políticas explícitamente (ver CLAUDE.md).
-- =============================================================================

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Helpers necesarios para evaluar políticas.
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.has_role(public.app_role) to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.try_uuid(text) to authenticated;
-- Flujo editorial y métricas (comprueban el rol internamente).
grant execute on function public.submit_template_version(uuid) to authenticated;
grant execute on function public.approve_template_version(uuid, text, text, timestamptz, text, text) to authenticated;
grant execute on function public.publish_template_version(uuid) to authenticated;
grant execute on function public.admin_metrics(int) to authenticated;
-- consume/release_purchase_generation, record_document_version y check_rate_limit
-- quedan reservadas a service_role.

-- Activar RLS en todas las tablas.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Catálogos públicos
-- ---------------------------------------------------------------------------
grant select on public.document_types to anon, authenticated;
create policy document_types_read on public.document_types
  for select to anon, authenticated using (active or public.is_admin());

grant select on public.products to anon, authenticated;
grant insert, update (name, description, price_cents, stripe_price_id, included_document_types,
  generations_limit, includes_updates, features, active, sort_order) on public.products to authenticated;
grant insert on public.products to authenticated;
create policy products_read on public.products
  for select to anon, authenticated using (active or public.is_admin());
create policy products_admin_insert on public.products
  for insert to authenticated with check (public.is_admin());
create policy products_admin_update on public.products
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.faqs to anon, authenticated;
grant insert, update, delete on public.faqs to authenticated;
create policy faqs_read on public.faqs
  for select to anon, authenticated using (published or public.is_admin());
create policy faqs_admin_write on public.faqs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Perfil y organización (solo los datos propios)
-- ---------------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (full_name, notify_legal_updates, marketing_consent, marketing_consent_at) on public.profiles to authenticated;
create policy profiles_read on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

grant select on public.organizations to authenticated;
grant update (business_type, owner_type, legal_name, trade_name, nif, address_line, postal_code,
  city, province, contact_email, phone, website_url, activity) on public.organizations to authenticated;
create policy organizations_read on public.organizations
  for select to authenticated using (public.is_org_member(id) or public.is_admin());
create policy organizations_update_member on public.organizations
  for update to authenticated using (public.is_org_member(id)) with check (public.is_org_member(id));

grant select on public.organization_members to authenticated;
create policy organization_members_read on public.organization_members
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

grant select on public.user_roles to authenticated;
create policy user_roles_read on public.user_roles
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Datos económicos: lectura propia, escritura solo desde servidor
-- ---------------------------------------------------------------------------
grant select on public.subscriptions, public.payments, public.purchases to authenticated;
create policy subscriptions_read on public.subscriptions
  for select to authenticated using (public.is_org_member(organization_id) or public.is_admin());
create policy payments_read on public.payments
  for select to authenticated using (public.is_org_member(organization_id) or public.is_admin());
create policy purchases_read on public.purchases
  for select to authenticated using (public.is_org_member(organization_id) or public.is_admin());

grant select on public.stripe_events to authenticated;
create policy stripe_events_admin_read on public.stripe_events
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Plantillas: solo administración y revisión jurídica
-- ---------------------------------------------------------------------------
grant select, insert, update on public.templates to authenticated;
create policy templates_staff_read on public.templates
  for select to authenticated using (public.is_admin() or public.has_role('legal_reviewer'));
create policy templates_admin_insert on public.templates
  for insert to authenticated with check (public.is_admin());
create policy templates_admin_update on public.templates
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert on public.template_versions to authenticated;
grant update (content, variables, rules, changelog, version_label, questionnaire_version, is_demo, status)
  on public.template_versions to authenticated;
create policy template_versions_staff_read on public.template_versions
  for select to authenticated using (public.is_admin() or public.has_role('legal_reviewer'));
create policy template_versions_admin_insert on public.template_versions
  for insert to authenticated with check (public.is_admin());
-- Edición directa permitida solo sobre borradores (y devolver una revisión a borrador).
create policy template_versions_admin_update on public.template_versions
  for update to authenticated
  using (public.is_admin() and status in ('draft', 'in_review'))
  with check (public.is_admin() and status in ('draft', 'in_review', 'retired'));

-- ---------------------------------------------------------------------------
-- Formularios: el cliente gestiona los suyos
-- ---------------------------------------------------------------------------
grant select, insert, delete on public.form_responses to authenticated;
grant update (answers, current_step, questionnaire_version) on public.form_responses to authenticated;
create policy form_responses_read on public.form_responses
  for select to authenticated using (public.is_org_member(organization_id));
create policy form_responses_insert on public.form_responses
  for insert to authenticated
  with check (public.is_org_member(organization_id) and status = 'draft' and created_by = auth.uid());
create policy form_responses_update on public.form_responses
  for update to authenticated
  using (public.is_org_member(organization_id) and status = 'draft')
  with check (public.is_org_member(organization_id) and status = 'draft');
create policy form_responses_delete on public.form_responses
  for delete to authenticated using (public.is_org_member(organization_id) and status = 'draft');

-- ---------------------------------------------------------------------------
-- Documentos generados: lectura propia; se crean solo en servidor
-- ---------------------------------------------------------------------------
grant select on public.documents, public.document_versions to authenticated;
create policy documents_read on public.documents
  for select to authenticated using (public.is_org_member(organization_id) or public.is_admin());
create policy document_versions_read on public.document_versions
  for select to authenticated using (public.is_org_member(organization_id) or public.is_admin());

-- ---------------------------------------------------------------------------
-- Contenido editorial
-- ---------------------------------------------------------------------------
grant select, insert, update on public.legal_updates to authenticated;
create policy legal_updates_read on public.legal_updates
  for select to authenticated using (status = 'published' or public.is_admin());
create policy legal_updates_admin_insert on public.legal_updates
  for insert to authenticated with check (public.is_admin());
create policy legal_updates_admin_update on public.legal_updates
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.notices to authenticated;
create policy notices_read on public.notices
  for select to authenticated using (
    (active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()))
    or public.is_admin()
  );
create policy notices_admin_write on public.notices
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Soporte
-- ---------------------------------------------------------------------------
grant select on public.support_requests to authenticated;
grant update (status, admin_notes) on public.support_requests to authenticated;
create policy support_requests_read on public.support_requests
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin() or public.has_role('support'));
create policy support_requests_staff_update on public.support_requests
  for update to authenticated
  using (public.is_admin() or public.has_role('support'))
  with check (public.is_admin() or public.has_role('support'));

-- ---------------------------------------------------------------------------
-- Registros internos: solo lectura para administración
-- ---------------------------------------------------------------------------
grant select on public.email_events, public.audit_logs, public.app_errors, public.analytics_events to authenticated;
create policy email_events_admin_read on public.email_events
  for select to authenticated using (public.is_admin());
create policy audit_logs_admin_read on public.audit_logs
  for select to authenticated using (public.is_admin());
create policy app_errors_admin_read on public.app_errors
  for select to authenticated using (public.is_admin());
create policy analytics_events_admin_read on public.analytics_events
  for select to authenticated using (public.is_admin());

-- rate_limits: sin acceso para clientes (solo service_role).
