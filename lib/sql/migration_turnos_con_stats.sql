-- ============================================================================
-- turnos_con_stats — totales por turno, agregados en el servidor
-- ============================================================================
-- La primera versión del historial por turnos traía todas las ventas y todos los
-- sale_items al cliente y agregaba en memoria. Con 2.553 ventas activas eso
-- significaba un `.in("sale_id", [...2553 uuids])`, o sea una URL de ~95 KB que
-- el servidor rechaza: la lista de turnos salía vacía.
--
-- Acá se agrega del lado del servidor. Una sola llamada, sin listas de ids.
--
-- OJO: el criterio de ganancia (ingresos − costo mercadería − salidas UYU) es el
-- mismo que calcularGananciaReal() en lib/services/reports.ts. Si cambia uno,
-- cambiar el otro.
-- ============================================================================

CREATE OR REPLACE FUNCTION turnos_con_stats(p_limit integer DEFAULT 60)
RETURNS TABLE (
  session_id           uuid,
  ingresos             numeric,
  cantidad_ventas      integer,
  cantidad_anuladas    integer,
  costo_mercaderia     numeric,
  salidas_uyu          numeric,
  facturado_sin_costo  numeric,
  cantidad_reasignadas integer
)
LANGUAGE sql
STABLE
AS $$
  WITH turnos AS (
    SELECT id FROM cash_sessions ORDER BY apertura_at DESC LIMIT p_limit
  ),
  ventas AS (
    SELECT s.id, s.session_id, s.total, s.estado, s.session_id_original
    FROM sales s
    JOIN turnos t ON t.id = s.session_id
  ),
  -- Costo de items sueltos. product_id que no existe en products es una línea de
  -- combo (sale_items no tiene FK a propósito, ver B2): su costo sale de abajo.
  costo_items AS (
    SELECT v.session_id,
           SUM(p.costo * si.cantidad) AS costo,
           -- Facturación de productos SIN costo cargado: es lo que permite avisar
           -- que la ganancia está incompleta en vez de mostrarla como exacta (B39).
           SUM(CASE WHEN COALESCE(p.costo, 0) = 0
                    THEN si.cantidad * si.precio_unitario ELSE 0 END) AS sin_costo
    FROM ventas v
    JOIN sale_items si ON si.sale_id = v.id
    JOIN products p ON p.id = si.product_id
    WHERE v.estado = 'activa'
    GROUP BY v.session_id
  ),
  costo_combos AS (
    SELECT v.session_id, SUM(sc.costo_unitario * sc.cantidad) AS costo
    FROM ventas v
    JOIN sale_combos sc ON sc.sale_id = v.id
    WHERE v.estado = 'activa'
    GROUP BY v.session_id
  ),
  salidas AS (
    SELECT o.session_id, SUM(o.monto) AS monto
    FROM cash_outflows o
    JOIN turnos t ON t.id = o.session_id
    WHERE o.tipo = 'salida' AND o.moneda = 'UYU'
    GROUP BY o.session_id
  )
  SELECT
    t.id,
    COALESCE(SUM(v.total) FILTER (WHERE v.estado = 'activa'), 0),
    COALESCE(COUNT(*) FILTER (WHERE v.estado = 'activa'), 0)::integer,
    COALESCE(COUNT(*) FILTER (WHERE v.estado = 'anulada'), 0)::integer,
    COALESCE(MAX(ci.costo), 0) + COALESCE(MAX(cc.costo), 0),
    COALESCE(MAX(sa.monto), 0),
    COALESCE(MAX(ci.sin_costo), 0),
    COALESCE(COUNT(*) FILTER (WHERE v.session_id_original IS NOT NULL), 0)::integer
  FROM turnos t
  LEFT JOIN ventas v       ON v.session_id  = t.id
  LEFT JOIN costo_items ci ON ci.session_id = t.id
  LEFT JOIN costo_combos cc ON cc.session_id = t.id
  LEFT JOIN salidas sa     ON sa.session_id = t.id
  GROUP BY t.id;
$$;
