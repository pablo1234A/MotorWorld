-- =============================================================================
-- Presupio · 0008 · Supresión de datos de un contacto o de un presupuesto (RGPD)
-- -----------------------------------------------------------------------------
-- La supresión es una ANONIMIZACIÓN irreversible, no un borrado físico de filas:
--  - se eliminan los datos personales (nombre, email, teléfono, notas, contenido de los
--    emails, evidencias y notas libres del historial);
--  - se conservan las filas sin datos personales para no romper la integridad (intentos de
--    seguimiento facturados, métricas agregadas, historial de actividad).
-- Las exclusiones ACTIVAS se conservan: sirven para seguir respetando una baja.
-- Compatible con los datos existentes: solo añade columnas y relaja una restricción.
-- =============================================================================

ALTER TABLE contacts ADD COLUMN anonymized_at timestamptz;
ALTER TABLE contacts DROP CONSTRAINT contacts_reachable;
ALTER TABLE contacts ADD CONSTRAINT contacts_reachable CHECK (email IS NOT NULL OR phone IS NOT NULL OR anonymized_at IS NOT NULL);
ALTER TABLE contacts ADD CONSTRAINT contacts_anonymized_clean CHECK (
  anonymized_at IS NULL OR (email IS NULL AND phone IS NULL AND organization IS NULL AND notes IS NULL)
);

ALTER TABLE quotes ADD COLUMN deleted_at timestamptz;
ALTER TABLE quotes ADD CONSTRAINT quotes_deleted_clean CHECK (
  deleted_at IS NULL OR (description IS NULL AND reference IS NULL AND archived_at IS NOT NULL AND auto_follow_up_enabled = false)
);

-- El historial es de solo inserción para la aplicación. Esta función acotada borra SOLO las
-- notas libres (que pueden contener datos personales) de las entradas de unos presupuestos de
-- la empresa activa; el resto de cada entrada (qué pasó y cuándo) se conserva.
CREATE FUNCTION app_scrub_activity_notes(p_quote_ids uuid[]) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_company uuid := app_company_id();
  v_count integer;
BEGIN
  IF v_company IS NULL THEN RAISE EXCEPTION 'Sin empresa activa' USING ERRCODE = 'insufficient_privilege'; END IF;
  UPDATE activity_log SET metadata = metadata - 'note' - 'notes' - 'evidence'
  WHERE company_id = v_company AND quote_id = ANY (p_quote_ids) AND metadata ?| ARRAY['note', 'notes', 'evidence'];
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION app_scrub_activity_notes(uuid[]) FROM PUBLIC;
