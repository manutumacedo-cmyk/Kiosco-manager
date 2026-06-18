-- =========================================================================
-- B30 + B33 · Auditoría de anulación (quién/cuándo) + el cajero puede anular
-- ventas de su turno actualmente abierto (no del historial general).
-- Aplicar una vez en Supabase (SQL Editor). Idempotente.
-- =========================================================================

-- 1) Auditoría de quién anuló y cuándo (B30).
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS anulada_por TEXT,
  ADD COLUMN IF NOT EXISTS anulada_at TIMESTAMPTZ;

-- 2) cancel_sale ahora registra autoría. Se DROPea porque cambia la firma.
DROP FUNCTION IF EXISTS cancel_sale(uuid);
CREATE OR REPLACE FUNCTION cancel_sale(p_sale_id uuid, p_anulada_por text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  v_sale_estado text;
  v_items_count integer;
BEGIN
  SELECT estado INTO v_sale_estado FROM sales WHERE id = p_sale_id;
  IF v_sale_estado IS NULL THEN
    RAISE EXCEPTION 'Venta no encontrada';
  END IF;
  IF v_sale_estado = 'anulada' THEN
    RAISE EXCEPTION 'La venta ya está anulada';
  END IF;

  UPDATE sales SET
    estado = 'anulada',
    anulada_por = p_anulada_por,
    anulada_at = now()
  WHERE id = p_sale_id;

  UPDATE products p
  SET stock = p.stock + si.cantidad
  FROM sale_items si
  WHERE si.sale_id = p_sale_id AND si.product_id = p.id;

  SELECT COUNT(*) INTO v_items_count FROM sale_items WHERE sale_id = p_sale_id;

  RETURN json_build_object('success', true, 'sale_id', p_sale_id, 'items_restored', v_items_count);
END;
$$;

-- 3) Cancelar venta como cajero: solo si pertenece al turno ACTUALMENTE abierto (B33).
CREATE OR REPLACE FUNCTION cancel_sale_own_turno(p_sale_id uuid, p_anulada_por text)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  v_sale_session_id uuid;
  v_open_session_id uuid;
BEGIN
  SELECT session_id INTO v_sale_session_id FROM sales WHERE id = p_sale_id;
  IF v_sale_session_id IS NULL THEN
    RAISE EXCEPTION 'Esta venta no pertenece a ningún turno';
  END IF;

  SELECT id INTO v_open_session_id FROM cash_sessions WHERE estado = 'abierta';
  IF v_open_session_id IS NULL OR v_open_session_id != v_sale_session_id THEN
    RAISE EXCEPTION 'Solo se pueden anular ventas del turno actualmente abierto';
  END IF;

  RETURN cancel_sale(p_sale_id, p_anulada_por);
END;
$$;
