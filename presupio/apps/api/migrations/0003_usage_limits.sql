-- =============================================================================
-- Presupio · 0003 · Recuperaciones, límites de los planes y supervisión
-- -----------------------------------------------------------------------------
-- Una «recuperación» (docs/limites-y-metricas.md) es un presupuesto que estaba enviado
-- sin respuesta, recibió un seguimiento realizado y verificable (contacto manual
-- registrado como hecho o email automático aceptado por el proveedor) y cuyo cliente
-- respondió en los 30 días siguientes a ese seguimiento. Cuenta UNA vez por presupuesto,
-- en el periodo de facturación en que se registra.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Periodos de uso: un contador por empresa y periodo de facturación
-- ---------------------------------------------------------------------------
CREATE TABLE usage_periods (
  company_id             uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  period_start           timestamptz NOT NULL,
  period_end             timestamptz NOT NULL,
  -- De dónde sale el periodo: mes natural (sin proveedor de pagos) o periodo del proveedor (fase 5).
  period_source          text NOT NULL DEFAULT 'calendar_month',
  plan                   subscription_plan,
  recovery_limit         integer NOT NULL,
  recoveries_counted     integer NOT NULL DEFAULT 0,
  recoveries_over_limit  integer NOT NULL DEFAULT 0,
  limit_reached_at       timestamptz,
  created_at             timestamptz(3) NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, period_start),
  CONSTRAINT usage_periods_range CHECK (period_start < period_end),
  CONSTRAINT usage_periods_source CHECK (period_source IN ('calendar_month', 'provider')),
  CONSTRAINT usage_periods_limit CHECK (recovery_limit >= 0),
  -- Garantía en la base de datos: nunca se cuentan más recuperaciones que el límite.
  CONSTRAINT usage_periods_within_limit CHECK (recoveries_counted BETWEEN 0 AND recovery_limit),
  CONSTRAINT usage_periods_over_limit CHECK (recoveries_over_limit >= 0)
);
CREATE INDEX usage_periods_company_end_idx ON usage_periods (company_id, period_end DESC);
CREATE TRIGGER usage_periods_updated_at BEFORE UPDATE ON usage_periods FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Recuperaciones: un registro por presupuesto, con el seguimiento que la precede
-- ---------------------------------------------------------------------------
CREATE TABLE recovery_events (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  quote_id               uuid NOT NULL,
  follow_up_id           uuid,
  follow_up_source       follow_up_source,
  follow_up_channel      follow_up_channel,
  follow_up_at           timestamptz,
  responded_at           timestamptz NOT NULL,
  -- Respuesta o venta: con qué estado se registró la respuesta.
  response_status        quote_status NOT NULL,
  registered_at          timestamptz(3) NOT NULL DEFAULT now(),
  registered_by_user_id  uuid REFERENCES users (id) ON DELETE SET NULL,
  -- counted: consume del plan · over_limit: límite alcanzado (no consume) ·
  -- no_active_plan: sin plan activo (no consume) · historical: anterior a la medición (no consume).
  status                 text NOT NULL,
  period_start           timestamptz,
  CONSTRAINT recovery_events_one_per_quote UNIQUE (company_id, quote_id),
  CONSTRAINT recovery_events_quote_fk FOREIGN KEY (company_id, quote_id) REFERENCES quotes (company_id, id) ON DELETE CASCADE,
  CONSTRAINT recovery_events_follow_up_fk FOREIGN KEY (company_id, follow_up_id) REFERENCES follow_ups (company_id, id) ON DELETE CASCADE,
  CONSTRAINT recovery_events_period_fk FOREIGN KEY (company_id, period_start) REFERENCES usage_periods (company_id, period_start) ON DELETE CASCADE,
  CONSTRAINT recovery_events_status CHECK (status IN ('counted', 'over_limit', 'no_active_plan', 'historical')),
  CONSTRAINT recovery_events_period_required CHECK ((status IN ('counted', 'over_limit')) = (period_start IS NOT NULL)),
  CONSTRAINT recovery_events_follow_up_required CHECK (status = 'historical' OR (follow_up_id IS NOT NULL AND follow_up_at IS NOT NULL)),
  CONSTRAINT recovery_events_order CHECK (follow_up_at IS NULL OR follow_up_at <= responded_at),
  CONSTRAINT recovery_events_response_status CHECK (response_status IN ('responded', 'accepted'))
);
CREATE INDEX recovery_events_company_registered_idx ON recovery_events (company_id, registered_at DESC);
CREATE INDEX recovery_events_period_idx ON recovery_events (company_id, period_start) WHERE period_start IS NOT NULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['usage_periods', 'recovery_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (company_id = (SELECT app_company_id())) WITH CHECK (company_id = (SELECT app_company_id()))',
      t || '_tenant_isolation', t
    );
  END LOOP;
END $$;

-- Las reactivaciones registradas antes de existir la medición se conservan como históricas:
-- aparecen en las métricas, pero no consumen el plan de ningún periodo.
INSERT INTO recovery_events (
  company_id, quote_id, follow_up_id, follow_up_source, follow_up_channel, follow_up_at,
  responded_at, response_status, registered_at, registered_by_user_id, status, period_start
)
SELECT q.company_id, q.id, f.id, f.source, f.channel, f.done_at,
       q.reactivated_at, CASE WHEN q.status = 'accepted' THEN 'accepted'::quote_status ELSE 'responded'::quote_status END,
       q.reactivated_at, NULL, 'historical', NULL
FROM quotes q
LEFT JOIN LATERAL (
  SELECT fu.id, fu.source, fu.channel, COALESCE(fu.completed_at, fu.sent_at) AS done_at
  FROM follow_ups fu
  WHERE fu.company_id = q.company_id AND fu.quote_id = q.id AND fu.channel <> 'task'
    AND ((fu.status = 'completed' AND fu.completed_at <= q.reactivated_at) OR (fu.status = 'sent' AND fu.sent_at <= q.reactivated_at))
  ORDER BY COALESCE(fu.completed_at, fu.sent_at) DESC
  LIMIT 1
) f ON true
WHERE q.reactivated_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Supervisión: solo cifras agregadas de todas las empresas (sin datos personales)
-- ---------------------------------------------------------------------------
CREATE FUNCTION app_ops_status() RETURNS jsonb
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
      'jobErrorsLast24h', (SELECT count(*) FROM job_runs WHERE status = 'error' AND started_at > now() - interval '24 hours')
    )
  $$;
REVOKE ALL ON FUNCTION app_ops_status() FROM PUBLIC;
