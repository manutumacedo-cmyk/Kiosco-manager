-- B46 · PIX se registraba como digital en pesos
--
-- PIX es un riel de pago brasileno: la plata cae en una cuenta de Brasil en reales.
-- El POS lo guardaba con moneda = 'UYU' (app/ventas/nueva/page.tsx, cobrarDigital) y lo
-- sumaba a total_digital junto con debito, credito y transferencia. Resultado: el monto
-- en reales que realmente entro no quedaba en ningun lado y el saldo de la cuenta PIX no
-- se podia conciliar contra el sistema.
--
-- Lo que NO cambia, a proposito:
--   * total_digital sigue siendo TODO lo digital valuado en UYU. El invariante de
--     consistencia del cierre y los turnos ya cerrados no se mueven.
--   * PIX sigue sin tocar el cajon fisico: mov_efectivo_brl solo suma cuando
--     metodo_pago = 'efectivo'. Eso ya estaba bien.
--   * Las ventas historicas no se migran: quedaron como pesos y los arqueos ya firmados
--     se respetan. El desglose aplica de aca en adelante.
--
-- El monto en reales se deriva de tasa_cambio, que ya se guarda como snapshot en cada
-- venta (B29). Si una venta no tiene tasa, se omite en vez de inventar un numero.

-- ---- 1. Columnas del snapshot de cierre -----------------------------------
ALTER TABLE cash_sessions
  ADD COLUMN IF NOT EXISTS total_digital_uyu        NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS total_digital_brl        NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS total_digital_brl_en_uyu NUMERIC(10,2);

COMMENT ON COLUMN cash_sessions.total_digital IS
  'Todo lo digital del turno, valuado en UYU. Sostiene el invariante de consistencia.';
COMMENT ON COLUMN cash_sessions.total_digital_uyu IS
  'Digital cobrado en pesos: debito, credito, transferencia.';
COMMENT ON COLUMN cash_sessions.total_digital_brl IS
  'Digital cobrado en reales (PIX), EN R$. Derivado de total / tasa_cambio.';
COMMENT ON COLUMN cash_sessions.total_digital_brl_en_uyu IS
  'El mismo PIX valuado en UYU. total_digital_uyu + total_digital_brl_en_uyu = total_digital.';

-- ---- 2. El cierre guarda el desglose --------------------------------------
-- Copia fiel de la version vigente en 00-schema-completo.sql, con tres campos mas.
-- La firma no cambia: no hace falta tocar la llamada desde la app.
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
  v_digital_uyu      NUMERIC;
  v_digital_brl      NUMERIC;
  v_digital_brl_uyu  NUMERIC;
  v_cantidad         INTEGER;
  v_salidas_uyu      NUMERIC;
  v_salidas_brl      NUMERIC;
  v_entradas_uyu     NUMERIC;
  v_entradas_brl     NUMERIC;
BEGIN
  -- El lock va ACA, antes de sumar: serializa contra cancel_sale (B26b). Antes era
  -- un IF NOT EXISTS sin lock, y una anulacion concurrente podia colarse entre el
  -- SUM y el UPDATE final, cerrando el turno con la venta contada y ajuste = 0.
  PERFORM 1 FROM cash_sessions
   WHERE id = p_session_id AND estado = 'abierta'
   FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesión no encontrada o ya cerrada';
  END IF;

  SELECT
    COALESCE(SUM(total), 0),
    -- Efectivo por cajon = movimiento fisico NETO (entra +, sale -). Ver B23/B24/B25.
    COALESCE(SUM(mov_efectivo_uyu), 0),
    COALESCE(SUM(mov_efectivo_brl), 0),
    -- Digital total, en UYU. Identico a antes: nada que dependa de esto se mueve.
    COALESCE(SUM(CASE WHEN metodo_pago != 'efectivo' THEN total ELSE 0 END), 0),
    -- Digital cobrado en pesos (debito, credito, transferencia).
    COALESCE(SUM(CASE WHEN metodo_pago != 'efectivo' AND COALESCE(moneda, 'UYU') != 'BRL'
                      THEN total ELSE 0 END), 0),
    -- Digital cobrado en reales (PIX), convertido a R$ con la tasa de cada venta.
    -- Sin tasa no se convierte: se omite en vez de inventar el monto.
    COALESCE(SUM(CASE WHEN metodo_pago != 'efectivo' AND moneda = 'BRL'
                       AND COALESCE(tasa_cambio, 0) > 0
                      THEN total / tasa_cambio ELSE 0 END), 0),
    -- El mismo PIX valuado en UYU, para poder cuadrar contra total_digital.
    COALESCE(SUM(CASE WHEN metodo_pago != 'efectivo' AND moneda = 'BRL'
                      THEN total ELSE 0 END), 0),
    COUNT(*)
  INTO v_total_ventas, v_efectivo_uyu, v_efectivo_brl,
       v_digital, v_digital_uyu, v_digital_brl, v_digital_brl_uyu, v_cantidad
  FROM sales
  WHERE session_id = p_session_id AND estado = 'activa';

  -- Movimientos del turno (entrada/salida, B32), por tipo y moneda
  SELECT
    COALESCE(SUM(CASE WHEN moneda = 'UYU' AND tipo = 'salida'  THEN monto ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN moneda = 'BRL' AND tipo = 'salida'  THEN monto ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN moneda = 'UYU' AND tipo = 'entrada' THEN monto ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN moneda = 'BRL' AND tipo = 'entrada' THEN monto ELSE 0 END), 0)
  INTO v_salidas_uyu, v_salidas_brl, v_entradas_uyu, v_entradas_brl
  FROM cash_outflows
  WHERE session_id = p_session_id;

  UPDATE cash_sessions SET
    estado                   = 'cerrada',
    cerrado_por              = p_cerrado_por,
    cerrado_por_user_id      = p_cerrado_por_user_id,
    cierre_at                = now(),
    notas_cierre             = p_notas,
    total_ventas             = v_total_ventas,
    total_efectivo_uyu       = v_efectivo_uyu,
    total_efectivo_brl       = v_efectivo_brl,
    total_digital            = v_digital,
    total_digital_uyu        = v_digital_uyu,
    total_digital_brl        = v_digital_brl,
    total_digital_brl_en_uyu = v_digital_brl_uyu,
    cantidad_ventas          = v_cantidad,
    efectivo_contado_uyu     = p_efectivo_contado_uyu,
    efectivo_contado_brl     = p_efectivo_contado_brl,
    total_salidas_uyu        = v_salidas_uyu,
    total_salidas_brl        = v_salidas_brl,
    total_entradas_uyu       = v_entradas_uyu,
    total_entradas_brl       = v_entradas_brl
  WHERE id = p_session_id;
END;
$$;
