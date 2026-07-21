-- ============================================================================
-- Migración: categorización de salidas de caja (restock / proveedor / gasto
-- personal / otro) + vista agregada para el dashboard.
--
-- Contexto: el dashboard de reportes calculaba "ganancia limpia" = ingresos −
-- costo de mercadería, SIN restar las salidas de caja (cash_outflows), lo que
-- infla la ganancia mostrada al dueño. Para poder desglosar "cuánto se fue en
-- restock" vs "cuánto en gastos personales" hace falta una categoría fija en
-- vez del "motivo" de texto libre actual.
-- ============================================================================

-- 1) Nueva columna. NULL para 'entrada' (no aplica categorizar plata que
--    entra), obligatoria para 'salida'.
ALTER TABLE cash_outflows ADD COLUMN IF NOT EXISTS categoria TEXT;

-- 2) Backfill: todo lo existente con tipo='salida' no tiene categoría — se
--    marca como 'otro' (no hay forma de inferir la categoría real de texto
--    libre histórico sin revisar motivo por motivo).
UPDATE cash_outflows SET categoria = 'otro' WHERE tipo = 'salida' AND categoria IS NULL;

-- 3) Constraint: salida siempre categorizada con un valor válido; entrada
--    siempre sin categoría (no se usa, evita datos ambiguos).
ALTER TABLE cash_outflows DROP CONSTRAINT IF EXISTS chk_cash_outflows_categoria;
ALTER TABLE cash_outflows ADD CONSTRAINT chk_cash_outflows_categoria CHECK (
  (tipo = 'salida' AND categoria IN ('restock', 'proveedor', 'gasto_personal', 'otro'))
  OR (tipo = 'entrada' AND categoria IS NULL)
);

-- 4) RPC register_cash_movement: agrega p_categoria. IMPORTANTE: Postgres no reemplaza una
--    función existente si la lista de parámetros cambia — crea un OVERLOAD nuevo y deja la
--    firma vieja de 5 argumentos viva (insertaría categoria=NULL en una salida, violando el
--    constraint). Hay que dropear la vieja explícitamente antes de crear la nueva.
DROP FUNCTION IF EXISTS register_cash_movement(UUID, NUMERIC, TEXT, TEXT, TEXT);

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
    IF v_categoria NOT IN ('restock', 'proveedor', 'gasto_personal', 'otro') THEN
      RAISE EXCEPTION 'Categoría de salida inválida: %', p_categoria;
    END IF;
  ELSE
    v_categoria := NULL; -- entrada nunca lleva categoría
  END IF;

  -- Lock de la sesión: evita registrar un movimiento mientras otro la cierra
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

-- 5) Vista agregada: pre-suma por sesión + categoría + moneda, para que el
--    dashboard no tenga que traer cada movimiento individual del período
--    (hasta 30 sesiones) y reducirlos en el cliente fila por fila.
CREATE OR REPLACE VIEW cash_outflows_by_category AS
SELECT
  session_id,
  tipo,
  categoria,
  moneda,
  SUM(monto) AS total
FROM cash_outflows
GROUP BY session_id, tipo, categoria, moneda;
