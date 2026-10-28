-- Presupio · Migración inicial
-- Núcleo multiempresa: identidad, empresas, membresías, presupuestos, contactos,
-- seguimientos, exclusiones, actividad, configuración y suscripción.
--
-- Principios:
--  * Toda tabla con datos de cliente lleva company_id NOT NULL.
--  * Las relaciones entre tablas de una empresa usan claves foráneas compuestas
--    (company_id, id) para que la base de datos impida enlazar datos de dos empresas.
--  * Row-Level Security (RLS) filtra por la empresa activa de la transacción
--    (app.company_id). Si no hay empresa activa, no se ve ni se escribe nada.
--  * Requiere PostgreSQL 15+ (ON DELETE SET NULL con lista de columnas).

-- ---------------------------------------------------------------------------
-- Funciones auxiliares
-- ---------------------------------------------------------------------------

CREATE FUNCTION app_company_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.company_id', true), '')::uuid $$;

CREATE FUNCTION app_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

CREATE FUNCTION set_updated_at() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------

CREATE TYPE membership_role AS ENUM ('owner', 'admin', 'member', 'viewer');
CREATE TYPE user_token_purpose AS ENUM ('password_reset', 'email_verification');
CREATE TYPE quote_status AS ENUM ('draft', 'sent', 'responded', 'accepted', 'rejected');
CREATE TYPE contact_channel AS ENUM ('email', 'phone', 'whatsapp', 'sms');
CREATE TYPE follow_up_channel AS ENUM ('task', 'email', 'phone', 'whatsapp', 'sms', 'in_person');
CREATE TYPE follow_up_status AS ENUM ('pending', 'completed', 'cancelled');
CREATE TYPE follow_up_outcome AS ENUM ('no_answer', 'left_message', 'contacted', 'responded', 'wrong_contact', 'other');
CREATE TYPE follow_up_source AS ENUM ('manual', 'rule');
CREATE TYPE exclusion_reason AS ENUM ('opt_out_request', 'rejected', 'legal', 'bounced', 'manual');
CREATE TYPE subscription_plan AS ENUM ('starter', 'pro', 'business');
CREATE TYPE subscription_status AS ENUM ('none', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete');

-- ---------------------------------------------------------------------------
-- Identidad (global, sin RLS: solo la usa el código de autenticación)
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             text NOT NULL,
  full_name         text NOT NULL,
  password_hash     text NOT NULL,
  email_verified_at timestamptz,
  terms_accepted_at timestamptz NOT NULL,
  last_login_at     timestamptz,
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz(3) NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_lowercase CHECK (email = lower(email)),
  CONSTRAINT users_email_format CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND length(email) <= 254),
  CONSTRAINT users_full_name_length CHECK (length(btrim(full_name)) BETWEEN 1 AND 120)
);
CREATE UNIQUE INDEX users_email_key ON users (email);
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Tokens de un solo uso (recuperación de contraseña, verificación de email).
-- Solo se guarda el hash SHA-256 del token, nunca el token.
CREATE TABLE user_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose     user_token_purpose NOT NULL,
  token_hash  text NOT NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT user_tokens_hash_format CHECK (token_hash ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX user_tokens_token_hash_key ON user_tokens (token_hash);
CREATE INDEX user_tokens_user_purpose_idx ON user_tokens (user_id, purpose) WHERE used_at IS NULL;

-- ---------------------------------------------------------------------------
-- Empresas y membresías
-- ---------------------------------------------------------------------------

CREATE TABLE companies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  legal_name  text,
  tax_id      text,
  phone       text,
  website     text,
  country     char(2) NOT NULL DEFAULT 'ES',
  timezone    text NOT NULL DEFAULT 'Europe/Madrid',
  locale      text NOT NULL DEFAULT 'es-ES',
  currency    char(3) NOT NULL DEFAULT 'EUR',
  created_at  timestamptz(3) NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT companies_name_length CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT companies_country_format CHECK (country ~ '^[A-Z]{2}$'),
  CONSTRAINT companies_currency_format CHECK (currency ~ '^[A-Z]{3}$')
);
CREATE TRIGGER companies_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE memberships (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role        membership_role NOT NULL,
  created_at  timestamptz(3) NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memberships_company_user_key UNIQUE (company_id, user_id)
);
CREATE INDEX memberships_user_idx ON memberships (user_id);
CREATE TRIGGER memberships_updated_at BEFORE UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE invitations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  email               text NOT NULL,
  role                membership_role NOT NULL,
  token_hash          text NOT NULL,
  invited_by_user_id  uuid REFERENCES users (id) ON DELETE SET NULL,
  expires_at          timestamptz NOT NULL,
  accepted_at         timestamptz,
  revoked_at          timestamptz,
  created_at          timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT invitations_email_lowercase CHECK (email = lower(email)),
  CONSTRAINT invitations_role_not_owner CHECK (role <> 'owner'),
  CONSTRAINT invitations_hash_format CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT invitations_single_outcome CHECK (accepted_at IS NULL OR revoked_at IS NULL)
);
CREATE UNIQUE INDEX invitations_token_hash_key ON invitations (token_hash);
-- Solo una invitación abierta por email y empresa.
CREATE UNIQUE INDEX invitations_open_email_key ON invitations (company_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- Sesiones de usuario (token opaco; solo se guarda su hash).
-- La FK compuesta a memberships elimina la sesión si el usuario deja la empresa.
CREATE TABLE sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  company_id    uuid NOT NULL,
  token_hash    text NOT NULL,
  user_agent    text,
  created_at    timestamptz(3) NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  CONSTRAINT sessions_membership_fk FOREIGN KEY (company_id, user_id)
    REFERENCES memberships (company_id, user_id) ON DELETE CASCADE,
  CONSTRAINT sessions_hash_format CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT sessions_user_agent_length CHECK (user_agent IS NULL OR length(user_agent) <= 256)
);
CREATE UNIQUE INDEX sessions_token_hash_key ON sessions (token_hash);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

-- ---------------------------------------------------------------------------
-- Configuración y suscripción (1:1 con la empresa)
-- ---------------------------------------------------------------------------

CREATE TABLE company_settings (
  company_id                uuid PRIMARY KEY REFERENCES companies (id) ON DELETE CASCADE,
  -- Reglas base de seguimiento (las usará el motor de la fase 3).
  first_follow_up_after_days integer NOT NULL DEFAULT 3,
  follow_up_interval_days    integer NOT NULL DEFAULT 4,
  max_follow_ups             integer NOT NULL DEFAULT 3,
  allowed_weekdays           smallint[] NOT NULL DEFAULT '{1,2,3,4,5}',
  contact_window_start       time NOT NULL DEFAULT '09:00',
  contact_window_end         time NOT NULL DEFAULT '19:00',
  default_channel            contact_channel NOT NULL DEFAULT 'email',
  -- Revisión humana obligatoria hasta verificar integración, reglas y base legal.
  require_manual_approval    boolean NOT NULL DEFAULT true,
  -- La empresa documenta su base legal para contactar (RGPD / LSSI).
  legal_basis_note           text,
  updated_by_user_id         uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at                 timestamptz(3) NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_settings_first_after CHECK (first_follow_up_after_days BETWEEN 1 AND 90),
  CONSTRAINT company_settings_interval CHECK (follow_up_interval_days BETWEEN 1 AND 90),
  CONSTRAINT company_settings_max CHECK (max_follow_ups BETWEEN 0 AND 10),
  CONSTRAINT company_settings_weekdays CHECK (
    cardinality(allowed_weekdays) BETWEEN 1 AND 7
    AND allowed_weekdays <@ '{1,2,3,4,5,6,7}'::smallint[]
  ),
  CONSTRAINT company_settings_window CHECK (contact_window_start < contact_window_end),
  CONSTRAINT company_settings_legal_note_length CHECK (legal_basis_note IS NULL OR length(legal_basis_note) <= 2000)
);
CREATE TRIGGER company_settings_updated_at BEFORE UPDATE ON company_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Estado del plan. Solo lo modifica el servidor (alta y, en la fase 5, webhooks
-- verificados del proveedor de pagos). Ningún endpoint de usuario lo escribe.
CREATE TABLE subscriptions (
  company_id                uuid PRIMARY KEY REFERENCES companies (id) ON DELETE CASCADE,
  plan                      subscription_plan,
  status                    subscription_status NOT NULL DEFAULT 'none',
  trial_ends_at             timestamptz,
  current_period_start      timestamptz,
  current_period_end        timestamptz,
  cancel_at_period_end      boolean NOT NULL DEFAULT false,
  provider                  text,
  provider_customer_id      text,
  provider_subscription_id  text,
  created_at                timestamptz(3) NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_plan_required CHECK (status = 'none' OR plan IS NOT NULL),
  CONSTRAINT subscriptions_trial_end CHECK (status <> 'trialing' OR trial_ends_at IS NOT NULL),
  CONSTRAINT subscriptions_period CHECK (current_period_end IS NULL OR current_period_start IS NULL OR current_period_start < current_period_end)
);
CREATE UNIQUE INDEX subscriptions_provider_subscription_key ON subscriptions (provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;
CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Contactos y exclusiones
-- ---------------------------------------------------------------------------

CREATE TABLE contacts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  full_name          text NOT NULL,
  email              text,
  phone              text,
  organization       text,
  preferred_channel  contact_channel,
  notes              text,
  created_by_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at         timestamptz(3) NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contacts_company_id_key UNIQUE (company_id, id),
  CONSTRAINT contacts_reachable CHECK (email IS NOT NULL OR phone IS NOT NULL),
  CONSTRAINT contacts_email_lowercase CHECK (email IS NULL OR email = lower(email)),
  CONSTRAINT contacts_phone_format CHECK (phone IS NULL OR phone ~ '^\+?[0-9]{6,15}$'),
  CONSTRAINT contacts_full_name_length CHECK (length(btrim(full_name)) BETWEEN 1 AND 160),
  CONSTRAINT contacts_notes_length CHECK (notes IS NULL OR length(notes) <= 5000)
);
-- Evita contactos duplicados por email dentro de la misma empresa.
CREATE UNIQUE INDEX contacts_company_email_key ON contacts (company_id, email) WHERE email IS NOT NULL;
CREATE INDEX contacts_company_phone_idx ON contacts (company_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX contacts_company_created_idx ON contacts (company_id, created_at DESC, id DESC);
CREATE TRIGGER contacts_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Lista de exclusión: contactos, emails o teléfonos que no deben recibir mensajes.
-- channel NULL = todos los canales.
CREATE TABLE contact_exclusions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  contact_id          uuid,
  email               text,
  phone               text,
  channel             contact_channel,
  reason              exclusion_reason NOT NULL,
  notes               text,
  created_by_user_id  uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at          timestamptz(3) NOT NULL DEFAULT now(),
  lifted_at           timestamptz,
  lifted_by_user_id   uuid REFERENCES users (id) ON DELETE SET NULL,
  lift_reason         text,
  CONSTRAINT contact_exclusions_contact_fk FOREIGN KEY (company_id, contact_id)
    REFERENCES contacts (company_id, id) ON DELETE CASCADE,
  CONSTRAINT contact_exclusions_target CHECK (contact_id IS NOT NULL OR email IS NOT NULL OR phone IS NOT NULL),
  CONSTRAINT contact_exclusions_email_lowercase CHECK (email IS NULL OR email = lower(email)),
  CONSTRAINT contact_exclusions_phone_format CHECK (phone IS NULL OR phone ~ '^\+?[0-9]{6,15}$'),
  CONSTRAINT contact_exclusions_lift CHECK (lifted_at IS NOT NULL OR (lifted_by_user_id IS NULL AND lift_reason IS NULL)),
  CONSTRAINT contact_exclusions_notes_length CHECK (notes IS NULL OR length(notes) <= 2000)
);
CREATE INDEX contact_exclusions_active_contact_idx ON contact_exclusions (company_id, contact_id) WHERE lifted_at IS NULL;
CREATE INDEX contact_exclusions_active_email_idx ON contact_exclusions (company_id, email) WHERE lifted_at IS NULL AND email IS NOT NULL;
CREATE INDEX contact_exclusions_active_phone_idx ON contact_exclusions (company_id, phone) WHERE lifted_at IS NULL AND phone IS NOT NULL;
CREATE INDEX contact_exclusions_company_created_idx ON contact_exclusions (company_id, created_at DESC, id DESC);

-- ---------------------------------------------------------------------------
-- Presupuestos
-- ---------------------------------------------------------------------------

CREATE TABLE quotes (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                 uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  contact_id                 uuid NOT NULL,
  owner_user_id              uuid,
  reference                  text,
  title                      text NOT NULL,
  description                text,
  amount_cents               bigint,
  currency                   char(3) NOT NULL DEFAULT 'EUR',
  status                     quote_status NOT NULL DEFAULT 'draft',
  status_changed_at          timestamptz NOT NULL DEFAULT now(),
  sent_at                    timestamptz,
  valid_until                date,
  last_follow_up_at          timestamptz,
  -- Primera respuesta del cliente (respondido, aceptado o rechazado).
  responded_at               timestamptz,
  -- Oportunidad reactivada: el cliente responde (sin rechazar) después de un
  -- seguimiento registrado. No implica venta.
  reactivated_at             timestamptz,
  accepted_at                timestamptz,
  -- Venta confirmada: requiere confirmación de un usuario y evidencia documentada.
  acceptance_confirmed_by_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  acceptance_evidence        text,
  accepted_amount_cents      bigint,
  rejected_at                timestamptz,
  rejection_reason           text,
  archived_at                timestamptz,
  -- Origen externo (integración de la fase 3).
  external_source            text,
  external_id                text,
  created_by_user_id         uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at                 timestamptz(3) NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quotes_company_id_key UNIQUE (company_id, id),
  CONSTRAINT quotes_contact_fk FOREIGN KEY (company_id, contact_id)
    REFERENCES contacts (company_id, id) ON DELETE RESTRICT,
  CONSTRAINT quotes_owner_fk FOREIGN KEY (company_id, owner_user_id)
    REFERENCES memberships (company_id, user_id) ON DELETE SET NULL (owner_user_id),
  CONSTRAINT quotes_title_length CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT quotes_reference_length CHECK (reference IS NULL OR length(reference) BETWEEN 1 AND 80),
  CONSTRAINT quotes_description_length CHECK (description IS NULL OR length(description) <= 10000),
  CONSTRAINT quotes_amount_positive CHECK (amount_cents IS NULL OR amount_cents >= 0),
  CONSTRAINT quotes_accepted_amount_positive CHECK (accepted_amount_cents IS NULL OR accepted_amount_cents >= 0),
  CONSTRAINT quotes_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT quotes_sent_requires_date CHECK (status = 'draft' OR sent_at IS NOT NULL),
  CONSTRAINT quotes_draft_not_sent CHECK (status <> 'draft' OR sent_at IS NULL),
  CONSTRAINT quotes_response_requires_date CHECK (status NOT IN ('responded', 'accepted', 'rejected') OR responded_at IS NOT NULL),
  CONSTRAINT quotes_reactivated_after_response CHECK (reactivated_at IS NULL OR responded_at IS NOT NULL),
  CONSTRAINT quotes_accepted_consistency CHECK (
    (status = 'accepted') = (accepted_at IS NOT NULL)
    AND (status <> 'accepted' OR (acceptance_evidence IS NOT NULL AND length(btrim(acceptance_evidence)) >= 3))
  ),
  CONSTRAINT quotes_rejected_consistency CHECK ((status = 'rejected') = (rejected_at IS NOT NULL)),
  CONSTRAINT quotes_external_pair CHECK ((external_source IS NULL) = (external_id IS NULL))
);
CREATE UNIQUE INDEX quotes_company_reference_key ON quotes (company_id, reference) WHERE reference IS NOT NULL;
CREATE UNIQUE INDEX quotes_company_external_key ON quotes (company_id, external_source, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX quotes_company_created_idx ON quotes (company_id, created_at DESC, id DESC);
CREATE INDEX quotes_company_status_idx ON quotes (company_id, status) WHERE archived_at IS NULL;
CREATE INDEX quotes_company_pending_idx ON quotes (company_id, sent_at) WHERE status = 'sent' AND archived_at IS NULL;
CREATE INDEX quotes_contact_idx ON quotes (company_id, contact_id);
CREATE INDEX quotes_owner_idx ON quotes (company_id, owner_user_id) WHERE owner_user_id IS NOT NULL;
CREATE TRIGGER quotes_updated_at BEFORE UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Seguimientos y tareas
-- ---------------------------------------------------------------------------

CREATE TABLE follow_ups (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  quote_id              uuid NOT NULL,
  channel               follow_up_channel NOT NULL,
  status                follow_up_status NOT NULL DEFAULT 'pending',
  source                follow_up_source NOT NULL DEFAULT 'manual',
  title                 text NOT NULL,
  notes                 text,
  due_at                timestamptz,
  assigned_user_id      uuid,
  completed_at          timestamptz,
  completed_by_user_id  uuid REFERENCES users (id) ON DELETE SET NULL,
  outcome               follow_up_outcome,
  cancelled_at          timestamptz,
  cancel_reason         text,
  -- Idempotencia para el motor automático (fase 3): una misma regla no crea dos veces el mismo paso.
  dedupe_key            text,
  created_by_user_id    uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at            timestamptz(3) NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT follow_ups_company_id_key UNIQUE (company_id, id),
  CONSTRAINT follow_ups_quote_fk FOREIGN KEY (company_id, quote_id)
    REFERENCES quotes (company_id, id) ON DELETE CASCADE,
  CONSTRAINT follow_ups_assigned_fk FOREIGN KEY (company_id, assigned_user_id)
    REFERENCES memberships (company_id, user_id) ON DELETE SET NULL (assigned_user_id),
  CONSTRAINT follow_ups_title_length CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT follow_ups_notes_length CHECK (notes IS NULL OR length(notes) <= 5000),
  CONSTRAINT follow_ups_completed_consistency CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
  CONSTRAINT follow_ups_cancelled_consistency CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
  CONSTRAINT follow_ups_outcome_only_completed CHECK (outcome IS NULL OR status = 'completed')
);
CREATE UNIQUE INDEX follow_ups_dedupe_key ON follow_ups (company_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX follow_ups_quote_idx ON follow_ups (company_id, quote_id, created_at DESC);
CREATE INDEX follow_ups_pending_due_idx ON follow_ups (company_id, due_at) WHERE status = 'pending';
CREATE INDEX follow_ups_assigned_idx ON follow_ups (company_id, assigned_user_id) WHERE status = 'pending';
CREATE TRIGGER follow_ups_updated_at BEFORE UPDATE ON follow_ups FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Historial de actividad (solo inserción; sin contraseñas, tokens ni datos innecesarios)
-- ---------------------------------------------------------------------------

CREATE TABLE activity_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  actor_user_id  uuid REFERENCES users (id) ON DELETE SET NULL,
  action         text NOT NULL,
  entity_type    text NOT NULL,
  entity_id      uuid,
  quote_id       uuid,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT activity_log_quote_fk FOREIGN KEY (company_id, quote_id)
    REFERENCES quotes (company_id, id) ON DELETE CASCADE,
  CONSTRAINT activity_log_action_format CHECK (action ~ '^[a-z_]+(\.[a-z_]+)+$'),
  CONSTRAINT activity_log_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX activity_log_company_created_idx ON activity_log (company_id, created_at DESC, id DESC);
CREATE INDEX activity_log_quote_created_idx ON activity_log (company_id, quote_id, created_at DESC, id DESC) WHERE quote_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY companies_select ON companies FOR SELECT
  USING (
    id = (SELECT app_company_id())
    OR EXISTS (SELECT 1 FROM memberships m WHERE m.company_id = companies.id AND m.user_id = (SELECT app_user_id()))
  );
CREATE POLICY companies_insert ON companies FOR INSERT WITH CHECK (id = (SELECT app_company_id()));
CREATE POLICY companies_update ON companies FOR UPDATE
  USING (id = (SELECT app_company_id())) WITH CHECK (id = (SELECT app_company_id()));
CREATE POLICY companies_delete ON companies FOR DELETE USING (id = (SELECT app_company_id()));

-- Un usuario puede ver sus propias membresías (para elegir empresa al iniciar sesión).
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY memberships_select ON memberships FOR SELECT
  USING (company_id = (SELECT app_company_id()) OR user_id = (SELECT app_user_id()));
CREATE POLICY memberships_insert ON memberships FOR INSERT WITH CHECK (company_id = (SELECT app_company_id()));
CREATE POLICY memberships_update ON memberships FOR UPDATE
  USING (company_id = (SELECT app_company_id())) WITH CHECK (company_id = (SELECT app_company_id()));
CREATE POLICY memberships_delete ON memberships FOR DELETE USING (company_id = (SELECT app_company_id()));

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'invitations', 'company_settings', 'subscriptions', 'contacts', 'contact_exclusions',
    'quotes', 'follow_ups', 'activity_log'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (company_id = (SELECT app_company_id())) WITH CHECK (company_id = (SELECT app_company_id()))',
      t || '_tenant_isolation', t
    );
  END LOOP;
END
$$;

-- Búsqueda acotada de una invitación por el hash de su token, antes de conocer la
-- empresa. Se ejecuta con los permisos del propietario del esquema (sin RLS) y
-- solo devuelve el id y la empresa de una invitación abierta.
CREATE FUNCTION app_find_open_invitation(p_token_hash text)
  RETURNS TABLE (invitation_id uuid, company_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT i.id, i.company_id
    FROM invitations i
    WHERE i.token_hash = p_token_hash
      AND i.accepted_at IS NULL
      AND i.revoked_at IS NULL
      AND i.expires_at > now()
  $$;
REVOKE ALL ON FUNCTION app_find_open_invitation(text) FROM PUBLIC;
