-- ================================================================
-- MIGRACIÓN: SISTEMA DE FRONTERA (UYU/BRL)
-- ================================================================
-- Ejecutar este SQL en Supabase SQL Editor
--
-- Características:
-- 1. Combos personalizados
-- 2. Configuración de tasas de cambio (BRL/UYU)
-- 3. Soporte para ventas multi-moneda

-- ========== TABLA DE COMBOS ==========
CREATE TABLE IF NOT EXISTS combos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  descripcion TEXT,
  precio DECIMAL(10, 2) NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ========== ITEMS DE COMBOS ==========
CREATE TABLE IF NOT EXISTS combo_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id UUID NOT NULL REFERENCES combos(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  cantidad INT NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ========== CONFIGURACIÓN DE TASAS DE CAMBIO ==========
CREATE TABLE IF NOT EXISTS exchange_rate_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  currency_from TEXT NOT NULL, -- ej: 'BRL'
  currency_to TEXT NOT NULL,   -- ej: 'UYU'
  rate DECIMAL(10, 4) NOT NULL CHECK (rate > 0), -- ej: 7.5000
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(currency_from, currency_to)
);

-- ========== ÍNDICES ==========
CREATE INDEX IF NOT EXISTS idx_combos_activo ON combos(activo);
CREATE INDEX IF NOT EXISTS idx_combo_items_combo_id ON combo_items(combo_id);
CREATE INDEX IF NOT EXISTS idx_combo_items_product_id ON combo_items(product_id);
CREATE INDEX IF NOT EXISTS idx_exchange_currency ON exchange_rate_config(currency_from, currency_to);

-- ========== RLS (Row Level Security) ==========
ALTER TABLE combos ENABLE ROW LEVEL SECURITY;
ALTER TABLE combo_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_rate_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir acceso público a combos"
  ON combos
  FOR ALL
  USING (true);

CREATE POLICY "Permitir acceso público a combo_items"
  ON combo_items
  FOR ALL
  USING (true);

CREATE POLICY "Permitir acceso público a exchange_rate_config"
  ON exchange_rate_config
  FOR ALL
  USING (true);

-- ========== COMENTARIOS ==========
COMMENT ON TABLE combos IS 'Combos personalizados con precio único';
COMMENT ON TABLE combo_items IS 'Productos incluidos en cada combo';
COMMENT ON TABLE exchange_rate_config IS 'Configuración de tasas de cambio (BRL/UYU)';

-- ========== DATOS INICIALES ==========
-- Insertar tasa de cambio por defecto BRL -> UYU
INSERT INTO exchange_rate_config (currency_from, currency_to, rate)
VALUES ('BRL', 'UYU', 7.5000)
ON CONFLICT (currency_from, currency_to) DO NOTHING;

-- ========== FUNCIÓN PARA ACTUALIZAR COMBO ==========
CREATE OR REPLACE FUNCTION update_combo_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_combo_timestamp
  BEFORE UPDATE ON combos
  FOR EACH ROW
  EXECUTE FUNCTION update_combo_timestamp();

-- ========== VISTA DE COMBOS CON PRODUCTOS ==========
CREATE OR REPLACE VIEW combos_with_products AS
SELECT
  c.id,
  c.nombre,
  c.descripcion,
  c.precio,
  c.activo,
  c.created_at,
  json_agg(
    json_build_object(
      'product_id', ci.product_id,
      'cantidad', ci.cantidad,
      'nombre', p.nombre,
      'precio', p.precio
    )
  ) as items
FROM combos c
LEFT JOIN combo_items ci ON c.id = ci.combo_id
LEFT JOIN products p ON ci.product_id = p.id
GROUP BY c.id, c.nombre, c.descripcion, c.precio, c.activo, c.created_at;

COMMENT ON VIEW combos_with_products IS 'Vista de combos con sus productos incluidos';
