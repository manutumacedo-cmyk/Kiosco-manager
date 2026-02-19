-- Migration: Cash Register Closures
-- Purpose: Track daily cash register closures with payment method breakdowns
-- Execute this in Supabase SQL Editor

-- Tabla de cierres de caja
CREATE TABLE IF NOT EXISTS cierres_caja (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha_cierre TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_efectivo DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_debito DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_transferencia DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_brl DECIMAL(10,2) NOT NULL DEFAULT 0,
  cantidad_ventas INTEGER NOT NULL DEFAULT 0,
  monto_total DECIMAL(10,2) NOT NULL DEFAULT 0,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index para buscar cierres por fecha
CREATE INDEX IF NOT EXISTS idx_cierres_caja_fecha_cierre
  ON cierres_caja(fecha_cierre DESC);

-- RLS policies (opcional - ajustar según tu configuración de auth)
ALTER TABLE cierres_caja ENABLE ROW LEVEL SECURITY;

-- Eliminar policies existentes si las hay
DROP POLICY IF EXISTS "Allow read access to authenticated users" ON cierres_caja;
DROP POLICY IF EXISTS "Allow insert access to authenticated users" ON cierres_caja;

-- Policy: Permitir lectura para usuarios autenticados
CREATE POLICY "Allow read access to authenticated users"
  ON cierres_caja FOR SELECT
  USING (true);

-- Policy: Permitir inserción para usuarios autenticados
CREATE POLICY "Allow insert access to authenticated users"
  ON cierres_caja FOR INSERT
  WITH CHECK (true);

-- Comentarios
COMMENT ON TABLE cierres_caja IS 'Registro de cierres de caja diarios con totales por método de pago';
COMMENT ON COLUMN cierres_caja.fecha_cierre IS 'Fecha y hora del cierre de caja';
COMMENT ON COLUMN cierres_caja.total_efectivo IS 'Total en efectivo (UYU)';
COMMENT ON COLUMN cierres_caja.total_debito IS 'Total en débito (UYU)';
COMMENT ON COLUMN cierres_caja.total_transferencia IS 'Total en transferencia (UYU)';
COMMENT ON COLUMN cierres_caja.total_brl IS 'Total cobrado en BRL (sin convertir)';
COMMENT ON COLUMN cierres_caja.cantidad_ventas IS 'Cantidad de ventas en el período';
COMMENT ON COLUMN cierres_caja.monto_total IS 'Monto total del cierre (UYU)';
