-- =============================================================================
-- Presupio · 0004 · Integridad del conteo de recuperaciones
-- -----------------------------------------------------------------------------
-- 1. Los contadores de un periodo solo pueden subir, y la empresa y las fechas de un
--    periodo no cambian. Solo el propietario del esquema (herramienta de operación, para
--    correcciones de soporte) puede saltarse esta regla; el rol de la aplicación nunca.
-- 2. La supervisión agregada cuenta las respuestas no contabilizadas por estar fechadas antes
--    de un seguimiento ya registrado, para que el personal autorizado pueda revisarlas.
-- Compatible con los datos existentes: no modifica tablas ni filas.
-- =============================================================================

CREATE FUNCTION usage_periods_guard() RETURNS trigger
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
  RETURN NEW;
END $$;

CREATE TRIGGER usage_periods_guard BEFORE UPDATE ON usage_periods FOR EACH ROW EXECUTE FUNCTION usage_periods_guard();

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
          'countedLast30d', (SELECT count(*) FROM recovery_events WHERE status = 'counted' AND registered_at > now() - interval '30 days'),
          'notCountedBackdatedLast30d', count(*) FILTER (WHERE metadata->>'reason' = 'response_dated_before_follow_up'),
          'companiesWithBackdatedLast30d', count(DISTINCT company_id) FILTER (WHERE metadata->>'reason' = 'response_dated_before_follow_up')
        ) FROM activity_log WHERE action = 'recovery.not_counted' AND created_at > now() - interval '30 days'
      )
    )
  $$;
REVOKE ALL ON FUNCTION app_ops_status() FROM PUBLIC;
