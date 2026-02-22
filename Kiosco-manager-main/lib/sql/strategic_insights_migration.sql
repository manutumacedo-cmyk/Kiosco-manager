-- ================================================================
-- MIGRACIÓN: MOTOR DE INTELIGENCIA ESTRATÉGICA DINÁMICA
-- ================================================================
-- Ejecutar este SQL en Supabase SQL Editor
--
-- Crear tabla para almacenar insights estratégicos generados automáticamente

CREATE TABLE IF NOT EXISTS strategic_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  mensaje TEXT NOT NULL,
  prioridad SMALLINT NOT NULL DEFAULT 2 CHECK (prioridad IN (1, 2, 3)),
  accion_sugerida TEXT,
  mostrado BOOLEAN NOT NULL DEFAULT FALSE,
  context_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_strategic_insights_tipo ON strategic_insights(tipo);
CREATE INDEX IF NOT EXISTS idx_strategic_insights_mostrado ON strategic_insights(mostrado);
CREATE INDEX IF NOT EXISTS idx_strategic_insights_prioridad ON strategic_insights(prioridad);
CREATE INDEX IF NOT EXISTS idx_strategic_insights_created_at ON strategic_insights(created_at DESC);

-- RLS (Row Level Security) - Permitir acceso desde la app
ALTER TABLE strategic_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir acceso público a insights"
  ON strategic_insights
  FOR ALL
  USING (true);

-- Comentarios para documentación
COMMENT ON TABLE strategic_insights IS 'Almacena insights estratégicos generados automáticamente después de cada venta';
COMMENT ON COLUMN strategic_insights.tipo IS 'Tipo de insight: margen_bajo, producto_estancado, hora_muerta, combo_sugerido, precio_optimizar, stock_critico, tendencia_alcista, oportunidad_upsell';
COMMENT ON COLUMN strategic_insights.prioridad IS '1=Alta, 2=Media, 3=Baja';
COMMENT ON COLUMN strategic_insights.context_data IS 'Datos contextuales del insight (product_id, métricas, etc.)';
COMMENT ON COLUMN strategic_insights.mostrado IS 'Indica si el insight ya fue mostrado al usuario (para rotación)';
