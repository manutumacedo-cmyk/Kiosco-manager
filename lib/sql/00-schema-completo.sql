-- =========================================================================
-- KIOSCO MANAGER / "24 SIETE" — ESQUEMA COMPLETO (reconstrucción desde cero)
-- =========================================================================
-- Este archivo recrea TODA la base de datos que la app espera hoy.
-- Ejecutar UNA vez en el proyecto Supabase nuevo (SQL Editor o vía migración).
--
-- Es idempotente: se puede correr de nuevo sin romper (usa IF NOT EXISTS /
-- CREATE OR REPLACE).
--
-- Reconstruido a partir de:
--   types/database.ts y los servicios en lib/services/*.
--   Migraciones originales en lib/sql/*.sql (consolidadas acá).
--
-- NOTA DE SEGURIDAD (ver docs/01-AUDITORIA.md · B5):
--   Las policies RLS de abajo son PÚBLICAS (USING true) porque la app llama a
--   Supabase con la anon key desde el navegador y NO usa Supabase Auth.
--   Esto es TEMPORAL para que la app funcione. Se endurece en la Fase 4.
-- =========================================================================

-- ============================ TABLAS BASE ================================

-- ---- products -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre       TEXT NOT NULL,
  categoria    TEXT,                              -- Bebidas | Alimento | Vasos | Otros
  precio       NUMERIC(10,2) NOT NULL DEFAULT 0,
  costo        NUMERIC(10,2) NOT NULL DEFAULT 0,  -- para ganancia limpia (venta - costo)
  stock        INTEGER NOT NULL DEFAULT 0,
  stock_minimo INTEGER NOT NULL DEFAULT 0,
  activo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- cash_sessions (sesiones de caja por turno) -------------------------
-- Un turno puede cruzar la medianoche. apertura/cierre son manuales.
CREATE TABLE IF NOT EXISTS cash_sessions (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  cajero              TEXT          NOT NULL,
  apertura_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  monto_inicial       NUMERIC(10,2) NOT NULL DEFAULT 0,   -- fondo inicial, en UYU
  monto_inicial_brl   NUMERIC(10,2) NOT NULL DEFAULT 0,  -- fondo inicial, en BRL
  estado              TEXT          NOT NULL DEFAULT 'abierta'
                                    CHECK (estado IN ('abierta', 'cerrada')),
  cerrado_por         TEXT,                   -- quién cierra (puede diferir del cajero)
  cierre_at           TIMESTAMPTZ,
  notas_cierre        TEXT,
  -- Snapshot de totales al cierre (NULL mientras está abierta)
  total_ventas        NUMERIC(10,2),
  total_efectivo_uyu  NUMERIC(10,2),
  total_efectivo_brl  NUMERIC(10,2),  -- BRL neto: Σ(pagado BRL) − Σ(vuelto BRL)
  total_digital       NUMERIC(10,2),
  cantidad_ventas     INTEGER,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ---- sales (cabecera de venta) ------------------------------------------
CREATE TABLE IF NOT EXISTS sales (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha         TIMESTAMPTZ NOT NULL DEFAULT now(),
  metodo_pago   TEXT NOT NULL,
  total         NUMERIC(10,2) NOT NULL DEFAULT 0,
  nota          TEXT,
  moneda        TEXT NOT NULL DEFAULT 'UYU',  -- 'UYU' | 'BRL' (moneda en que pagó el cliente)
  pagado        NUMERIC(10,2),                -- monto entregado, EN LA MONEDA de moneda (nullable)
  vuelto        NUMERIC(10,2),                -- vuelto entregado, en la moneda de vuelto_moneda (nullable)
  vuelto_moneda TEXT CHECK (vuelto_moneda IN ('UYU', 'BRL')),  -- NULL = UYU (default)
  estado        TEXT NOT NULL DEFAULT 'activa',  -- 'activa' | 'anulada'
  session_id    UUID REFERENCES cash_sessions(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- sale_items (detalle de venta) --------------------------------------
-- OJO: product_id NO tiene FK a products a propósito. El flujo actual de
-- combos guarda una línea con product_id = combo.id (que no está en products).
-- Ver docs/01-AUDITORIA.md · B2. Se revisa en la Fase 1.3.
CREATE TABLE IF NOT EXISTS sale_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id         UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL,
  cantidad        INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- restock_sources (proveedores / lugares de compra) ------------------
CREATE TABLE IF NOT EXISTS restock_sources (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  lugar         TEXT NOT NULL,
  precio_compra NUMERIC(10,2) NOT NULL DEFAULT 0,
  moneda        TEXT NOT NULL DEFAULT 'UYU',
  presentacion  TEXT,
  contacto      TEXT,
  url           TEXT,
  notas         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- restock_purchases (compras de reposición) --------------------------
CREATE TABLE IF NOT EXISTS restock_purchases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha           TIMESTAMPTZ NOT NULL DEFAULT now(),
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  source_id       UUID REFERENCES restock_sources(id) ON DELETE SET NULL,
  cantidad        INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario NUMERIC(10,2) NOT NULL DEFAULT 0,
  moneda          TEXT NOT NULL DEFAULT 'UYU',
  costo_total     NUMERIC(10,2) NOT NULL DEFAULT 0,
  notas           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- combos -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS combos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  precio      NUMERIC(10,2) NOT NULL,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- combo_items --------------------------------------------------------
CREATE TABLE IF NOT EXISTS combo_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id   UUID NOT NULL REFERENCES combos(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  cantidad   INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- exchange_rate_config (tasa BRL/UYU) --------------------------------
CREATE TABLE IF NOT EXISTS exchange_rate_config (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  currency_from TEXT NOT NULL,
  currency_to   TEXT NOT NULL,
  rate          NUMERIC(10,4) NOT NULL CHECK (rate > 0),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (currency_from, currency_to)
);

-- ---- cierres_caja (cierre de caja "legacy", por día) --------------------
-- NOTA: hoy funciona por día calendario. En la Fase 2 se migra a sesiones
-- de caja (apertura/cierre por turno). Ver docs/01-AUDITORIA.md · B1.
CREATE TABLE IF NOT EXISTS cierres_caja (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha_cierre        TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_efectivo      NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_debito        NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_transferencia NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_brl           NUMERIC(10,2) NOT NULL DEFAULT 0,
  cantidad_ventas     INTEGER NOT NULL DEFAULT 0,
  monto_total         NUMERIC(10,2) NOT NULL DEFAULT 0,
  notas               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- sale_combos (combos vendidos, para reportes con costo) -------------
-- La usan lib/services/sales.ts y reports.ts (versión con combos en reportes).
CREATE TABLE IF NOT EXISTS sale_combos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id         UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  combo_id        UUID,                 -- sin FK estricta: el combo podría borrarse luego
  combo_nombre    TEXT NOT NULL,
  cantidad        INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario NUMERIC(10,2) NOT NULL DEFAULT 0,
  costo_unitario  NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- strategic_insights -------------------------------------------------
CREATE TABLE IF NOT EXISTS strategic_insights (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo            TEXT NOT NULL,
  titulo          TEXT NOT NULL,
  mensaje         TEXT NOT NULL,
  prioridad       SMALLINT NOT NULL DEFAULT 2 CHECK (prioridad IN (1, 2, 3)),
  accion_sugerida TEXT,
  mostrado        BOOLEAN NOT NULL DEFAULT FALSE,
  context_data    JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================== ÍNDICES ==================================
CREATE INDEX IF NOT EXISTS idx_products_activo            ON products(activo);
CREATE INDEX IF NOT EXISTS idx_products_categoria         ON products(categoria);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_session    ON cash_sessions (estado) WHERE estado = 'abierta';
CREATE INDEX IF NOT EXISTS idx_sales_fecha                ON sales(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_sales_estado               ON sales(estado);
CREATE INDEX IF NOT EXISTS idx_sales_session_id           ON sales(session_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id         ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id      ON sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_sale_combos_sale_id        ON sale_combos(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_combos_created_at     ON sale_combos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sale_combos_combo_id       ON sale_combos(combo_id);
CREATE INDEX IF NOT EXISTS idx_restock_sources_product    ON restock_sources(product_id);
CREATE INDEX IF NOT EXISTS idx_restock_purchases_product  ON restock_purchases(product_id);
CREATE INDEX IF NOT EXISTS idx_combos_activo              ON combos(activo);
CREATE INDEX IF NOT EXISTS idx_combo_items_combo_id       ON combo_items(combo_id);
CREATE INDEX IF NOT EXISTS idx_combo_items_product_id     ON combo_items(product_id);
CREATE INDEX IF NOT EXISTS idx_exchange_currency          ON exchange_rate_config(currency_from, currency_to);
CREATE INDEX IF NOT EXISTS idx_cierres_caja_fecha         ON cierres_caja(fecha_cierre DESC);
CREATE INDEX IF NOT EXISTS idx_insights_mostrado          ON strategic_insights(mostrado);
CREATE INDEX IF NOT EXISTS idx_insights_prioridad         ON strategic_insights(prioridad);
CREATE INDEX IF NOT EXISTS idx_insights_created_at        ON strategic_insights(created_at DESC);

-- ============================= FUNCIONES =================================

-- Limpiar firmas viejas si existieran
DROP FUNCTION IF EXISTS decrement_stock(uuid, integer);
DROP FUNCTION IF EXISTS increment_stock(uuid, integer);
DROP FUNCTION IF EXISTS create_sale_atomic(text, numeric, text, jsonb);
DROP FUNCTION IF EXISTS cancel_sale(uuid);

-- 1) Decremento atómico de stock (bloquea la fila con FOR UPDATE)
CREATE OR REPLACE FUNCTION decrement_stock(p_product_id uuid, p_cantidad integer)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  current_stock integer;
  new_stock integer;
BEGIN
  SELECT stock INTO current_stock FROM products WHERE id = p_product_id FOR UPDATE;
  IF current_stock IS NULL THEN
    RAISE EXCEPTION 'Producto % no encontrado', p_product_id;
  END IF;
  new_stock := current_stock - p_cantidad;
  IF new_stock < 0 THEN
    RAISE EXCEPTION 'Stock insuficiente para producto %. Actual: %, Pedido: %',
      p_product_id, current_stock, p_cantidad;
  END IF;
  UPDATE products SET stock = new_stock WHERE id = p_product_id;
  RETURN new_stock;
END;
$$;

-- 2) Incremento atómico de stock (reposición)
CREATE OR REPLACE FUNCTION increment_stock(p_product_id uuid, p_cantidad integer)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  current_stock integer;
  new_stock integer;
BEGIN
  SELECT stock INTO current_stock FROM products WHERE id = p_product_id FOR UPDATE;
  IF current_stock IS NULL THEN
    RAISE EXCEPTION 'Producto % no encontrado', p_product_id;
  END IF;
  new_stock := current_stock + p_cantidad;
  UPDATE products SET stock = new_stock WHERE id = p_product_id;
  RETURN new_stock;
END;
$$;

-- 3) Venta atómica: crea sale + items + descuenta stock en una transacción
CREATE OR REPLACE FUNCTION create_sale_atomic(
  p_metodo_pago text,
  p_total       numeric,
  p_nota        text,
  p_items       jsonb,                       -- array de {product_id, cantidad, precio_unitario}
  p_moneda      text    DEFAULT 'UYU',       -- moneda en que pagó el cliente: 'UYU' | 'BRL'
  p_pagado      numeric DEFAULT NULL,        -- monto entregado, EN LA MONEDA p_moneda
  p_vuelto      numeric DEFAULT NULL         -- vuelto entregado, EN UYU
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  new_sale_id uuid;
  item jsonb;
  cur_stock integer;
  new_stock integer;
  v_product_exists boolean;
BEGIN
  INSERT INTO sales (metodo_pago, total, nota, moneda, pagado, vuelto)
  VALUES (p_metodo_pago, p_total, p_nota, COALESCE(p_moneda, 'UYU'), p_pagado, p_vuelto)
  RETURNING id INTO new_sale_id;

  FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO sale_items (sale_id, product_id, cantidad, precio_unitario)
    VALUES (
      new_sale_id,
      (item->>'product_id')::uuid,
      (item->>'cantidad')::integer,
      (item->>'precio_unitario')::numeric
    );

    -- Solo descontar stock si el product_id existe en products
    -- (las líneas "combo" referencian el id del combo, que no es un producto).
    SELECT EXISTS(SELECT 1 FROM products WHERE id = (item->>'product_id')::uuid)
      INTO v_product_exists;

    IF v_product_exists THEN
      SELECT stock INTO cur_stock
      FROM products WHERE id = (item->>'product_id')::uuid FOR UPDATE;

      new_stock := cur_stock - (item->>'cantidad')::integer;
      IF new_stock < 0 THEN
        RAISE EXCEPTION 'Stock insuficiente para producto %', item->>'product_id';
      END IF;

      UPDATE products SET stock = new_stock WHERE id = (item->>'product_id')::uuid;
    END IF;
  END LOOP;

  RETURN new_sale_id;
END;
$$;

-- 4) Cancelar venta y devolver stock (atómico)
CREATE OR REPLACE FUNCTION cancel_sale(p_sale_id uuid)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  v_sale_estado text;
  v_items_count integer;
BEGIN
  SELECT estado INTO v_sale_estado FROM sales WHERE id = p_sale_id;
  IF v_sale_estado IS NULL THEN
    RAISE EXCEPTION 'Venta no encontrada';
  END IF;
  IF v_sale_estado = 'anulada' THEN
    RAISE EXCEPTION 'La venta ya está anulada';
  END IF;

  UPDATE sales SET estado = 'anulada' WHERE id = p_sale_id;

  -- Devolver stock solo de product_id que existan en products
  UPDATE products p
  SET stock = p.stock + si.cantidad
  FROM sale_items si
  WHERE si.sale_id = p_sale_id AND si.product_id = p.id;

  SELECT COUNT(*) INTO v_items_count FROM sale_items WHERE sale_id = p_sale_id;

  RETURN json_build_object('success', true, 'sale_id', p_sale_id, 'items_restored', v_items_count);
END;
$$;

-- 5) Cerrar sesión de caja y grabar snapshot de totales (atómico)
CREATE OR REPLACE FUNCTION close_cash_session(
  p_session_id  UUID,
  p_cerrado_por TEXT,
  p_notas       TEXT DEFAULT NULL
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
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cash_sessions WHERE id = p_session_id AND estado = 'abierta'
  ) THEN
    RAISE EXCEPTION 'Sesión no encontrada o ya cerrada';
  END IF;

  SELECT
    COALESCE(SUM(total), 0),
    COALESCE(SUM(CASE WHEN metodo_pago = 'efectivo' AND moneda = 'UYU' THEN total ELSE 0 END), 0),
    -- BRL neto: reales recibidos menos reales devueltos como vuelto
    COALESCE(SUM(CASE WHEN metodo_pago = 'efectivo' AND moneda = 'BRL' THEN pagado ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN vuelto_moneda = 'BRL' THEN vuelto ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN metodo_pago != 'efectivo' THEN total ELSE 0 END), 0),
    COUNT(*)
  INTO v_total_ventas, v_efectivo_uyu, v_efectivo_brl, v_digital, v_cantidad
  FROM sales
  WHERE session_id = p_session_id AND estado = 'activa';

  UPDATE cash_sessions SET
    estado             = 'cerrada',
    cerrado_por        = p_cerrado_por,
    cierre_at          = now(),
    notas_cierre       = p_notas,
    total_ventas       = v_total_ventas,
    total_efectivo_uyu = v_efectivo_uyu,
    total_efectivo_brl = v_efectivo_brl,
    total_digital      = v_digital,
    cantidad_ventas    = v_cantidad
  WHERE id = p_session_id;
END;
$$;

-- 6) Trigger para mantener combos.updated_at
CREATE OR REPLACE FUNCTION update_combo_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_combo_timestamp ON combos;
CREATE TRIGGER trigger_update_combo_timestamp
  BEFORE UPDATE ON combos
  FOR EACH ROW
  EXECUTE FUNCTION update_combo_timestamp();

-- =============================== VISTAS ==================================

-- Combos con sus productos (la app la consulta como tabla)
CREATE OR REPLACE VIEW combos_with_products AS
SELECT
  c.id, c.nombre, c.descripcion, c.precio, c.activo, c.created_at,
  COALESCE(
    json_agg(
      json_build_object(
        'product_id', ci.product_id,
        'cantidad',   ci.cantidad,
        'nombre',     p.nombre,
        'precio',     p.precio
      )
    ) FILTER (WHERE ci.id IS NOT NULL),
    '[]'
  ) AS items
FROM combos c
LEFT JOIN combo_items ci ON c.id = ci.combo_id
LEFT JOIN products p     ON ci.product_id = p.id
GROUP BY c.id, c.nombre, c.descripcion, c.precio, c.activo, c.created_at;

-- ================== RLS (TEMPORAL — público, ver B5) =====================
ALTER TABLE cash_sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE products             ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales                ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_combos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE restock_sources      ENABLE ROW LEVEL SECURITY;
ALTER TABLE restock_purchases    ENABLE ROW LEVEL SECURITY;
ALTER TABLE combos               ENABLE ROW LEVEL SECURITY;
ALTER TABLE combo_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_rate_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE cierres_caja         ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategic_insights   ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cash_sessions','products','sales','sale_items','sale_combos','restock_sources','restock_purchases',
    'combos','combo_items','exchange_rate_config','cierres_caja','strategic_insights'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "acceso_publico_%1$s" ON %1$s;', t);
    EXECUTE format('CREATE POLICY "acceso_publico_%1$s" ON %1$s FOR ALL USING (true) WITH CHECK (true);', t);
  END LOOP;
END $$;

-- ============================ DATOS INICIALES ============================
-- Tasa de cambio por defecto BRL -> UYU
INSERT INTO exchange_rate_config (currency_from, currency_to, rate)
VALUES ('BRL', 'UYU', 7.5000)
ON CONFLICT (currency_from, currency_to) DO NOTHING;

-- =========================================================================
-- FIN DEL ESQUEMA
-- =========================================================================
