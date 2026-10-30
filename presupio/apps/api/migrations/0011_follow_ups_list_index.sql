-- =============================================================================
-- Presupio · 0011 · Índice para el listado de seguimientos
-- -----------------------------------------------------------------------------
-- El listado (GET /follow-ups, también en el panel) filtra por empresa y estado y ordena por
-- created_at DESC, id DESC. Con RLS, PostgreSQL no puede usar la condición de estado en un
-- índice (la igualdad de un enum no es «leakproof»), así que unía y ordenaba TODOS los
-- seguimientos pendientes de la empresa para devolver 26: ~19 ms con 5.000, lineal con el tamaño.
-- Con este índice (solo company_id, que sí es leakproof) recorre en orden y se detiene en el
-- límite: ~1 ms (medido con EXPLAIN ANALYZE como el rol de la aplicación; docs/AUDITORIA-PRODUCCION.md).
-- Tablas pequeñas al lanzar: CREATE INDEX normal (bloquea escrituras unos milisegundos).
-- =============================================================================

CREATE INDEX IF NOT EXISTS follow_ups_company_created_idx ON follow_ups (company_id, created_at DESC, id DESC);
