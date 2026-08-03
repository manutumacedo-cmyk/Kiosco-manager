-- ============================================================================
-- B26b — Cerrar la carrera cierre/anulación y sacar el deadlock
-- ============================================================================
-- Complementa migration_b26_ajuste_post_cierre.sql. Dos problemas que quedaron:
--
-- 1) CARRERA (dejaba B26 abierto igual):
--    close_cash_session chequeaba estado='abierta' SIN tomar lock, después
--    sumaba las ventas, y recién al final hacía el UPDATE. En esa ventana:
--
--      T1 close:  chequea OK → SUMA (incluye venta V) ─────────→ UPDATE cierra
--      T2 cancel: anula V → lee sesión "abierta" → NO ajusta ✓commit
--
--    Turno cerrado, V contada en el snapshot, ajuste = 0, sin rastro.
--    Fix: tomar el lock de la fila ANTES de sumar. Así:
--      · si cancel gana el lock → cierra después y ya ve la venta anulada
--      · si close gana         → cancel espera, lee 'cerrada' y acumula ajuste
--
-- 2) DEADLOCK (introducido por la migración anterior):
--    El INSERT INTO sales toma FOR KEY SHARE sobre cash_sessions por la FK.
--    FOR UPDATE conflictúa con eso, y los órdenes de adquisición se cruzan:
--      create_sale_atomic: cash_sessions (FK) → products
--      cancel_sale:        sales → products → cash_sessions
--    Fix: FOR NO KEY UPDATE, que NO conflictúa con FOR KEY SHARE pero SÍ
--    consigo mismo y con el UPDATE de close_cash_session — que es la
--    exclusión mutua que realmente importa.
-- ============================================================================

-- ── 1) cancel_sale: FOR UPDATE → FOR NO KEY UPDATE en cash_sessions ────────
CREATE OR REPLACE FUNCTION cancel_sale(p_sale_id uuid, p_anulada_por text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  v_sale            sales%ROWTYPE;
  v_session_estado  text;
  v_items_count     integer;
  v_ajustado        boolean := false;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id FOR UPDATE;

  IF v_sale.id IS NULL THEN
    RAISE EXCEPTION 'Venta no encontrada';
  END IF;
  IF v_sale.estado = 'anulada' THEN
    RAISE EXCEPTION 'La venta ya está anulada';
  END IF;

  UPDATE sales SET
    estado      = 'anulada',
    anulada_por = p_anulada_por,
    anulada_at  = now()
  WHERE id = p_sale_id;

  -- Agregado por product_id: si una venta tiene dos líneas del mismo producto,
  -- UPDATE ... FROM aplicaría una sola fila y devolvería stock de menos (B35).
  UPDATE products p
  SET stock = p.stock + agg.cant
  FROM (
    SELECT product_id, SUM(cantidad) AS cant
    FROM sale_items
    WHERE sale_id = p_sale_id
    GROUP BY product_id
  ) agg
  WHERE agg.product_id = p.id;

  IF v_sale.session_id IS NOT NULL THEN
    -- FOR NO KEY UPDATE: excluye contra otro cancel_sale y contra el UPDATE de
    -- close_cash_session, sin trabarse con el FOR KEY SHARE de la FK del INSERT.
    SELECT estado INTO v_session_estado
    FROM cash_sessions WHERE id = v_sale.session_id FOR NO KEY UPDATE;

    IF v_session_estado = 'cerrada' THEN
      UPDATE cash_sessions SET
        ajuste_ventas_post_cierre       = ajuste_ventas_post_cierre       + COALESCE(v_sale.total, 0),
        ajuste_efectivo_uyu_post_cierre = ajuste_efectivo_uyu_post_cierre + COALESCE(v_sale.mov_efectivo_uyu, 0),
        ajuste_efectivo_brl_post_cierre = ajuste_efectivo_brl_post_cierre + COALESCE(v_sale.mov_efectivo_brl, 0),
        ajuste_digital_post_cierre      = ajuste_digital_post_cierre      +
          CASE WHEN v_sale.metodo_pago != 'efectivo' THEN COALESCE(v_sale.total, 0) ELSE 0 END,
        cantidad_anuladas_post_cierre   = cantidad_anuladas_post_cierre   + 1
      WHERE id = v_sale.session_id;

      v_ajustado := true;
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_items_count FROM sale_items WHERE sale_id = p_sale_id;

  RETURN json_build_object(
    'success', true,
    'sale_id', p_sale_id,
    'items_restored', v_items_count,
    'ajuste_post_cierre', v_ajustado
  );
END;
$$;

-- ── 2) close_cash_session: lock ANTES de sumar ─────────────────────────────
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
  -- El lock va ACÁ, antes de sumar: serializa contra cancel_sale (B26b).
  -- Antes esto era un IF NOT EXISTS sin lock, y una anulación concurrente podía
  -- colarse entre el SUM y el UPDATE, perdiendo el ajuste.
  PERFORM 1 FROM cash_sessions
   WHERE id = p_session_id AND estado = 'abierta'
   FOR NO KEY UPDATE;

  IF NOT FOUND THEN
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
