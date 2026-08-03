-- ============================================================================
-- B39 — Costeo de productos: botella ÷ porciones
-- ============================================================================
-- 78 de 93 productos activos no tienen costo cargado, y son los que más facturan
-- (la categoría "Vasos" sola es el 67% de la facturación). Con eso, toda ganancia
-- y todo margen del sistema salen inflados.
--
-- Los "Vasos" son tragos servidos de una botella: su costo no es un precio de
-- compra, es la porción. Guardamos los dos datos de origen (costo de la botella y
-- cuántas porciones rinde) además del costo unitario, para que cuando cambie el
-- precio del proveedor se toque un solo número y se recalcule.
--
-- `costo` sigue siendo la única columna que leen los reportes: no se cambia su
-- semántica, solo se agrega de dónde salió.
-- ============================================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS costo_botella         NUMERIC,
  ADD COLUMN IF NOT EXISTS porciones_por_botella INTEGER,
  ADD COLUMN IF NOT EXISTS costo_actualizado_at  TIMESTAMPTZ;

COMMENT ON COLUMN products.costo_botella IS
  'Costo del envase/botella del que se sirve este producto (B39). Solo informativo: el costo unitario real vive en products.costo.';
COMMENT ON COLUMN products.porciones_por_botella IS
  'Cuántas porciones rinde una botella (B39). costo = costo_botella / porciones_por_botella.';

-- Productos ordenados por impacto real: lo que más factura y no tiene costo va
-- primero. Cargar los 11 primeros cubre dos tercios de la facturación, así que el
-- orden importa más que la lista completa.
CREATE OR REPLACE FUNCTION productos_para_costear(p_dias integer DEFAULT 30)
RETURNS TABLE (
  id                    uuid,
  nombre                text,
  categoria             text,
  precio                numeric,
  costo                 numeric,
  costo_botella         numeric,
  porciones_por_botella integer,
  unidades_vendidas     bigint,
  facturado             numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    p.id, p.nombre, p.categoria, p.precio, p.costo,
    p.costo_botella, p.porciones_por_botella,
    COALESCE(v.unidades, 0)::bigint,
    COALESCE(v.facturado, 0)
  FROM products p
  LEFT JOIN LATERAL (
    SELECT SUM(si.cantidad) AS unidades,
           SUM(si.cantidad * si.precio_unitario) AS facturado
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id AND s.estado = 'activa'
    WHERE si.product_id = p.id
      AND s.fecha > now() - (p_dias || ' days')::interval
  ) v ON true
  WHERE p.activo
  ORDER BY
    -- Primero lo que factura y NO tiene costo: ahí está todo el error de margen.
    (COALESCE(p.costo, 0) = 0) DESC,
    COALESCE(v.facturado, 0) DESC,
    p.nombre;
$$;
