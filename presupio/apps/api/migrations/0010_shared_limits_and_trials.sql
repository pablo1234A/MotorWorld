-- =============================================================================
-- Presupio · 0010 · Límites de peticiones compartidos, abuso de la prueba y avisos
-- -----------------------------------------------------------------------------
-- 1. rate_limit_counters: contadores de los límites de peticiones en PostgreSQL. Así son los
--    mismos en todas las instancias de la API y sobreviven a los reinicios. La clave se
--    guarda resumida (SHA-256): ni IPs ni emails en claro.
-- 2. trial_claims: huellas (SHA-256) de las direcciones y dominios que ya disfrutaron de la
--    prueba gratuita. Sin datos personales en claro; se conservan 24 meses.
-- 3. trial_notices: avisos previos al fin de la prueba (distintos de los de conservación).
-- =============================================================================

CREATE TABLE rate_limit_counters (
  key_hash   text PRIMARY KEY,
  hits       integer NOT NULL,
  reset_at   timestamptz NOT NULL,
  CONSTRAINT rate_limit_counters_key CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT rate_limit_counters_hits CHECK (hits >= 0)
);
CREATE INDEX rate_limit_counters_reset_idx ON rate_limit_counters (reset_at);

CREATE TABLE trial_claims (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- email: dirección normalizada · domain: dominio de empresa (no los de correo gratuito)
  kind        text NOT NULL,
  value_hash  text NOT NULL,
  company_id  uuid REFERENCES companies (id) ON DELETE SET NULL,
  claimed_at  timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT trial_claims_kind CHECK (kind IN ('email', 'domain')),
  CONSTRAINT trial_claims_hash CHECK (value_hash ~ '^[0-9a-f]{64}$')
);
CREATE INDEX trial_claims_lookup_idx ON trial_claims (kind, value_hash, claimed_at DESC);
-- Cada empresa solo ve (y crea) sus huellas; la comprobación entre empresas se hace con la
-- función acotada app_trial_claimed, que solo responde sí o no.
ALTER TABLE trial_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY trial_claims_tenant_isolation ON trial_claims FOR ALL
  USING (company_id = (SELECT app_company_id())) WITH CHECK (company_id = (SELECT app_company_id()));

CREATE FUNCTION app_trial_claimed(p_kind text, p_hashes text[], p_since timestamptz) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT EXISTS (SELECT 1 FROM trial_claims WHERE kind = p_kind AND value_hash = ANY (p_hashes) AND claimed_at >= p_since)
  $$;
REVOKE ALL ON FUNCTION app_trial_claimed(text, text[], timestamptz) FROM PUBLIC;

-- Las empresas que ya tienen o tuvieron prueba dejan su huella (normalización simple aquí:
-- minúsculas; las nuevas altas aplican la normalización completa del servidor).
INSERT INTO trial_claims (kind, value_hash, company_id, claimed_at)
SELECT 'email', encode(sha256(convert_to('presupio-trial:email:' || lower(u.email), 'UTF8')), 'hex'), m.company_id, c.created_at
FROM companies c
JOIN subscriptions s ON s.company_id = c.id
JOIN memberships m ON m.company_id = c.id AND m.role = 'owner'
JOIN users u ON u.id = m.user_id
WHERE s.trial_ends_at IS NOT NULL;

CREATE TABLE trial_notices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  stage           text NOT NULL,
  trial_ends_at   timestamptz NOT NULL,
  delivery        text NOT NULL,
  recipients      integer NOT NULL DEFAULT 0,
  created_at      timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT trial_notices_once UNIQUE (company_id, stage, trial_ends_at),
  CONSTRAINT trial_notices_stage CHECK (stage ~ '^[0-9]{1,2}_days?$'),
  CONSTRAINT trial_notices_delivery CHECK (delivery IN ('sent', 'not_configured', 'failed', 'no_recipients'))
);
ALTER TABLE trial_notices ENABLE ROW LEVEL SECURITY;
CREATE POLICY trial_notices_tenant_isolation ON trial_notices FOR ALL
  USING (company_id = (SELECT app_company_id())) WITH CHECK (company_id = (SELECT app_company_id()));

-- Pruebas que terminan pronto, sin suscripción de pago viva (para avisar a los propietarios).
CREATE FUNCTION app_trial_reminder_candidates(p_until timestamptz) RETURNS TABLE (
  company_id uuid, company_name text, timezone text, trial_ends_at timestamptz, owner_emails text[]
)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT c.id, c.name::text, c.timezone::text, s.trial_ends_at,
           coalesce((SELECT array_agg(u.email::text ORDER BY u.email) FROM memberships m JOIN users u ON u.id = m.user_id
                     WHERE m.company_id = c.id AND m.role = 'owner'), ARRAY[]::text[])
    FROM companies c JOIN subscriptions s ON s.company_id = c.id
    WHERE s.status = 'trialing' AND s.trial_ends_at > now() AND s.trial_ends_at <= p_until
      AND (s.provider_subscription_id IS NULL OR s.ended_at IS NOT NULL)
  $$;
REVOKE ALL ON FUNCTION app_trial_reminder_candidates(timestamptz) FROM PUBLIC;

-- Avisos de conservación: se añade la zona horaria de la empresa (antes: siempre Madrid).
DROP FUNCTION app_retention_candidates();
CREATE FUNCTION app_retention_candidates() RETURNS TABLE (
  company_id uuid, company_name text, status text, trial_ends_at timestamptz,
  past_due_since timestamptz, ended_at timestamptz, created_at timestamptz, owner_emails text[], timezone text
)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT c.id, c.name::text, s.status::text, s.trial_ends_at, s.past_due_since, s.ended_at, c.created_at,
           coalesce((SELECT array_agg(u.email::text ORDER BY u.email) FROM memberships m JOIN users u ON u.id = m.user_id
                     WHERE m.company_id = c.id AND m.role = 'owner'), ARRAY[]::text[]),
           c.timezone::text
    FROM companies c JOIN subscriptions s ON s.company_id = c.id
    WHERE s.status <> 'active'
  $$;
REVOKE ALL ON FUNCTION app_retention_candidates() FROM PUBLIC;

-- Las huellas de la prueba se conservan 24 meses (la aplicación no puede borrarlas directamente).
CREATE FUNCTION app_purge_trial_claims(p_before timestamptz) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    DECLARE n integer;
    BEGIN
      DELETE FROM trial_claims WHERE claimed_at < p_before;
      GET DIAGNOSTICS n = ROW_COUNT;
      RETURN n;
    END
  $$;
REVOKE ALL ON FUNCTION app_purge_trial_claims(timestamptz) FROM PUBLIC;
