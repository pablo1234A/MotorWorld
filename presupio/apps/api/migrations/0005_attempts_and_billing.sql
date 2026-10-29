-- =============================================================================
-- Presupio · 0005 · Consumo por intentos, suscripciones de pago y fin de prueba
-- -----------------------------------------------------------------------------
-- 1. Regla comercial (fase 5): los planes limitan INTENTOS de seguimiento, no recuperaciones.
--    Un intento es un seguimiento automático que el proveedor de email ha aceptado. Se
--    registra una vez por seguimiento (los reintentos técnicos no duplican el consumo).
--    Las recuperaciones pasan a ser solo una métrica: ya no consumen el plan.
-- 2. Suscripciones con Stripe (modo de prueba): columnas de sincronización, historial de
--    eventos de facturación (también sirve de antirrepetición) y funciones acotadas para que
--    el rol de la aplicación pueda aplicar un webhook verificado sin poder escribir
--    directamente en `subscriptions`.
-- 3. Fin de la prueba: avisos de conservación de datos (90 días) antes de un borrado que
--    sigue siendo manual (docs/facturacion.md).
--
-- Compatible con los datos existentes:
--  - No se borra ni se reclasifica nada. Los contadores de recuperaciones de los periodos ya
--    existentes se conservan tal cual, como dato histórico de la regla anterior.
--  - Los emails automáticos ya enviados se anotan como intentos «historical»: quedan en el
--    registro, pero no consumen el plan de ningún periodo.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Intentos
-- ---------------------------------------------------------------------------
ALTER TABLE usage_periods
  ADD COLUMN attempt_limit               integer NOT NULL DEFAULT 0,
  ADD COLUMN attempts_counted            integer NOT NULL DEFAULT 0,
  -- Envíos reclamados por el motor y aún sin resultado: ocupan cupo para que dos procesos no
  -- puedan superar el límite, pero no se cobran hasta que el proveedor acepta el email.
  ADD COLUMN attempts_reserved           integer NOT NULL DEFAULT 0,
  ADD COLUMN attempts_limit_reached_at   timestamptz;

-- Los periodos existentes reciben el límite de su plan (las cifras de los planes no cambian:
-- 25, 65 y 300). Su consumo de intentos empieza en cero: los envíos anteriores no se cobran.
UPDATE usage_periods SET attempt_limit = recovery_limit;

ALTER TABLE usage_periods
  ADD CONSTRAINT usage_periods_attempt_limit CHECK (attempt_limit >= 0),
  -- Garantía en la base de datos: lo contado más lo reservado nunca supera el límite.
  ADD CONSTRAINT usage_periods_attempts_within_limit
    CHECK (attempts_counted >= 0 AND attempts_reserved >= 0 AND attempts_counted + attempts_reserved <= attempt_limit);

-- La regla de 0004 se amplía a los intentos: lo contado no baja y el límite de un periodo
-- no se reduce. Solo el propietario del esquema (correcciones de soporte) puede saltársela.
CREATE OR REPLACE FUNCTION usage_periods_guard() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public, pg_temp
  AS $$
DECLARE
  table_owner name;
BEGIN
  SELECT pg_get_userbyid(c.relowner) INTO table_owner FROM pg_class c WHERE c.oid = TG_RELID;
  IF current_user = table_owner THEN
    RETURN NEW; -- corrección de soporte con el rol propietario (queda en su propio registro)
  END IF;
  IF NEW.company_id <> OLD.company_id OR NEW.period_start <> OLD.period_start OR NEW.period_end <> OLD.period_end THEN
    RAISE EXCEPTION 'No se puede cambiar la empresa ni las fechas de un periodo de uso' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.recoveries_counted < OLD.recoveries_counted OR NEW.recoveries_over_limit < OLD.recoveries_over_limit THEN
    RAISE EXCEPTION 'Los contadores de recuperaciones no pueden disminuir' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.attempts_counted < OLD.attempts_counted THEN
    RAISE EXCEPTION 'Los intentos contabilizados no pueden disminuir' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.attempt_limit < OLD.attempt_limit THEN
    RAISE EXCEPTION 'El límite de intentos de un periodo no puede bajar' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- Un registro por seguimiento automático: reserva → contado (aceptado por el proveedor) o
-- liberado (falló antes de enviarse) o sin verificar (resultado desconocido, no se cobra).
CREATE TABLE attempt_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  follow_up_id    uuid NOT NULL,
  quote_id        uuid NOT NULL,
  -- Último envío técnico del seguimiento (los reintentos comparten el mismo intento).
  delivery_id     uuid,
  status          text NOT NULL,
  period_start    timestamptz,
  reserved_at     timestamptz,
  -- Momento en que el proveedor aceptó el email (hora del servidor, nunca declarada).
  sent_at         timestamptz,
  released_at     timestamptz,
  release_reason  text,
  created_at      timestamptz(3) NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attempt_events_one_per_follow_up UNIQUE (company_id, follow_up_id),
  -- Sin borrado en cascada: un seguimiento con intento registrado no se puede borrar.
  CONSTRAINT attempt_events_follow_up_fk FOREIGN KEY (company_id, follow_up_id) REFERENCES follow_ups (company_id, id),
  CONSTRAINT attempt_events_quote_fk FOREIGN KEY (company_id, quote_id) REFERENCES quotes (company_id, id),
  CONSTRAINT attempt_events_period_fk FOREIGN KEY (company_id, period_start) REFERENCES usage_periods (company_id, period_start),
  CONSTRAINT attempt_events_status CHECK (status IN ('reserved', 'counted', 'released', 'unverified', 'historical')),
  CONSTRAINT attempt_events_period CHECK (
    (status NOT IN ('reserved', 'counted') OR period_start IS NOT NULL) AND (status <> 'historical' OR period_start IS NULL)
  ),
  CONSTRAINT attempt_events_sent CHECK ((status IN ('counted', 'historical')) = (sent_at IS NOT NULL)),
  CONSTRAINT attempt_events_release_reason CHECK (release_reason IS NULL OR length(release_reason) <= 200)
);
CREATE INDEX attempt_events_period_idx ON attempt_events (company_id, period_start) WHERE period_start IS NOT NULL;
CREATE INDEX attempt_events_company_sent_idx ON attempt_events (company_id, sent_at DESC) WHERE sent_at IS NOT NULL;
CREATE TRIGGER attempt_events_updated_at BEFORE UPDATE ON attempt_events FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Transiciones permitidas al rol de la aplicación. Un intento contado no se deshace.
CREATE FUNCTION attempt_events_guard() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public, pg_temp
  AS $$
DECLARE
  table_owner name;
BEGIN
  SELECT pg_get_userbyid(c.relowner) INTO table_owner FROM pg_class c WHERE c.oid = TG_RELID;
  IF current_user = table_owner THEN
    RETURN NEW;
  END IF;
  IF NEW.company_id <> OLD.company_id OR NEW.follow_up_id <> OLD.follow_up_id OR NEW.quote_id <> OLD.quote_id THEN
    RAISE EXCEPTION 'Un intento no puede cambiar de empresa ni de seguimiento' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = OLD.status THEN
    IF NEW.status IN ('counted', 'historical') AND (NEW.sent_at IS DISTINCT FROM OLD.sent_at OR NEW.period_start IS DISTINCT FROM OLD.period_start) THEN
      RAISE EXCEPTION 'Un intento contado no se puede modificar' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (OLD.status = 'reserved' AND NEW.status IN ('counted', 'released', 'unverified'))
     OR (OLD.status = 'released' AND NEW.status = 'reserved') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Cambio de estado de intento no permitido: % → %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
END $$;
CREATE TRIGGER attempt_events_guard BEFORE UPDATE ON attempt_events FOR EACH ROW EXECUTE FUNCTION attempt_events_guard();

ALTER TABLE attempt_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY attempt_events_tenant_isolation ON attempt_events FOR ALL
  USING (company_id = (SELECT app_company_id())) WITH CHECK (company_id = (SELECT app_company_id()));

-- Emails automáticos enviados antes de esta regla: quedan registrados como «historical»
-- (no consumen el plan de ningún periodo). No se reclasifican recuperaciones.
INSERT INTO attempt_events (company_id, follow_up_id, quote_id, delivery_id, status, sent_at)
SELECT f.company_id, f.id, f.quote_id,
       (SELECT d.id FROM message_deliveries d
         WHERE d.company_id = f.company_id AND d.follow_up_id = f.id AND d.sent_at IS NOT NULL
         ORDER BY d.created_at DESC LIMIT 1),
       'historical', f.sent_at
FROM follow_ups f
WHERE f.source = 'rule' AND f.status = 'sent' AND f.sent_at IS NOT NULL;

-- Las recuperaciones registradas a partir de ahora son solo una métrica: estado «recorded».
ALTER TABLE recovery_events DROP CONSTRAINT recovery_events_status;
ALTER TABLE recovery_events ADD CONSTRAINT recovery_events_status
  CHECK (status IN ('counted', 'over_limit', 'no_active_plan', 'historical', 'recorded'));

-- ---------------------------------------------------------------------------
-- 2. Suscripciones de pago
-- ---------------------------------------------------------------------------
ALTER TABLE subscriptions
  -- Desde cuándo está pendiente el cobro (días de gracia: domain/plans.ts).
  ADD COLUMN past_due_since                timestamptz,
  -- Cuándo terminó el acceso de pago (cancelada o impagada): cuenta el plazo de conservación.
  ADD COLUMN ended_at                      timestamptz,
  ADD COLUMN provider_price_id             text,
  ADD COLUMN provider_checkout_session_id  text,
  -- Momento de la lectura del estado en el proveedor que se aplicó (protege del desorden).
  ADD COLUMN provider_synced_at            timestamptz;

UPDATE subscriptions SET past_due_since = now() WHERE status = 'past_due';

CREATE UNIQUE INDEX subscriptions_provider_customer_key ON subscriptions (provider, provider_customer_id)
  WHERE provider_customer_id IS NOT NULL;

-- Historial de eventos de facturación (sin datos de tarjeta ni secretos). La clave única por
-- evento del proveedor es también la protección frente a eventos repetidos.
CREATE TABLE billing_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid REFERENCES companies (id) ON DELETE CASCADE,
  provider             text NOT NULL,
  provider_event_id    text NOT NULL,
  event_type           text NOT NULL,
  -- applied: estado sincronizado · ignored: no cambia nada · stale: más antiguo que lo ya
  -- aplicado · unmatched: no corresponde a ninguna empresa · error: no se pudo aplicar ·
  -- duplicate_subscription: segunda suscripción viva para la misma empresa (revisar).
  outcome              text NOT NULL,
  subscription_status  subscription_status,
  plan                 subscription_plan,
  detail               text,
  created_at           timestamptz(3) NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_events_event_key UNIQUE (provider, provider_event_id),
  CONSTRAINT billing_events_outcome CHECK (outcome IN ('applied', 'ignored', 'stale', 'unmatched', 'error', 'duplicate_subscription')),
  CONSTRAINT billing_events_detail CHECK (detail IS NULL OR length(detail) <= 300),
  CONSTRAINT billing_events_event_type CHECK (length(event_type) <= 100 AND length(provider_event_id) <= 255)
);
CREATE INDEX billing_events_company_created_idx ON billing_events (company_id, created_at DESC);
CREATE INDEX billing_events_outcome_created_idx ON billing_events (outcome, created_at DESC);
CREATE TRIGGER billing_events_updated_at BEFORE UPDATE ON billing_events FOR EACH ROW EXECUTE FUNCTION set_updated_at();
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_events_tenant_read ON billing_events FOR SELECT USING (company_id = (SELECT app_company_id()));

-- Vincula el cliente del proveedor a la empresa activa (solo la primera vez).
CREATE FUNCTION app_billing_link_customer(p_customer text) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_company uuid := app_company_id();
  v_existing text;
BEGIN
  IF v_company IS NULL THEN RAISE EXCEPTION 'Sin empresa activa' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF p_customer IS NULL OR p_customer !~ '^cus_[A-Za-z0-9]{1,250}$' THEN
    RAISE EXCEPTION 'Identificador de cliente no válido' USING ERRCODE = 'check_violation';
  END IF;
  SELECT provider_customer_id INTO v_existing FROM subscriptions WHERE company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Empresa sin suscripción' USING ERRCODE = 'no_data_found'; END IF;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  UPDATE subscriptions SET provider = 'stripe', provider_customer_id = p_customer WHERE company_id = v_company;
  RETURN p_customer;
END $$;
REVOKE ALL ON FUNCTION app_billing_link_customer(text) FROM PUBLIC;

-- Guarda la última sesión de pago abierta de la empresa activa y devuelve la anterior.
CREATE FUNCTION app_billing_set_checkout_session(p_session text) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_company uuid := app_company_id();
  v_previous text;
BEGIN
  IF v_company IS NULL THEN RAISE EXCEPTION 'Sin empresa activa' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF p_session IS NULL OR p_session !~ '^cs_[A-Za-z0-9_]{1,250}$' THEN
    RAISE EXCEPTION 'Identificador de sesión no válido' USING ERRCODE = 'check_violation';
  END IF;
  SELECT provider_checkout_session_id INTO v_previous FROM subscriptions WHERE company_id = v_company FOR UPDATE;
  UPDATE subscriptions SET provider_checkout_session_id = p_session WHERE company_id = v_company;
  RETURN v_previous;
END $$;
REVOKE ALL ON FUNCTION app_billing_set_checkout_session(text) FROM PUBLIC;

-- Registra un evento que no cambia la suscripción (ignorado, sin empresa o con error).
-- Devuelve 'duplicate' si ya se procesó (salvo que su resultado anterior fuera un error).
CREATE FUNCTION app_billing_record_event(
  p_event_id text, p_event_type text, p_customer text, p_outcome text, p_detail text
) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_prev text;
  v_company uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-event:' || p_event_id, 0));
  SELECT outcome INTO v_prev FROM billing_events WHERE provider = 'stripe' AND provider_event_id = p_event_id;
  IF FOUND AND v_prev <> 'error' THEN RETURN 'duplicate'; END IF;
  IF p_customer IS NOT NULL THEN
    SELECT company_id INTO v_company FROM subscriptions WHERE provider = 'stripe' AND provider_customer_id = p_customer;
  END IF;
  INSERT INTO billing_events (company_id, provider, provider_event_id, event_type, outcome, detail)
  VALUES (v_company, 'stripe', p_event_id, left(p_event_type, 100), p_outcome, left(p_detail, 300))
  ON CONFLICT (provider, provider_event_id) DO UPDATE
    SET company_id = EXCLUDED.company_id, outcome = EXCLUDED.outcome, detail = EXCLUDED.detail;
  RETURN 'recorded';
END $$;
REVOKE ALL ON FUNCTION app_billing_record_event(text, text, text, text, text) FROM PUBLIC;

-- Aplica el estado de una suscripción leído del proveedor tras verificar la firma del
-- webhook. Todo ocurre en una transacción: antirrepetición, comprobación de la empresa y
-- del cliente, protección frente a eventos desordenados, cambio de estado e historial.
CREATE FUNCTION app_billing_apply_subscription(
  p_event_id text,
  p_event_type text,
  p_hint_company uuid,
  p_customer text,
  p_subscription text,
  p_status subscription_status,
  p_plan subscription_plan,
  p_price text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_trial_end timestamptz,
  p_synced_at timestamptz
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_prev text;
  s subscriptions%ROWTYPE;
  v_outcome text;
  v_detail text;
  v_live boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-event:' || p_event_id, 0));
  SELECT outcome INTO v_prev FROM billing_events WHERE provider = 'stripe' AND provider_event_id = p_event_id;
  IF FOUND AND v_prev <> 'error' THEN RETURN jsonb_build_object('outcome', 'duplicate'); END IF;

  IF p_status IS NULL OR p_plan IS NULL OR p_subscription IS NULL OR p_customer IS NULL
     OR p_period_start IS NULL OR p_period_end IS NULL OR p_period_start >= p_period_end
     OR (p_status = 'trialing' AND p_trial_end IS NULL) OR p_status IN ('none', 'incomplete') THEN
    RAISE EXCEPTION 'Estado de suscripción no válido' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO s FROM subscriptions WHERE provider = 'stripe' AND provider_subscription_id = p_subscription FOR UPDATE;
  IF NOT FOUND THEN
    SELECT * INTO s FROM subscriptions WHERE provider = 'stripe' AND provider_customer_id = p_customer FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    v_outcome := 'unmatched'; v_detail := 'Cliente o suscripción sin empresa asociada';
  ELSIF p_hint_company IS NOT NULL AND p_hint_company <> s.company_id THEN
    v_outcome := 'error'; v_detail := 'La empresa indicada en el pago no coincide con la del cliente';
  ELSIF s.provider_customer_id IS DISTINCT FROM p_customer THEN
    v_outcome := 'error'; v_detail := 'El cliente no coincide con el de la empresa';
  ELSIF s.provider_synced_at IS NOT NULL AND p_synced_at < s.provider_synced_at THEN
    v_outcome := 'stale'; v_detail := 'Ya se había aplicado un estado más reciente';
  ELSE
    -- ¿La empresa ya tiene OTRA suscripción viva? No se sustituye: se avisa para revisarla.
    v_live := s.provider_subscription_id IS NOT NULL AND s.provider_subscription_id <> p_subscription
              AND s.status IN ('active', 'past_due', 'trialing') AND s.ended_at IS NULL;
    IF v_live AND p_status IN ('active', 'past_due', 'trialing') THEN
      v_outcome := 'duplicate_subscription'; v_detail := 'La empresa ya tiene otra suscripción activa';
    ELSIF v_live THEN
      v_outcome := 'ignored'; v_detail := 'Evento de una suscripción anterior';
    ELSE
      UPDATE subscriptions SET
        plan = p_plan,
        status = p_status,
        trial_ends_at = CASE WHEN p_status = 'trialing' THEN p_trial_end ELSE trial_ends_at END,
        current_period_start = p_period_start,
        current_period_end = p_period_end,
        cancel_at_period_end = coalesce(p_cancel_at_period_end, false),
        provider = 'stripe',
        provider_subscription_id = p_subscription,
        provider_price_id = p_price,
        provider_synced_at = p_synced_at,
        past_due_since = CASE WHEN p_status = 'past_due' THEN coalesce(CASE WHEN s.status = 'past_due' THEN s.past_due_since END, now()) END,
        ended_at = CASE
          WHEN p_status IN ('canceled', 'unpaid') THEN coalesce(s.ended_at, now())
          ELSE NULL END
      WHERE company_id = s.company_id;

      -- Al empezar un periodo de pago, el periodo de uso de la prueba (mes natural) termina
      -- ahí: el periodo pagado empieza con su cupo completo y sin solaparse con el anterior.
      IF p_status IN ('active', 'past_due', 'trialing') THEN
        UPDATE usage_periods SET period_end = p_period_start
        WHERE company_id = s.company_id AND period_source = 'calendar_month'
          AND period_start < p_period_start AND period_end > p_period_start;
      END IF;

      IF s.plan IS DISTINCT FROM p_plan OR s.status IS DISTINCT FROM p_status OR s.cancel_at_period_end IS DISTINCT FROM coalesce(p_cancel_at_period_end, false) THEN
        INSERT INTO activity_log (company_id, actor_user_id, action, entity_type, entity_id, metadata)
        VALUES (s.company_id, NULL, 'subscription.changed', 'company', s.company_id, jsonb_build_object(
          'from', jsonb_build_object('plan', s.plan, 'status', s.status, 'cancelAtPeriodEnd', s.cancel_at_period_end),
          'to', jsonb_build_object('plan', p_plan, 'status', p_status, 'cancelAtPeriodEnd', coalesce(p_cancel_at_period_end, false)),
          'by', 'stripe', 'eventType', left(p_event_type, 100)));
      END IF;
      v_outcome := 'applied';
    END IF;
  END IF;

  INSERT INTO billing_events (company_id, provider, provider_event_id, event_type, outcome, subscription_status, plan, detail)
  VALUES (s.company_id, 'stripe', p_event_id, left(p_event_type, 100), v_outcome, p_status, p_plan, v_detail)
  ON CONFLICT (provider, provider_event_id) DO UPDATE
    SET company_id = EXCLUDED.company_id, outcome = EXCLUDED.outcome, subscription_status = EXCLUDED.subscription_status,
        plan = EXCLUDED.plan, detail = EXCLUDED.detail;
  RETURN jsonb_build_object('outcome', v_outcome, 'companyId', s.company_id);
END $$;
REVOKE ALL ON FUNCTION app_billing_apply_subscription(text, text, uuid, text, text, subscription_status, subscription_plan, text, timestamptz, timestamptz, boolean, timestamptz, timestamptz) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 3. Fin de la prueba: avisos de conservación de datos
-- ---------------------------------------------------------------------------
CREATE TABLE retention_notices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  stage            text NOT NULL,
  deletion_due_at  timestamptz NOT NULL,
  delivery         text NOT NULL,
  recipients       integer NOT NULL DEFAULT 0,
  created_at       timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT retention_notices_once UNIQUE (company_id, stage, deletion_due_at),
  CONSTRAINT retention_notices_stage CHECK (stage IN ('30_days', '7_days', '1_day')),
  CONSTRAINT retention_notices_delivery CHECK (delivery IN ('sent', 'not_configured', 'failed', 'no_recipients'))
);
ALTER TABLE retention_notices ENABLE ROW LEVEL SECURITY;
CREATE POLICY retention_notices_tenant_isolation ON retention_notices FOR ALL
  USING (company_id = (SELECT app_company_id())) WITH CHECK (company_id = (SELECT app_company_id()));

-- Empresas sin plan activo (candidatas a solo lectura y a avisos de conservación), con el
-- email de sus propietarios para avisarles. El acceso exacto lo decide domain/plans.ts.
CREATE FUNCTION app_retention_candidates() RETURNS TABLE (
  company_id uuid, company_name text, status text, trial_ends_at timestamptz,
  past_due_since timestamptz, ended_at timestamptz, created_at timestamptz, owner_emails text[]
)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT c.id, c.name::text, s.status::text, s.trial_ends_at, s.past_due_since, s.ended_at, c.created_at,
           coalesce((SELECT array_agg(u.email::text ORDER BY u.email) FROM memberships m JOIN users u ON u.id = m.user_id
                     WHERE m.company_id = c.id AND m.role = 'owner'), ARRAY[]::text[])
    FROM companies c JOIN subscriptions s ON s.company_id = c.id
    WHERE s.status <> 'active'
  $$;
REVOKE ALL ON FUNCTION app_retention_candidates() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 4. Supervisión: se añaden intentos y facturación (cifras agregadas, sin datos personales)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_ops_status() RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT jsonb_build_object(
      'automationCompanies', (SELECT count(*) FROM company_settings WHERE automation_enabled),
      'followUps', (
        SELECT jsonb_build_object(
          'dueNow', count(*) FILTER (WHERE status = 'pending' AND due_at <= now()),
          'dueApprovedOver15m', count(*) FILTER (WHERE status = 'pending' AND due_at <= now() - interval '15 minutes' AND approved_at IS NOT NULL),
          'sending', count(*) FILTER (WHERE status = 'sending'),
          'failedLast24h', count(*) FILTER (WHERE status = 'failed' AND updated_at > now() - interval '24 hours')
        ) FROM follow_ups WHERE source = 'rule'
      ),
      'deliveries', (
        SELECT jsonb_build_object(
          'stuckSending', count(*) FILTER (WHERE status = 'sending' AND created_at < now() - interval '15 minutes'),
          'unknownLast24h', count(*) FILTER (WHERE status = 'unknown' AND updated_at > now() - interval '24 hours'),
          'failedLast24h', count(*) FILTER (WHERE status = 'failed' AND failed_at > now() - interval '24 hours'),
          'sentLast24h', count(*) FILTER (WHERE sent_at > now() - interval '24 hours')
        ) FROM message_deliveries
      ),
      'jobs', (
        SELECT coalesce(jsonb_object_agg(job, jsonb_build_object('status', status, 'startedAt', started_at, 'finishedAt', finished_at)), '{}'::jsonb)
        FROM (SELECT DISTINCT ON (job) job, status, started_at, finished_at FROM job_runs ORDER BY job, started_at DESC) last
      ),
      'jobErrorsLast24h', (SELECT count(*) FROM job_runs WHERE status = 'error' AND started_at > now() - interval '24 hours'),
      'recoveries', (
        SELECT jsonb_build_object(
          'recordedLast30d', (SELECT count(*) FROM recovery_events WHERE status IN ('counted', 'recorded') AND registered_at > now() - interval '30 days'),
          'notCountedBackdatedLast30d', count(*) FILTER (WHERE metadata->>'reason' = 'response_dated_before_follow_up'),
          'companiesWithBackdatedLast30d', count(DISTINCT company_id) FILTER (WHERE metadata->>'reason' = 'response_dated_before_follow_up')
        ) FROM activity_log WHERE action = 'recovery.not_counted' AND created_at > now() - interval '30 days'
      ),
      'attempts', (
        SELECT jsonb_build_object(
          'countedLast24h', count(*) FILTER (WHERE status = 'counted' AND sent_at > now() - interval '24 hours'),
          'reservedOver15m', count(*) FILTER (WHERE status = 'reserved' AND reserved_at < now() - interval '15 minutes'),
          'unverifiedLast24h', count(*) FILTER (WHERE status = 'unverified' AND updated_at > now() - interval '24 hours')
        ) FROM attempt_events
      ),
      'billing', (
        SELECT jsonb_build_object(
          'errorsLast7d', count(*) FILTER (WHERE outcome = 'error' AND created_at > now() - interval '7 days'),
          'unmatchedLast7d', count(*) FILTER (WHERE outcome = 'unmatched' AND created_at > now() - interval '7 days'),
          'duplicateSubscriptionsLast30d', count(*) FILTER (WHERE outcome = 'duplicate_subscription' AND created_at > now() - interval '30 days'),
          'eventsLast24h', count(*) FILTER (WHERE created_at > now() - interval '24 hours')
        ) FROM billing_events
      )
    )
  $$;
REVOKE ALL ON FUNCTION app_ops_status() FROM PUBLIC;
