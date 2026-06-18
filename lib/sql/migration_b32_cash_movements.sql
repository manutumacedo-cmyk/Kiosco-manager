-- =========================================================================
-- B32 · Movimientos de caja (entradas + salidas), no solo salidas.
-- Aplicar una vez en Supabase (SQL Editor). Idempotente.
-- =========================================================================

-- 1) cash_outflows pasa a modelar "movimientos" con tipo entrada/salida.
ALTER TABLE cash_outflows
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'salida' CHECK (tipo IN ('entrada', 'salida'));

-- 2) cash_sessions necesita columnas de snapshot para entradas (las de salida ya existían).
ALTER TABLE cash_sessions
  ADD COLUMN IF NOT EXISTS total_entradas_uyu NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS total_entradas_brl NUMERIC(10,2);

-- 3) Las columnas generadas diferencia_uyu/brl deben recalcularse incluyendo entradas.
--    Postgres no permite ALTER de una columna GENERATED: hay que recrearla.
ALTER TABLE cash_sessions DROP COLUMN IF EXISTS diferencia_uyu;
ALTER TABLE cash_sessions DROP COLUMN IF EXISTS diferencia_brl;

ALTER TABLE cash_sessions ADD COLUMN diferencia_uyu NUMERIC(10,2) GENERATED ALWAYS AS (
  efectivo_contado_uyu - (
    monto_inicial
    + COALESCE(total_efectivo_uyu, 0)
    + COALESCE(total_entradas_uyu, 0)
    - COALESCE(total_salidas_uyu, 0)
  )
) STORED;

ALTER TABLE cash_sessions ADD COLUMN diferencia_brl NUMERIC(10,2) GENERATED ALWAYS AS (
  efectivo_contado_brl - (
    monto_inicial_brl
    + COALESCE(total_efectivo_brl, 0)
    + COALESCE(total_entradas_brl, 0)
    - COALESCE(total_salidas_brl, 0)
  )
) STORED;

-- 4) Reemplaza register_cash_outflow por register_cash_movement (acepta tipo).
DROP FUNCTION IF EXISTS register_cash_outflow(uuid, numeric, text, text);

CREATE OR REPLACE FUNCTION register_cash_movement(
  p_session_id UUID,
  p_monto      NUMERIC,
  p_moneda     TEXT,
  p_tipo       TEXT,
  p_motivo     TEXT
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a cero';
  END IF;
  IF trim(coalesce(p_motivo, '')) = '' THEN
    RAISE EXCEPTION 'El motivo es obligatorio';
  END IF;
  IF lower(coalesce(p_tipo, '')) NOT IN ('entrada', 'salida') THEN
    RAISE EXCEPTION 'Tipo de movimiento inválido: %', p_tipo;
  END IF;

  -- Lock de la sesión: evita registrar un movimiento mientras otro la cierra
  PERFORM 1 FROM cash_sessions WHERE id = p_session_id AND estado = 'abierta' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No hay turno abierto para registrar el movimiento';
  END IF;

  INSERT INTO cash_outflows (session_id, monto, moneda, tipo, motivo)
  VALUES (p_session_id, p_monto, upper(p_moneda), lower(p_tipo), trim(p_motivo))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 5) close_cash_session: snapshot separa entradas y salidas por moneda.
CREATE OR REPLACE FUNCTION close_cash_session(
  p_session_id           UUID,
  p_cerrado_por          TEXT,
  p_notas                TEXT    DEFAULT NULL,
  p_efectivo_contado_uyu NUMERIC DEFAULT NULL,
  p_efectivo_contado_brl NUMERIC DEFAULT NULL
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

  -- Movimientos del turno, por tipo y moneda
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
