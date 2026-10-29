-- =============================================================================
-- Presupio · 0006 · Estado «resultado desconocido» para seguimientos automáticos
-- -----------------------------------------------------------------------------
-- Un envío interrumpido después de llamar al proveedor puede haber salido o no. Hasta ahora
-- quedaba como «fallido», lo que no se podía demostrar. Este estado lo deja pendiente de
-- reconciliación (proveedor) o de revisión manual. Va solo en esta migración porque un valor
-- nuevo de un enum no se puede usar en la misma transacción que lo crea (se usa en la 0007).
-- =============================================================================
ALTER TYPE follow_up_status ADD VALUE IF NOT EXISTS 'unknown';
