-- =========================================================
-- Agregar columna 'costo' a la tabla products
-- Esto permite calcular la ganancia limpia (venta - costo)
-- Ejecutar en Supabase SQL Editor
-- =========================================================

-- Agregar columna costo (precio de compra/costo unitario)
ALTER TABLE products
ADD COLUMN IF NOT EXISTS costo numeric DEFAULT 0;

-- Actualizar comentario de la columna
COMMENT ON COLUMN products.costo IS 'Costo de compra unitario del producto (para calcular ganancia limpia)';