-- Presupio · Migración 0002: motor de seguimiento automático (fase 3)
--
--  * Reglas: calendario configurable de días tras el envío (por defecto 3, 7 y 14),
--    en lugar de "primer seguimiento + intervalo × máximo".
--  * Activación explícita del envío automático por la empresa (quién y cuándo), con
--    remitente, dirección de respuesta y base legal documentada.
--  * Estados de seguimiento: se añaden 'sending', 'sent' y 'failed'.
--  * Plantillas versionadas, registro de cada intento de envío, eventos de webhooks y
--    ejecuciones de trabajos.

-- ---------------------------------------------------------------------------
-- Reglas de seguimiento
-- ---------------------------------------------------------------------------

CREATE FUNCTION app_is_valid_schedule(days smallint[]) RETURNS boolean
  LANGUAGE sql IMMUTABLE
  AS $$
    SELECT cardinality(days) BETWEEN 1 AND 6
      AND NOT EXISTS (SELECT 1 FROM unnest(days) d WHERE d IS NULL OR d < 1 OR d > 180)
      AND NOT EXISTS (
        SELECT 1 FROM generate_subscripts(days, 1) i
        WHERE i > 1 AND days[i] <= days[i - 1]
      )
  $$;

ALTER TABLE company_settings ADD COLUMN follow_up_schedule_days smallint[] NOT NULL DEFAULT '{3,7,14}';

-- Conversión de las reglas existentes. Las empresas con los valores por defecto de la
-- fase 1 (3, 4, 3) pasan al calendario de referencia 3, 7 y 14 días.
UPDATE company_settings
SET follow_up_schedule_days = CASE
  WHEN first_follow_up_after_days = 3 AND follow_up_interval_days = 4 AND max_follow_ups = 3 THEN '{3,7,14}'::smallint[]
  WHEN max_follow_ups < 1 THEN ARRAY[LEAST(first_follow_up_after_days, 180)]::smallint[]
  ELSE ARRAY(
    SELECT LEAST(first_follow_up_after_days + follow_up_interval_days * k, 180)::smallint
    FROM generate_series(0, LEAST(max_follow_ups, 6) - 1) AS k
  )
END;
-- Si el recorte a 180 días generase valores repetidos, se usa el calendario de referencia.
UPDATE company_settings SET follow_up_schedule_days = '{3,7,14}' WHERE NOT app_is_valid_schedule(follow_up_schedule_days);

ALTER TABLE company_settings
  DROP COLUMN first_follow_up_after_days,
  DROP COLUMN follow_up_interval_days,
  DROP COLUMN max_follow_ups,
  ADD CONSTRAINT company_settings_schedule CHECK (app_is_valid_schedule(follow_up_schedule_days)),
  ADD COLUMN automation_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN automation_enabled_at timestamptz,
  ADD COLUMN automation_enabled_by_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN sender_name text,
  ADD COLUMN reply_to_email text,
  ADD CONSTRAINT company_settings_sender_name CHECK (sender_name IS NULL OR length(btrim(sender_name)) BETWEEN 1 AND 80),
  ADD CONSTRAINT company_settings_reply_to CHECK (
    reply_to_email IS NULL OR (reply_to_email = lower(reply_to_email) AND reply_to_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  ),
  -- No se puede activar el envío sin dirección de respuesta, base legal documentada y autorización registrada.
  ADD CONSTRAINT company_settings_automation_requirements CHECK (
    NOT automation_enabled OR (
      reply_to_email IS NOT NULL
      AND legal_basis_note IS NOT NULL AND length(btrim(legal_basis_note)) >= 20
      AND automation_enabled_at IS NOT NULL
    )
  );

-- Permite excluir un presupuesto concreto del seguimiento automático.
ALTER TABLE quotes ADD COLUMN auto_follow_up_enabled boolean NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- Plantillas versionadas (una versión nunca se modifica: editar crea otra)
-- ---------------------------------------------------------------------------

CREATE TABLE message_template_versions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  step                smallint NOT NULL,
  version             integer NOT NULL,
  subject             text NOT NULL,
  body                text NOT NULL,
  created_by_user_id  uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at          timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT message_template_versions_company_id_key UNIQUE (company_id, id),
  CONSTRAINT message_template_versions_step_version_key UNIQUE (company_id, step, version),
  CONSTRAINT message_template_versions_step CHECK (step BETWEEN 1 AND 6),
  CONSTRAINT message_template_versions_version CHECK (version >= 1),
  CONSTRAINT message_template_versions_subject CHECK (length(btrim(subject)) BETWEEN 1 AND 200 AND subject !~ '[\r\n]'),
  CONSTRAINT message_template_versions_body CHECK (length(btrim(body)) BETWEEN 1 AND 5000)
);

-- ---------------------------------------------------------------------------
-- Seguimientos: nuevos estados y datos del paso automático
-- ---------------------------------------------------------------------------

-- Los valores nuevos de un ENUM no pueden usarse en la misma transacción en que se
-- añaden, así que se sustituye el tipo (y se recrean sus índices y restricciones).
DROP INDEX follow_ups_pending_due_idx;
DROP INDEX follow_ups_assigned_idx;
ALTER TABLE follow_ups
  DROP CONSTRAINT follow_ups_completed_consistency,
  DROP CONSTRAINT follow_ups_cancelled_consistency,
  DROP CONSTRAINT follow_ups_outcome_only_completed,
  ALTER COLUMN status DROP DEFAULT;
ALTER TYPE follow_up_status RENAME TO follow_up_status_v1;
CREATE TYPE follow_up_status AS ENUM ('pending', 'sending', 'sent', 'completed', 'failed', 'cancelled');
ALTER TABLE follow_ups ALTER COLUMN status TYPE follow_up_status USING status::text::follow_up_status;
ALTER TABLE follow_ups ALTER COLUMN status SET DEFAULT 'pending';
DROP TYPE follow_up_status_v1;

ALTER TABLE follow_ups
  ADD COLUMN sequence_step smallint,
  ADD COLUMN sequence_key text,
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN approved_by_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN approved_template_version_id uuid,
  ADD COLUMN approved_subject text,
  ADD COLUMN approved_body text,
  ADD COLUMN attempt_count smallint NOT NULL DEFAULT 0,
  ADD COLUMN sent_at timestamptz,
  ADD COLUMN failure_reason text,
  ADD CONSTRAINT follow_ups_approved_template_fk FOREIGN KEY (company_id, approved_template_version_id)
    REFERENCES message_template_versions (company_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT follow_ups_completed_consistency CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
  ADD CONSTRAINT follow_ups_cancelled_consistency CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
  ADD CONSTRAINT follow_ups_outcome_only_completed CHECK (outcome IS NULL OR status = 'completed'),
  -- "Enviado" solo con confirmación del proveedor (sent_at), y solo para pasos automáticos.
  ADD CONSTRAINT follow_ups_sent_consistency CHECK ((status = 'sent') = (sent_at IS NOT NULL)),
  ADD CONSTRAINT follow_ups_failed_reason CHECK (status <> 'failed' OR failure_reason IS NOT NULL),
  ADD CONSTRAINT follow_ups_automatic_statuses CHECK (status NOT IN ('sending', 'sent', 'failed') OR source = 'rule'),
  ADD CONSTRAINT follow_ups_rule_sequence CHECK (source <> 'rule' OR (sequence_step IS NOT NULL AND sequence_key IS NOT NULL AND dedupe_key IS NOT NULL)),
  ADD CONSTRAINT follow_ups_rule_is_email CHECK (source <> 'rule' OR channel = 'email'),
  ADD CONSTRAINT follow_ups_approval_rule_only CHECK (approved_at IS NULL OR source = 'rule'),
  ADD CONSTRAINT follow_ups_approval_snapshot CHECK (
    (approved_at IS NULL) = (approved_subject IS NULL AND approved_body IS NULL AND approved_template_version_id IS NULL)
  ),
  ADD CONSTRAINT follow_ups_attempts CHECK (attempt_count BETWEEN 0 AND 10),
  ADD CONSTRAINT follow_ups_failure_reason_length CHECK (failure_reason IS NULL OR length(failure_reason) <= 200);

CREATE INDEX follow_ups_pending_due_idx ON follow_ups (company_id, due_at) WHERE status = 'pending';
CREATE INDEX follow_ups_assigned_idx ON follow_ups (company_id, assigned_user_id) WHERE status = 'pending';
CREATE INDEX follow_ups_dispatch_idx ON follow_ups (company_id, due_at) WHERE status = 'pending' AND source = 'rule';
-- Como máximo un paso automático en curso por presupuesto: nunca dos mensajes a la vez.
CREATE UNIQUE INDEX follow_ups_one_active_rule_step ON follow_ups (company_id, quote_id)
  WHERE source = 'rule' AND status IN ('pending', 'sending');

-- ---------------------------------------------------------------------------
-- Intentos de envío (trazabilidad)
-- ---------------------------------------------------------------------------

CREATE TYPE delivery_status AS ENUM ('sending', 'sent', 'delivered', 'failed', 'unknown');

CREATE TABLE message_deliveries (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  follow_up_id            uuid NOT NULL,
  quote_id                uuid NOT NULL,
  contact_id              uuid NOT NULL,
  channel                 contact_channel NOT NULL,
  provider                text NOT NULL,
  template_version_id     uuid,
  template_step           smallint,
  template_version        integer,
  attempt_number          smallint NOT NULL,
  status                  delivery_status NOT NULL DEFAULT 'sending',
  recipient               text NOT NULL,
  -- Contenido enviado, para auditoría. Se purga al cumplir el plazo de conservación.
  subject                 text,
  body_text               text,
  content_purged_at       timestamptz,
  provider_message_id     text,
  error_code              text,
  error_detail            text,
  unsubscribe_token_hash  text,
  created_at              timestamptz(3) NOT NULL DEFAULT now(),
  sent_at                 timestamptz,
  delivered_at            timestamptz,
  failed_at               timestamptz,
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_deliveries_follow_up_fk FOREIGN KEY (company_id, follow_up_id)
    REFERENCES follow_ups (company_id, id) ON DELETE CASCADE,
  CONSTRAINT message_deliveries_quote_fk FOREIGN KEY (company_id, quote_id)
    REFERENCES quotes (company_id, id) ON DELETE CASCADE,
  CONSTRAINT message_deliveries_contact_fk FOREIGN KEY (company_id, contact_id)
    REFERENCES contacts (company_id, id) ON DELETE CASCADE,
  CONSTRAINT message_deliveries_template_fk FOREIGN KEY (company_id, template_version_id)
    REFERENCES message_template_versions (company_id, id) ON DELETE RESTRICT,
  -- Un intento por número: dos procesos no pueden registrar el mismo envío.
  CONSTRAINT message_deliveries_attempt_key UNIQUE (follow_up_id, attempt_number),
  CONSTRAINT message_deliveries_attempt CHECK (attempt_number BETWEEN 1 AND 10),
  CONSTRAINT message_deliveries_channel CHECK (channel = 'email'),
  CONSTRAINT message_deliveries_sent CHECK (status NOT IN ('sent', 'delivered') OR sent_at IS NOT NULL),
  CONSTRAINT message_deliveries_delivered CHECK (status <> 'delivered' OR delivered_at IS NOT NULL),
  CONSTRAINT message_deliveries_failed CHECK (status <> 'failed' OR (failed_at IS NOT NULL AND error_code IS NOT NULL)),
  CONSTRAINT message_deliveries_error_detail CHECK (error_detail IS NULL OR length(error_detail) <= 500),
  CONSTRAINT message_deliveries_token_format CHECK (unsubscribe_token_hash IS NULL OR unsubscribe_token_hash ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX message_deliveries_provider_message_key ON message_deliveries (provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;
CREATE UNIQUE INDEX message_deliveries_unsubscribe_key ON message_deliveries (unsubscribe_token_hash)
  WHERE unsubscribe_token_hash IS NOT NULL;
CREATE INDEX message_deliveries_follow_up_idx ON message_deliveries (company_id, follow_up_id);
CREATE INDEX message_deliveries_quote_idx ON message_deliveries (company_id, quote_id, created_at DESC);
CREATE INDEX message_deliveries_stuck_idx ON message_deliveries (created_at) WHERE status = 'sending';
CREATE INDEX message_deliveries_content_idx ON message_deliveries (created_at) WHERE content_purged_at IS NULL;
CREATE TRIGGER message_deliveries_updated_at BEFORE UPDATE ON message_deliveries FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Eventos de webhooks (antirrepetición) y ejecuciones de trabajos. Sin datos de clientes.
-- ---------------------------------------------------------------------------

CREATE TABLE webhook_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider     text NOT NULL,
  token_hash   text NOT NULL,
  event_type   text NOT NULL,
  delivery_id  uuid,
  received_at  timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT webhook_events_token_key UNIQUE (provider, token_hash),
  CONSTRAINT webhook_events_token_format CHECK (token_hash ~ '^[0-9a-f]{64}$')
);
CREATE INDEX webhook_events_received_idx ON webhook_events (received_at);

CREATE TABLE job_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job          text NOT NULL,
  status       text NOT NULL DEFAULT 'running',
  started_at   timestamptz(3) NOT NULL DEFAULT now(),
  finished_at  timestamptz(3),
  stats        jsonb NOT NULL DEFAULT '{}'::jsonb,
  error        text,
  CONSTRAINT job_runs_status CHECK (status IN ('running', 'ok', 'error', 'skipped')),
  CONSTRAINT job_runs_error_length CHECK (error IS NULL OR length(error) <= 500)
);
CREATE INDEX job_runs_job_started_idx ON job_runs (job, started_at DESC);

-- ---------------------------------------------------------------------------
-- Row-Level Security de las tablas nuevas con datos de empresa
-- ---------------------------------------------------------------------------

ALTER TABLE message_template_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY message_template_versions_tenant_isolation ON message_template_versions FOR ALL
  USING (company_id = (SELECT app_company_id())) WITH CHECK (company_id = (SELECT app_company_id()));

ALTER TABLE message_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY message_deliveries_tenant_isolation ON message_deliveries FOR ALL
  USING (company_id = (SELECT app_company_id())) WITH CHECK (company_id = (SELECT app_company_id()));

-- ---------------------------------------------------------------------------
-- Consultas acotadas entre empresas (solo devuelven identificadores)
-- ---------------------------------------------------------------------------

-- Empresas con el envío automático activado (el proceso de trabajos las recorre una a una).
CREATE FUNCTION app_automation_company_ids() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT company_id FROM company_settings WHERE automation_enabled $$;
REVOKE ALL ON FUNCTION app_automation_company_ids() FROM PUBLIC;

-- Enlace de baja: localizar el envío a partir del hash de su token.
CREATE FUNCTION app_find_delivery_by_unsubscribe_hash(p_hash text)
  RETURNS TABLE (delivery_id uuid, company_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT d.id, d.company_id FROM message_deliveries d WHERE d.unsubscribe_token_hash = p_hash $$;
REVOKE ALL ON FUNCTION app_find_delivery_by_unsubscribe_hash(text) FROM PUBLIC;

-- Webhooks del proveedor (tras verificar su firma): localizar el envío.
CREATE FUNCTION app_find_delivery_for_webhook(p_provider text, p_message_id text, p_delivery_id uuid)
  RETURNS TABLE (delivery_id uuid, company_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT d.id, d.company_id FROM message_deliveries d
    WHERE d.provider = p_provider
      AND ((p_message_id IS NOT NULL AND d.provider_message_id = p_message_id) OR (p_delivery_id IS NOT NULL AND d.id = p_delivery_id))
    LIMIT 1
  $$;
REVOKE ALL ON FUNCTION app_find_delivery_for_webhook(text, text, uuid) FROM PUBLIC;

-- Recuperación tras reinicios: empresas con envíos "en curso" más antiguos que el límite.
CREATE FUNCTION app_companies_with_stuck_deliveries(p_older_than timestamptz) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT DISTINCT company_id FROM message_deliveries WHERE status = 'sending' AND created_at < p_older_than $$;
REVOKE ALL ON FUNCTION app_companies_with_stuck_deliveries(timestamptz) FROM PUBLIC;

-- Conservación: borra el contenido (asunto y cuerpo) de los envíos anteriores al corte.
-- Los metadatos (fechas, estado, proveedor) se conservan para la trazabilidad.
CREATE FUNCTION app_purge_delivery_content(p_cutoff timestamptz) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE message_deliveries
  SET subject = NULL, body_text = NULL, content_purged_at = now()
  WHERE content_purged_at IS NULL AND created_at < p_cutoff AND status <> 'sending';
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END
$$;
REVOKE ALL ON FUNCTION app_purge_delivery_content(timestamptz) FROM PUBLIC;
