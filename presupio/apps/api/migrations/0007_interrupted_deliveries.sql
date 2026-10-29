-- =============================================================================
-- Presupio · 0007 · Envíos interrumpidos: sin fallos inventados ni reenvíos a ciegas
-- -----------------------------------------------------------------------------
-- 1. provider_call_started_at: se anota JUSTO ANTES de llamar al proveedor. Si el proceso o la
--    base de datos fallan después de reclamar un envío:
--      - sin marca  → el proveedor nunca se llamó: se puede devolver a la cola sin riesgo;
--      - con marca  → puede haber salido: «resultado desconocido», sin cobrar ni reenviar,
--                     hasta reconciliarlo con el proveedor o revisarlo a mano.
-- 2. Revisión manual auditable (quién, cuándo y con qué resultado).
-- 3. Un intento «sin verificar» puede pasar a contado (se demuestra que salió) o a liberado
--    (se demuestra que no salió). Lo contado sigue sin poder deshacerse.
-- Compatible con los datos existentes: solo añade columnas y amplía restricciones.
-- =============================================================================

ALTER TABLE message_deliveries
  ADD COLUMN provider_call_started_at  timestamptz,
  ADD COLUMN reviewed_at               timestamptz,
  ADD COLUMN reviewed_by_user_id       uuid REFERENCES users (id) ON DELETE SET NULL,
  -- sent / not_sent: lo decide una persona · provider_sent / provider_not_sent: lo confirma el proveedor.
  ADD COLUMN review_outcome            text,
  ADD CONSTRAINT message_deliveries_review_outcome
    CHECK (review_outcome IS NULL OR review_outcome IN ('sent', 'not_sent', 'provider_sent', 'provider_not_sent')),
  ADD CONSTRAINT message_deliveries_review_consistency CHECK ((review_outcome IS NULL) = (reviewed_at IS NULL));

ALTER TABLE follow_ups DROP CONSTRAINT follow_ups_automatic_statuses;
ALTER TABLE follow_ups ADD CONSTRAINT follow_ups_automatic_statuses
  CHECK (status NOT IN ('sending', 'sent', 'failed', 'unknown') OR source = 'rule');

-- Transiciones de intentos: se añaden unverified → counted | released.
CREATE OR REPLACE FUNCTION attempt_events_guard() RETURNS trigger
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
     OR (OLD.status = 'released' AND NEW.status = 'reserved')
     OR (OLD.status = 'unverified' AND NEW.status IN ('counted', 'released')) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Cambio de estado de intento no permitido: % → %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
END $$;

-- Supervisión: envíos de resultado desconocido pendientes de revisión.
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
          'unknownPendingReview', count(*) FILTER (WHERE status = 'unknown' AND reviewed_at IS NULL),
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

-- Empresas con envíos de resultado desconocido aún sin revisar (reconciliación con el proveedor).
CREATE FUNCTION app_companies_with_unknown_deliveries() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT DISTINCT company_id FROM message_deliveries WHERE status = 'unknown' AND reviewed_at IS NULL $$;
REVOKE ALL ON FUNCTION app_companies_with_unknown_deliveries() FROM PUBLIC;
