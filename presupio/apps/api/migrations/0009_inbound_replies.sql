-- =============================================================================
-- Presupio · 0009 · Detección de respuestas de clientes (correo entrante)
-- -----------------------------------------------------------------------------
-- Cada empresa tiene una dirección de entrada propia (respuestas+<token>@<dominio>) a la que
-- reenvía las respuestas de sus clientes. El proveedor de correo (Mailgun) las entrega
-- firmadas a Presupio, que las empareja con el email automático al que responden SOLO dentro
-- de esa empresa. No se guarda el contenido del mensaje: solo qué presupuesto, cómo se
-- emparejó y qué se hizo.
-- =============================================================================

ALTER TABLE company_settings
  ADD COLUMN inbound_token text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '');
ALTER TABLE company_settings ADD CONSTRAINT company_settings_inbound_token_format CHECK (inbound_token ~ '^[0-9a-f]{32}$');
CREATE UNIQUE INDEX company_settings_inbound_token_key ON company_settings (inbound_token);

CREATE TABLE inbound_replies (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  quote_id          uuid,
  delivery_id       uuid,
  provider          text NOT NULL,
  -- SHA-256 del Message-Id del email recibido: el mismo mensaje no se procesa dos veces.
  message_id_hash   text NOT NULL,
  -- message_id: In-Reply-To/References · sender: remitente = email del contacto · none
  match_method      text NOT NULL,
  -- responded: se registró la respuesta · already_answered: el presupuesto ya no estaba pendiente ·
  -- auto_reply: respuesta automática (fuera de la oficina…) · bounce: aviso de rebote ·
  -- unmatched: no corresponde a ningún email de la empresa · ignored: presupuesto archivado o suprimido
  outcome           text NOT NULL,
  sender_domain     text,
  received_at       timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT inbound_replies_once UNIQUE (company_id, message_id_hash),
  CONSTRAINT inbound_replies_quote_fk FOREIGN KEY (company_id, quote_id) REFERENCES quotes (company_id, id) ON DELETE SET NULL,
  CONSTRAINT inbound_replies_hash CHECK (message_id_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT inbound_replies_method CHECK (match_method IN ('message_id', 'sender', 'none')),
  CONSTRAINT inbound_replies_outcome CHECK (outcome IN ('responded', 'already_answered', 'auto_reply', 'bounce', 'unmatched', 'ignored')),
  CONSTRAINT inbound_replies_sender_domain CHECK (sender_domain IS NULL OR length(sender_domain) <= 253)
);
CREATE INDEX inbound_replies_company_received_idx ON inbound_replies (company_id, received_at DESC);
ALTER TABLE inbound_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY inbound_replies_tenant_isolation ON inbound_replies FOR ALL
  USING (company_id = (SELECT app_company_id())) WITH CHECK (company_id = (SELECT app_company_id()));

-- Localiza la empresa de una dirección de entrada (consulta acotada entre empresas: solo el id).
CREATE FUNCTION app_find_company_by_inbound_token(p_token text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT company_id FROM company_settings WHERE inbound_token = p_token AND p_token ~ '^[0-9a-f]{32}$' $$;
REVOKE ALL ON FUNCTION app_find_company_by_inbound_token(text) FROM PUBLIC;
