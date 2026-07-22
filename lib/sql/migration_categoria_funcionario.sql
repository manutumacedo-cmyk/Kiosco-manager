-- ============================================================================
-- Migración: agrega la categoría "funcionario" (pago a empleados: sueldos,
-- adelantos, propinas) como categoría de salida distinta de "gasto_personal"
-- (gastos del dueño). No requiere backfill: no hay forma de saber, sin revisar
-- motivo por motivo, cuáles de las salidas históricas categorizadas como
-- "gasto_personal" u "otro" eran en realidad pagos a funcionarios.
-- ============================================================================

ALTER TABLE cash_outflows DROP CONSTRAINT IF EXISTS chk_cash_outflows_categoria;
ALTER TABLE cash_outflows ADD CONSTRAINT chk_cash_outflows_categoria CHECK (
  (tipo = 'salida' AND categoria IN ('restock', 'proveedor', 'gasto_personal', 'funcionario', 'otro'))
  OR (tipo = 'entrada' AND categoria IS NULL)
);

-- register_cash_movement: mismo nombre y firma (6 args) que la versión anterior — CREATE OR
-- REPLACE alcanza acá, NO hace falta dropear nada (a diferencia de la migración anterior,
-- que sí cambiaba la cantidad de parámetros).
CREATE OR REPLACE FUNCTION register_cash_movement(
  p_session_id UUID,
  p_monto      NUMERIC,
  p_moneda     TEXT,
  p_tipo       TEXT,
  p_motivo     TEXT,
  p_categoria  TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
  v_categoria TEXT;
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

  IF lower(p_tipo) = 'salida' THEN
    v_categoria := lower(coalesce(p_categoria, 'otro'));
    IF v_categoria NOT IN ('restock', 'proveedor', 'gasto_personal', 'funcionario', 'otro') THEN
      RAISE EXCEPTION 'Categoría de salida inválida: %', p_categoria;
    END IF;
  ELSE
    v_categoria := NULL;
  END IF;

  PERFORM 1 FROM cash_sessions WHERE id = p_session_id AND estado = 'abierta' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No hay turno abierto para registrar el movimiento';
  END IF;

  INSERT INTO cash_outflows (session_id, monto, moneda, tipo, motivo, categoria)
  VALUES (p_session_id, p_monto, upper(p_moneda), lower(p_tipo), trim(p_motivo), v_categoria)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
