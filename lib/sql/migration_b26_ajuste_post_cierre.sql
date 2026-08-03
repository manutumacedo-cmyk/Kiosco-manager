-- ============================================================================
-- B26 — Anular una venta tras el cierre desincronizaba el snapshot del turno
-- ============================================================================
-- close_cash_session() congela los totales del turno en cash_sessions. Ese
-- snapshot ES el arqueo de esa noche: lo que se contó, lo que dio de
-- diferencia. No se reescribe nunca.
--
-- El problema: cancel_sale() marcaba la venta anulada pero no tocaba
-- cash_sessions, así que un turno cerrado quedaba diciendo que vendió más de
-- lo que realmente vendió.
--
-- La solución: las anulaciones posteriores al cierre se ACUMULAN en columnas
-- de ajuste aparte. El total real se calcula restando (snapshot − ajuste).
-- Ningún camino del código puede alterar el arqueo histórico, y queda registro
-- de que hubo una corrección posterior. (Contra la base directamente sí se
-- puede, mientras la RLS siga abierta — ver B36.)
--
-- OJO: esta migración quedó incompleta. Ver migration_b26b_locks.sql, que cierra
-- una carrera con close_cash_session y saca un deadlock que ésta introdujo.
-- ============================================================================

ALTER TABLE cash_sessions
  ADD COLUMN IF NOT EXISTS ajuste_ventas_post_cierre       NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ajuste_efectivo_uyu_post_cierre NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ajuste_efectivo_brl_post_cierre NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ajuste_digital_post_cierre      NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cantidad_anuladas_post_cierre   INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN cash_sessions.ajuste_ventas_post_cierre IS
  'Suma de ventas anuladas DESPUÉS del cierre del turno. El total real es total_ventas - este valor. El snapshot original queda intacto (es el arqueo).';

-- cancel_sale: si la venta pertenece a un turno CERRADO, acumula el ajuste en
-- la misma transacción. Si el turno está abierto no hace falta: los totales se
-- calculan en vivo y close_cash_session ya filtra por estado='activa'.
--
-- Sin DROP: la firma no cambia, así que CREATE OR REPLACE alcanza y evita
-- romper momentáneamente a cancel_sale_own_turno, que la llama.
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
  -- FOR UPDATE: bloquea la fila para que dos anulaciones simultáneas de la
  -- misma venta no puedan pasar las dos por el chequeo de estado.
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

  -- Devolver stock solo de product_id que existan en products
  -- (sale_items no tiene FK a products a propósito — ver B2, combos).
  UPDATE products p
  SET stock = p.stock + si.cantidad
  FROM sale_items si
  WHERE si.sale_id = p_sale_id AND si.product_id = p.id;

  -- ¿El turno de esta venta ya cerró? Entonces su snapshot quedó viejo.
  IF v_sale.session_id IS NOT NULL THEN
    SELECT estado INTO v_session_estado
    FROM cash_sessions WHERE id = v_sale.session_id FOR UPDATE;

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
