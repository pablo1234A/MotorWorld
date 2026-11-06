-- =============================================================================
-- RevisaYa · Fase 6 · Sistema de correos (docs/INTEGRACIONES.md §2,
-- docs/AUTOMATIZACIONES.md §4–5)
--
--  · private.apply_email_event   · eventos del proveedor (entregado, rebote,
--                                  queja…): idempotentes, sin retroceder de
--                                  estado aunque lleguen desordenados, y
--                                  supresión automática
--  · app.requeue_skipped_reminders · al mejorar el plan o reactivar la
--                                  suscripción, vuelven a la cola los avisos
--                                  saltados por cuota o suscripción (P5)
--  · usage_counters.alert_*      · avisos de consumo al 80 % y al 100 %
--  · private.digest_runs         · resumen al taller, uno por periodo
--  · slugs reservados            · el slug es la dirección de envío en el
--                                  dominio compartido (postmaster@, abuse@…)
-- Todo es aditivo: no se borra ni se modifica ningún dato existente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Slugs reservados. El slug del taller es la parte local de su remitente en el
-- dominio compartido (P1): "postmaster", "abuse"… pertenecen a RevisaYa
-- (RFC 2142). Solo se comprueba al crear o cambiar el slug.
-- -----------------------------------------------------------------------------
create function app.forbid_reserved_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if lower(new.slug::text) = any (array[
       'postmaster', 'abuse', 'hostmaster', 'webmaster', 'admin', 'administrator', 'root',
       'security', 'noreply', 'no-reply', 'mailer-daemon', 'bounce', 'bounces', 'dmarc',
       'revisaya', 'soporte', 'support', 'info', 'facturacion', 'billing', 'privacidad', 'privacy']) then
    raise exception 'slug_reserved' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger organizations_reserved_slug
  before insert or update of slug on public.organizations
  for each row execute function app.forbid_reserved_slug();

-- -----------------------------------------------------------------------------
-- Correos de la plataforma al propio taller (no cuentan en el consumo, P5).
-- -----------------------------------------------------------------------------
alter table public.email_logs drop constraint email_logs_kind_check,
  add constraint email_logs_kind_check check (kind in (
    'reminder', 'booking_received', 'booking_confirmed', 'booking_rejected',
    'booking_rescheduled', 'test', 'digest', 'usage_alert'));

-- Avisos de consumo: una vez por umbral y periodo.
alter table public.usage_counters
  add column alert_80_sent_at timestamptz,
  add column alert_100_sent_at timestamptz;

-- Resumen al taller: una fila por sucursal y periodo ('2026-11-07' diario,
-- '2026-W45' semanal). La clave primaria impide enviarlo dos veces.
create table private.digest_runs (
  branch_id    uuid not null references public.branches (id) on delete cascade,
  period_key   text not null check (period_key ~ '^\d{4}-(\d{2}-\d{2}|W\d{2})$'),
  created_at   timestamptz not null default now(),
  primary key (branch_id, period_key)
);

-- -----------------------------------------------------------------------------
-- Eventos del proveedor de correo.
--  · Idempotentes: el mismo evento dos veces no hace nada la segunda.
--  · Sin retroceder: accepted < delivery_delayed < delivered < bounced < complained
--    (un "entregado" que llega después de un rebote no lo deshace).
--  · Rebote definitivo → supresión 'hard_bounce'; queja → 'complaint'.
--  · No se guardan direcciones de correo en el evento (payload mínimo).
-- -----------------------------------------------------------------------------
create function private.email_status_rank(p_status text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'accepted' then 0 when 'sent' then 0
    when 'delivery_delayed' then 1
    when 'delivered' then 2
    when 'bounced' then 3
    when 'complained' then 4
    else -1 end;
$$;

create function private.apply_email_event(
  p_provider text,
  p_event_id text,
  p_message_id text,
  p_type text,              -- delivered | delivery_delayed | bounced | complained | sent | opened | clicked | …
  p_occurred_at timestamptz,
  p_bounce_type text default null,   -- hard | soft | undetermined
  p_payload jsonb default '{}'::jsonb)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event bigint;
  v_log public.email_logs%rowtype;
  v_status text;
  v_reason text;
  v_changed boolean := false;
begin
  if p_bounce_type is not null and p_bounce_type not in ('hard', 'soft', 'undetermined') then
    raise exception 'invalid_bounce_type' using errcode = '22023';
  end if;

  select * into v_log from public.email_logs
   where provider = p_provider and provider_message_id = p_message_id
   for update;

  insert into public.email_events (provider, provider_event_id, email_log_id, type, occurred_at, payload_min)
  values (p_provider, p_event_id, v_log.id, left(p_type, 60), p_occurred_at, coalesce(p_payload, '{}'::jsonb))
  on conflict (provider, provider_event_id) do nothing
  returning id into v_event;
  if v_event is null then
    return 'duplicate';
  end if;
  if v_log.id is null then
    return 'unknown_message';
  end if;

  v_status := case p_type
    when 'delivered' then 'delivered'
    when 'delivery_delayed' then 'delivery_delayed'
    when 'bounced' then 'bounced'
    when 'complained' then 'complained'
    else null end;
  if v_status is null then
    return 'ignored';   -- 'sent', aperturas (P8, desactivadas), clics…
  end if;

  -- Un rebote temporal (soft) no es definitivo: queda como retraso.
  if v_status = 'bounced' and p_bounce_type = 'soft' then
    v_status := 'delivery_delayed';
  end if;

  if private.email_status_rank(v_status) > private.email_status_rank(v_log.status) and v_log.status <> 'failed' then
    v_changed := true;
    update public.email_logs
       set status = v_status,
           delivered_at = case when v_status = 'delivered' then coalesce(delivered_at, p_occurred_at) else delivered_at end,
           bounce_type = case when v_status = 'bounced' then coalesce(p_bounce_type, 'undetermined') else bounce_type end
     where id = v_log.id;

    if v_log.reminder_id is not null and v_status in ('delivered', 'bounced', 'complained') then
      update public.reminders
         set status = v_status
       where id = v_log.reminder_id
         and status in ('sent', 'delivered', 'bounced', 'complained')
         and private.email_status_rank(status) < private.email_status_rank(v_status);
    end if;
  end if;

  if not v_changed then
    return 'stale';   -- llegó desordenado o repite un estado: no cambia nada
  end if;
  v_reason := case
    when v_status = 'complained' then 'complaint'
    when v_status = 'bounced' then 'hard_bounce'
    else null end;
  if v_reason is not null then
    insert into public.email_suppressions (organization_id, email, reason, source_event_id)
    values (v_log.organization_id, v_log.to_email, v_reason, v_event)
    on conflict (organization_id, email) do nothing;
  end if;

  return coalesce(v_reason, v_status);
end;
$$;

-- -----------------------------------------------------------------------------
-- Reprogramar avisos saltados al mejorar el plan o reactivar la suscripción
-- (P5): solo los saltados por cuota o por suscripción inactiva en los últimos
-- 31 días y cuya revisión aún no ha pasado. El momento de envío se recalcula.
-- -----------------------------------------------------------------------------
create function app.requeue_skipped_reminders(p_org uuid)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n int;
begin
  update public.reminders r
     set status = 'scheduled', skip_reason = null, next_attempt_at = null, last_error = null,
         scheduled_for = private.next_send_slot(r.branch_id, date '2000-01-01', r.due_date, now())
    from public.branches b
    join public.organizations o on o.id = b.organization_id
   where b.id = r.branch_id
     and r.organization_id = p_org
     and r.status = 'skipped'
     and r.skip_reason in ('quota_exceeded', 'subscription_inactive')
     and r.updated_at > now() - interval '31 days'
     and r.due_date >= (now() at time zone coalesce(b.timezone, o.timezone))::date;
  get diagnostics n = row_count;
  return n;
end;
$$;

create function app.on_subscription_upgraded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_limit int;
  v_new_limit int;
begin
  if not app.subscription_is_active(new.status, new.past_due_since) then
    return null;
  end if;
  select monthly_emails into v_old_limit from public.plans where code = old.plan_code;
  select monthly_emails into v_new_limit from public.plans where code = new.plan_code;
  if not app.subscription_is_active(old.status, old.past_due_since)   -- reactivación
     or v_new_limit > v_old_limit then                                -- más correos al mes
    perform app.requeue_skipped_reminders(new.organization_id);
    -- Nuevo límite: el aviso del 100 % puede volver a ser necesario.
    update public.usage_counters
       set alert_100_sent_at = null,
           alert_80_sent_at = case when v_new_limit > v_old_limit then null else alert_80_sent_at end
     where organization_id = new.organization_id and resource = 'emails'
       and period_start = app.usage_period(new.organization_id);
  end if;
  return null;
end;
$$;
create trigger subscriptions_requeue_reminders
  after update of plan_code, status on public.subscriptions
  for each row execute function app.on_subscription_upgraded();

revoke all on function private.email_status_rank(text),
  private.apply_email_event(text, text, text, text, timestamptz, text, jsonb),
  app.requeue_skipped_reminders(uuid) from public, anon, authenticated;
grant execute on function private.email_status_rank(text),
  private.apply_email_event(text, text, text, text, timestamptz, text, jsonb),
  app.requeue_skipped_reminders(uuid) to service_role;
