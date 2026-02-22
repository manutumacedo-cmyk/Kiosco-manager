-- Migration: Sales Cancellation System
-- Purpose: Add estado column to sales and RPC function to cancel sales atomically
-- Execute this in Supabase SQL Editor

-- 1. Agregar columna 'estado' a la tabla sales
ALTER TABLE sales ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'activa';

-- 2. Crear índice para búsquedas por estado
CREATE INDEX IF NOT EXISTS idx_sales_estado ON sales(estado);

-- 3. Función RPC para cancelar venta y devolver stock atómicamente
CREATE OR REPLACE FUNCTION cancel_sale(p_sale_id UUID)
RETURNS json AS $$
DECLARE
  v_sale_estado TEXT;
  v_items_count INTEGER;
BEGIN
  -- Verificar que la venta existe y está activa
  SELECT estado INTO v_sale_estado
  FROM sales
  WHERE id = p_sale_id;

  IF v_sale_estado IS NULL THEN
    RAISE EXCEPTION 'Venta no encontrada';
  END IF;

  IF v_sale_estado = 'anulada' THEN
    RAISE EXCEPTION 'La venta ya está anulada';
  END IF;

  -- Marcar venta como anulada
  UPDATE sales
  SET estado = 'anulada'
  WHERE id = p_sale_id;

  -- Devolver stock de todos los productos vendidos
  UPDATE products p
  SET stock = p.stock + si.cantidad
  FROM sale_items si
  WHERE si.sale_id = p_sale_id
    AND si.product_id = p.id;

  -- Contar items afectados
  SELECT COUNT(*) INTO v_items_count
  FROM sale_items
  WHERE sale_id = p_sale_id;

  -- Retornar resultado
  RETURN json_build_object(
    'success', true,
    'sale_id', p_sale_id,
    'items_restored', v_items_count
  );

EXCEPTION
  WHEN OTHERS THEN
    -- En caso de error, hacer rollback automático
    RAISE EXCEPTION 'Error al cancelar venta: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- 4. Comentarios
COMMENT ON COLUMN sales.estado IS 'Estado de la venta: activa o anulada';
COMMENT ON FUNCTION cancel_sale IS 'Cancela una venta y devuelve el stock de los productos vendidos';
