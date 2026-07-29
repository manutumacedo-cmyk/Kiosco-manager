-- ============================================================================
-- Migración: registrar quién abre y quién cierra un turno por su cuenta real
-- (JWT verificado en middleware.ts), no por texto libre que cualquiera puede
-- escribir. `cash_sessions.user_id` ya existía pero nunca se completaba (0 de
-- 44 sesiones lo tenían); se agrega el equivalente para el cierre.
-- ============================================================================

-- 1) Quién cierra, por cuenta (puede ser distinto de quién abrió — el turno se
--    entrega a otro cajero). `cerrado_por` (TEXT) se mantiene para no romper
--    reportes existentes, pero ahora se completa con el username real.
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS cerrado_por_user_id UUID REFERENCES users(id);

-- 2) close_cash_session: agrega p_cerrado_por_user_id. Mismo motivo que la migración de
--    register_cash_movement — cambia la cantidad de parámetros, así que hay que dropear
--    la firma vieja de 5 argumentos para no dejarla viva como overload.
DROP FUNCTION IF EXISTS close_cash_session(UUID, TEXT, TEXT, NUMERIC, NUMERIC);

CREATE OR REPLACE FUNCTION close_cash_session(
  p_session_id           UUID,
  p_cerrado_por          TEXT,
  p_notas                TEXT    DEFAULT NULL,
  p_efectivo_contado_uyu NUMERIC DEFAULT NULL,
  p_efectivo_contado_brl NUMERIC DEFAULT NULL,
  p_cerrado_por_user_id  UUID    DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_ventas     NUMERIC;
  v_efectivo_uyu     NUMERIC;
  v_efectivo_brl     NUMERIC;
  v_digital          NUMERIC;
  v_cantidad         INTEGER;
  v_salidas_uyu      NUMERIC;
  v_salidas_brl      NUMERIC;
  v_entradas_uyu     NUMERIC;
  v_entradas_brl     NUMERIC;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cash_sessions WHERE id = p_session_id AND estado = 'abierta'
  ) THEN
    RAISE EXCEPTION 'Sesión no encontrada o ya cerrada';
  END IF;

  SELECT
    COALESCE(SUM(total), 0),
    COALESCE(SUM(mov_efectivo_uyu), 0),
    COALESCE(SUM(mov_efectivo_brl), 0),
    COALESCE(SUM(CASE WHEN metodo_pago != 'efectivo' THEN total ELSE 0 END), 0),
    COUNT(*)
  INTO v_total_ventas, v_efectivo_uyu, v_efectivo_brl, v_digital, v_cantidad
  FROM sales
  WHERE session_id = p_session_id AND estado = 'activa';

  SELECT
    COALESCE(SUM(CASE WHEN moneda = 'UYU' AND tipo = 'salida'  THEN monto ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN moneda = 'BRL' AND tipo = 'salida'  THEN monto ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN moneda = 'UYU' AND tipo = 'entrada' THEN monto ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN moneda = 'BRL' AND tipo = 'entrada' THEN monto ELSE 0 END), 0)
  INTO v_salidas_uyu, v_salidas_brl, v_entradas_uyu, v_entradas_brl
  FROM cash_outflows
  WHERE session_id = p_session_id;

  UPDATE cash_sessions SET
    estado               = 'cerrada',
    cerrado_por          = p_cerrado_por,
    cerrado_por_user_id  = p_cerrado_por_user_id,
    cierre_at            = now(),
    notas_cierre         = p_notas,
    total_ventas         = v_total_ventas,
    total_efectivo_uyu   = v_efectivo_uyu,
    total_efectivo_brl   = v_efectivo_brl,
    total_digital        = v_digital,
    cantidad_ventas      = v_cantidad,
    efectivo_contado_uyu = p_efectivo_contado_uyu,
    efectivo_contado_brl = p_efectivo_contado_brl,
    total_salidas_uyu    = v_salidas_uyu,
    total_salidas_brl    = v_salidas_brl,
    total_entradas_uyu   = v_entradas_uyu,
    total_entradas_brl   = v_entradas_brl
  WHERE id = p_session_id;
END;
$$;
