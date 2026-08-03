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
  -- user_id / cerrado_por_user_id: cuenta real (tabla `users`, gestionada aparte — no
  -- documentada en este archivo) que abrió/cerró el turno, verificada por JWT en
  -- middleware.ts. `cajero`/`cerrado_por` (TEXT) quedan para mostrar el nombre, pero ya
  -- no son texto libre editable — se completan con el username de la cuenta logueada.
  user_id             UUID REFERENCES users(id),
  cerrado_por_user_id UUID REFERENCES users(id),
  -- Snapshot de totales al cierre (NULL mientras está abierta)
  total_ventas        NUMERIC(10,2),
  total_efectivo_uyu  NUMERIC(10,2),
  total_efectivo_brl  NUMERIC(10,2),  -- BRL neto: Σ(pagado BRL) − Σ(vuelto BRL)
  total_digital       NUMERIC(10,2),
  cantidad_ventas     INTEGER,
  -- Arqueo de caja (B28): efectivo físico contado al cierre + diferencia (contado − esperado).
  -- esperado = fondo inicial + efectivo neto del turno. >0 sobra · <0 falta · 0 cuadra.
  efectivo_contado_uyu NUMERIC(10,2),
  efectivo_contado_brl NUMERIC(10,2),
  -- Movimientos de caja durante el turno (snapshot al cierre, ver cash_outflows). B32.
  total_salidas_uyu   NUMERIC(10,2),
  total_salidas_brl   NUMERIC(10,2),
  total_entradas_uyu  NUMERIC(10,2),
  total_entradas_brl  NUMERIC(10,2),
  -- esperado = fondo inicial + efectivo neto de ventas + entradas − salidas del turno
  diferencia_uyu      NUMERIC(10,2) GENERATED ALWAYS AS (
                        efectivo_contado_uyu - (monto_inicial + COALESCE(total_efectivo_uyu, 0) + COALESCE(total_entradas_uyu, 0) - COALESCE(total_salidas_uyu, 0))
                      ) STORED,
  diferencia_brl      NUMERIC(10,2) GENERATED ALWAYS AS (
                        efectivo_contado_brl - (monto_inicial_brl + COALESCE(total_efectivo_brl, 0) + COALESCE(total_entradas_brl, 0) - COALESCE(total_salidas_brl, 0))
                      ) STORED,
  -- Anulaciones POSTERIORES al cierre (B26). Los totales de arriba son el arqueo de
  -- esa noche y no se reescriben: el total real es snapshot − ajuste. Como las
  -- diferencia_* son GENERATED sobre total_efectivo_*, que el ajuste no toca, ningún
  -- camino del código puede alterar el arqueo. Ojo: eso vale para el código, no
  -- contra la base — con la RLS abierta de hoy se puede editar a mano (ver B36).
  ajuste_ventas_post_cierre       NUMERIC NOT NULL DEFAULT 0,
  ajuste_efectivo_uyu_post_cierre NUMERIC NOT NULL DEFAULT 0,
  ajuste_efectivo_brl_post_cierre NUMERIC NOT NULL DEFAULT 0,
  ajuste_digital_post_cierre      NUMERIC NOT NULL DEFAULT 0,
  cantidad_anuladas_post_cierre   INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ---- cash_outflows (movimientos de plata del local durante el turno: entrada/salida) — B32 ---
-- categoria: obligatoria para 'salida' (restock/proveedor/gasto_personal/otro), NULL para
-- 'entrada' (no aplica categorizar plata que entra). Ver migration_categoria_salidas.sql.
CREATE TABLE IF NOT EXISTS cash_outflows (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID          NOT NULL REFERENCES cash_sessions(id),
  monto       NUMERIC(10,2) NOT NULL CHECK (monto > 0),
  moneda      TEXT          NOT NULL CHECK (moneda IN ('UYU','BRL')),
  tipo        TEXT          NOT NULL DEFAULT 'salida' CHECK (tipo IN ('entrada','salida')),
  motivo      TEXT          NOT NULL,
  categoria   TEXT,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT chk_cash_outflows_categoria CHECK (
    (tipo = 'salida' AND categoria IN ('restock', 'proveedor', 'gasto_personal', 'funcionario', 'otro'))
    OR (tipo = 'entrada' AND categoria IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_cash_outflows_session ON cash_outflows(session_id);

-- Pre-suma salidas/entradas por sesión + categoría + moneda, para que el dashboard de
-- reportes no reduzca fila por fila cada movimiento del período (hasta 30 sesiones).
CREATE OR REPLACE VIEW cash_outflows_by_category AS
SELECT session_id, tipo, categoria, moneda, SUM(monto) AS total
FROM cash_outflows
GROUP BY session_id, tipo, categoria, moneda;

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
  tasa_cambio   NUMERIC(10,4),                -- tasa BRL→UYU usada en la venta (snapshot, B29)
  -- Movimiento físico NETO por cajón (entra +, sale −). Modelo "dos cajones": el
  -- cuadre de efectivo se calcula sumando estas columnas, no infiriendo desde `total`.
  -- Derivadas y forzadas por la DB (ver docs/01-AUDITORIA.md · B23/B24/B25).
  mov_efectivo_uyu NUMERIC(10,2) GENERATED ALWAYS AS (
    CASE WHEN metodo_pago = 'efectivo' THEN
        (CASE WHEN moneda = 'UYU' THEN COALESCE(pagado, 0) ELSE 0 END)
      - (CASE WHEN COALESCE(vuelto_moneda, 'UYU') = 'UYU' THEN COALESCE(vuelto, 0) ELSE 0 END)
    ELSE 0 END
  ) STORED,
  mov_efectivo_brl NUMERIC(10,2) GENERATED ALWAYS AS (
    CASE WHEN metodo_pago = 'efectivo' THEN
        (CASE WHEN moneda = 'BRL' THEN COALESCE(pagado, 0) ELSE 0 END)
      - (CASE WHEN vuelto_moneda = 'BRL' THEN COALESCE(vuelto, 0) ELSE 0 END)
    ELSE 0 END
  ) STORED,
  estado        TEXT NOT NULL DEFAULT 'activa',  -- 'activa' | 'anulada'
  session_id    UUID REFERENCES cash_sessions(id) ON DELETE SET NULL,
  client_request_id UUID,                 -- idempotencia de venta (B18): clave por intento de cobro
  anulada_por   TEXT,                     -- quién anuló la venta (B30)
  anulada_at    TIMESTAMPTZ,              -- cuándo se anuló (B30)
  -- Si el turno del POS ya estaba cerrado al cobrar, la venta se reasigna al turno
  -- vigente y acá queda el original (B27). NULL en el caso normal.
  session_id_original UUID REFERENCES cash_sessions(id) ON DELETE SET NULL,
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
-- Idempotencia de venta (B18): bloquea dos ventas con la misma clave; múltiples NULL permitidos.
CREATE UNIQUE INDEX IF NOT EXISTS sales_client_request_id_uniq ON sales(client_request_id) WHERE client_request_id IS NOT NULL;
-- Idempotencia de combos (B18): un reintento no duplica filas en sale_combos.
CREATE UNIQUE INDEX IF NOT EXISTS sale_combos_sale_combo_uniq  ON sale_combos(sale_id, combo_id);
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
DROP FUNCTION IF EXISTS create_sale_atomic(text, numeric, text, jsonb, text, numeric, numeric, text, uuid);
DROP FUNCTION IF EXISTS create_sale_atomic(text, numeric, text, jsonb, text, numeric, numeric, text, uuid, numeric);
DROP FUNCTION IF EXISTS create_sale_atomic(text, numeric, text, jsonb, text, numeric, numeric, text, uuid, numeric, uuid);
DROP FUNCTION IF EXISTS cancel_sale(uuid);
DROP FUNCTION IF EXISTS close_cash_session(uuid, text, text);

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
  p_vuelto        numeric DEFAULT NULL,        -- vuelto entregado, en la moneda de p_vuelto_moneda
  p_vuelto_moneda text    DEFAULT NULL,        -- 'UYU' | 'BRL' | NULL (NULL = UYU por defecto)
  p_session_id    uuid    DEFAULT NULL,        -- sesión de caja activa
  p_tasa_cambio   numeric DEFAULT NULL,        -- tasa BRL→UYU al momento de la venta (snapshot)
  p_client_request_id uuid DEFAULT NULL        -- idempotencia (B18): clave por intento de cobro
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
  v_nombre text;
  v_estado text;
  v_open_session uuid;
  v_session_original uuid := NULL;
  v_session_existe boolean := false;
BEGIN
  -- Idempotencia (B18): si ya existe una venta con esta clave (reintento tras
  -- respuesta perdida por corte de red), devolverla sin re-insertar ni re-descontar stock.
  IF p_client_request_id IS NOT NULL THEN
    SELECT id INTO new_sale_id FROM sales WHERE client_request_id = p_client_request_id;
    IF FOUND THEN
      RETURN new_sale_id;
    END IF;
  END IF;

  -- Validación de efectivo: el cuadre por cajón necesita saber qué entró y qué salió.
  -- Sin `pagado`, mov_efectivo_* daría 0 y el cajón quedaría mal (raíz de B24/B25).
  IF p_metodo_pago = 'efectivo' THEN
    IF p_pagado IS NULL OR p_pagado <= 0 THEN
      RAISE EXCEPTION 'Venta en efectivo: falta el monto pagado';
    END IF;
    IF p_vuelto IS NULL THEN
      RAISE EXCEPTION 'Venta en efectivo: falta el vuelto (usar 0 si es pago justo)';
    END IF;
    IF p_vuelto > 0 AND p_vuelto_moneda IS NULL THEN
      RAISE EXCEPTION 'Venta en efectivo con vuelto: falta la moneda del vuelto';
    END IF;
  END IF;

  -- B27: ¿el turno que mandó el POS sigue abierto? El POS cachea openSessionId al
  -- montar y el turno puede haberse cerrado en el medio (relevo de cajero). Sin este
  -- chequeo la venta se insertaba en un turno cerrado, cuyo snapshot ya está
  -- congelado: plata cobrada que no aparecía en ningún turno.
  --
  -- FOR SHARE (no FOR NO KEY UPDATE): bloquea contra close_cash_session, pero NO
  -- contra otras ventas — en hora pico no queremos serializar los cobros.
  -- El lock de cash_sessions va ANTES que el de products, igual que en cancel_sale:
  -- orden único sales → cash_sessions → products, si no hay deadlock.
  -- OJO: los dos locks de cash_sessions de este bloque son FOR SHARE a propósito.
  -- Es la única función que lockea DOS filas de la misma tabla; que sean
  -- auto-compatibles es lo que evita un deadlock entre dos ventas que las tomen
  -- en orden inverso. No subir el nivel de ninguno de los dos (B27b).
  IF p_session_id IS NOT NULL THEN
    SELECT estado INTO v_estado
    FROM cash_sessions WHERE id = p_session_id FOR SHARE;
    v_session_existe := FOUND;
  END IF;

  -- NULL cuenta igual que "cerrado": una venta sin turno es plata que no aparece
  -- en ningún lado, que es exactamente lo que B27 viene a evitar (B27b).
  IF NOT v_session_existe OR v_estado IS DISTINCT FROM 'abierta' THEN
    -- El turno del POS ya cerró (o no existe, o no vino). La plata entra en el
    -- vigente, que es el cajón donde el cobro realmente está entrando.
    -- ORDER BY ... LIMIT 1 es cinturón: idx_one_open_session ya garantiza que hay
    -- a lo sumo un turno abierto, pero sin LIMIT un SELECT INTO con varias filas
    -- elegiría una arbitraria en silencio.
    SELECT id INTO v_open_session
    FROM cash_sessions WHERE estado = 'abierta'
    ORDER BY apertura_at DESC LIMIT 1
    FOR SHARE;

    IF v_open_session IS NULL THEN
      RAISE EXCEPTION 'No hay caja abierta. Abrí un turno para poder cobrar.';
    END IF;

    -- Solo dejamos rastro si el turno original existía: si no, sería un uuid
    -- fantasma que violaría sales_session_id_original_fkey y el cajero vería un
    -- error crudo de FK en pantalla.
    IF v_session_existe THEN
      v_session_original := p_session_id;
    END IF;

    p_session_id := v_open_session;
  END IF;

  INSERT INTO sales (metodo_pago, total, nota, moneda, pagado, vuelto, vuelto_moneda,
                     tasa_cambio, session_id, client_request_id, session_id_original)
  VALUES (p_metodo_pago, p_total, p_nota, COALESCE(p_moneda, 'UYU'), p_pagado, p_vuelto,
          p_vuelto_moneda, p_tasa_cambio, p_session_id, p_client_request_id, v_session_original)
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
      SELECT stock, nombre INTO cur_stock, v_nombre
      FROM products WHERE id = (item->>'product_id')::uuid FOR UPDATE;

      new_stock := cur_stock - (item->>'cantidad')::integer;
      IF new_stock < 0 THEN
        RAISE EXCEPTION 'Stock insuficiente: % (hay %, se pidieron %)',
          v_nombre, cur_stock, (item->>'cantidad')::integer;
      END IF;

      UPDATE products SET stock = new_stock WHERE id = (item->>'product_id')::uuid;
    END IF;
  END LOOP;

  RETURN new_sale_id;

EXCEPTION WHEN unique_violation THEN
  -- Doble-submit concurrente (B18): otra transacción ganó la carrera con la misma
  -- clave de idempotencia. Devolver la venta que sí quedó, sin duplicar.
  SELECT id INTO new_sale_id FROM sales WHERE client_request_id = p_client_request_id;
  RETURN new_sale_id;
END;
$$;

-- 4) Cancelar venta y devolver stock (atómico). p_anulada_por registra autoría (B30).
-- Si la venta pertenece a un turno YA CERRADO, acumula el ajuste en cash_sessions
-- en la misma transacción (B26): el snapshot del cierre queda intacto porque es el
-- arqueo de esa noche, y el total real se calcula restando el ajuste.
DROP FUNCTION IF EXISTS cancel_sale(uuid);
CREATE OR REPLACE FUNCTION cancel_sale(p_sale_id uuid, p_anulada_por text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  v_sale            sales%ROWTYPE;
  v_session_estado  text;
  v_items_count     integer;
  v_ajustado        boolean := false;
BEGIN
  -- FOR UPDATE: bloquea la fila para que dos anulaciones simultáneas de la misma
  -- venta no puedan pasar las dos por el chequeo de estado.
  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id FOR UPDATE;

  IF v_sale.id IS NULL THEN
    RAISE EXCEPTION 'Venta no encontrada';
  END IF;
  IF v_sale.estado = 'anulada' THEN
    RAISE EXCEPTION 'La venta ya está anulada';
  END IF;

  UPDATE sales SET
    estado = 'anulada',
    anulada_por = p_anulada_por,
    anulada_at = now()
  WHERE id = p_sale_id;

  -- cash_sessions ANTES de products: orden único sales → cash_sessions → products,
  -- el mismo que usa create_sale_atomic. Si se invierte, deadlock entre una venta
  -- en curso y una anulación simultánea (B27).
  --
  -- FOR NO KEY UPDATE (no FOR UPDATE): excluye contra otro cancel_sale y contra el
  -- UPDATE de close_cash_session, pero NO contra el FOR KEY SHARE que toma el
  -- INSERT de sales por la FK — si no, deadlock con create_sale_atomic (B26b).
  IF v_sale.session_id IS NOT NULL THEN
    SELECT estado INTO v_session_estado
    FROM cash_sessions WHERE id = v_sale.session_id FOR NO KEY UPDATE;
  END IF;

  -- Devolver stock solo de product_id que existan en products, AGREGANDO por
  -- producto: si la venta tiene dos líneas del mismo product_id, un
  -- UPDATE ... FROM sale_items plano aplicaría una sola y devolvería de menos (B35).
  UPDATE products p
  SET stock = p.stock + agg.cant
  FROM (
    SELECT product_id, SUM(cantidad) AS cant
    FROM sale_items
    WHERE sale_id = p_sale_id
    GROUP BY product_id
  ) agg
  WHERE agg.product_id = p.id;

  -- El turno de esta venta ya cerró: su snapshot quedó viejo, acumular ajuste (B26).
  IF v_session_estado = 'cerrada' THEN
    UPDATE cash_sessions SET
      ajuste_ventas_post_cierre       = ajuste_ventas_post_cierre       + COALESCE(v_sale.total, 0),
      ajuste_efectivo_uyu_post_cierre = ajuste_efectivo_uyu_post_cierre + COALESCE(v_sale.mov_efectivo_uyu, 0),
      ajuste_efectivo_brl_post_cierre = ajuste_efectivo_brl_post_cierre + COALESCE(v_sale.mov_efectivo_brl, 0),
      ajuste_digital_post_cierre      = ajuste_digital_post_cierre      +
        CASE WHEN v_sale.metodo_pago != 'efectivo' THEN COALESCE(v_sale.total, 0) ELSE 0 END,
      cantidad_anuladas_post_cierre   = cantidad_anuladas_post_cierre   + 1
    WHERE id = v_sale.session_id;

    v_ajustado := true;
  END IF;

  SELECT COUNT(*) INTO v_items_count FROM sale_items WHERE sale_id = p_sale_id;

  RETURN json_build_object(
    'success', true,
    'sale_id', p_sale_id,
    'items_restored', v_items_count,
    'ajuste_post_cierre', v_ajustado
  );
END;
$$;

-- 4b) Cancelar venta como cajero: solo si pertenece al turno ACTUALMENTE abierto (B33).
-- No permite anular ventas de turnos ya cerrados ni del historial general.
CREATE OR REPLACE FUNCTION cancel_sale_own_turno(p_sale_id uuid, p_anulada_por text)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  v_sale_session_id uuid;
  v_open_session_id uuid;
BEGIN
  SELECT session_id INTO v_sale_session_id FROM sales WHERE id = p_sale_id;
  IF v_sale_session_id IS NULL THEN
    RAISE EXCEPTION 'Esta venta no pertenece a ningún turno';
  END IF;

  SELECT id INTO v_open_session_id FROM cash_sessions WHERE estado = 'abierta';
  IF v_open_session_id IS NULL OR v_open_session_id != v_sale_session_id THEN
    RAISE EXCEPTION 'Solo se pueden anular ventas del turno actualmente abierto';
  END IF;

  RETURN cancel_sale(p_sale_id, p_anulada_por);
END;
$$;

-- 5) Cerrar sesión de caja y grabar snapshot de totales (atómico)
-- p_cerrado_por_user_id: cuenta real de quien cierra (verificada por JWT), puede diferir
-- de quien abrió el turno.
CREATE OR REPLACE FUNCTION close_cash_session(
  p_session_id           UUID,
  p_cerrado_por          TEXT,
  p_notas                TEXT    DEFAULT NULL,
  p_efectivo_contado_uyu NUMERIC DEFAULT NULL,
  p_efectivo_contado_brl NUMERIC DEFAULT NULL,
  p_cerrado_por_user_id  UUID    DEFAULT NULL
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
  v_salidas_uyu      NUMERIC;
  v_salidas_brl      NUMERIC;
  v_entradas_uyu     NUMERIC;
  v_entradas_brl     NUMERIC;
BEGIN
  -- El lock va ACÁ, antes de sumar: serializa contra cancel_sale (B26b). Antes era
  -- un IF NOT EXISTS sin lock, y una anulación concurrente podía colarse entre el
  -- SUM y el UPDATE final, cerrando el turno con la venta contada y ajuste = 0.
  PERFORM 1 FROM cash_sessions
   WHERE id = p_session_id AND estado = 'abierta'
   FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesión no encontrada o ya cerrada';
  END IF;

  SELECT
    COALESCE(SUM(total), 0),
    -- Efectivo por cajón = movimiento físico NETO (entra +, sale −). Antes se usaba
    -- SUM(total) por moneda, que ignoraba el vuelto en pesos sobre ventas en reales
    -- → cajón de pesos corto (B23). Ahora suma mov_efectivo_* (calculado por la DB).
    COALESCE(SUM(mov_efectivo_uyu), 0),
    COALESCE(SUM(mov_efectivo_brl), 0),
    COALESCE(SUM(CASE WHEN metodo_pago != 'efectivo' THEN total ELSE 0 END), 0),
    COUNT(*)
  INTO v_total_ventas, v_efectivo_uyu, v_efectivo_brl, v_digital, v_cantidad
  FROM sales
  WHERE session_id = p_session_id AND estado = 'activa';

  -- Movimientos del turno (entrada/salida, B32), por tipo y moneda
  SELECT
    COALESCE(SUM(CASE WHEN moneda = 'UYU' AND tipo = 'salida'  THEN monto ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN moneda = 'BRL' AND tipo = 'salida'  THEN monto ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN moneda = 'UYU' AND tipo = 'entrada' THEN monto ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN moneda = 'BRL' AND tipo = 'entrada' THEN monto ELSE 0 END), 0)
  INTO v_salidas_uyu, v_salidas_brl, v_entradas_uyu, v_entradas_brl
  FROM cash_outflows
  WHERE session_id = p_session_id;

  UPDATE cash_sessions SET
    estado               = 'cerrada',
    cerrado_por          = p_cerrado_por,
    cerrado_por_user_id  = p_cerrado_por_user_id,
    cierre_at            = now(),
    notas_cierre         = p_notas,
    total_ventas         = v_total_ventas,
    total_efectivo_uyu   = v_efectivo_uyu,
    total_efectivo_brl   = v_efectivo_brl,
    total_digital        = v_digital,
    cantidad_ventas      = v_cantidad,
    efectivo_contado_uyu = p_efectivo_contado_uyu,
    efectivo_contado_brl = p_efectivo_contado_brl,
    total_salidas_uyu    = v_salidas_uyu,
    total_salidas_brl    = v_salidas_brl,
    total_entradas_uyu   = v_entradas_uyu,
    total_entradas_brl   = v_entradas_brl
  WHERE id = p_session_id;
END;
$$;

-- 5b) Registrar movimiento de caja: entrada o salida (atómica) — B32
-- p_categoria: obligatoria (con default 'otro') para salida, ignorada para entrada.
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

  -- Lock de la sesión: evita registrar un movimiento mientras otro la cierra.
  -- FOR NO KEY UPDATE, no FOR UPDATE: este último conflictúa con el FOR KEY SHARE
  -- del chequeo de FK de todo INSERT en sales, así que registrar una salida de caja
  -- bloqueaba los cobros de ese turno (B27b).
  PERFORM 1 FROM cash_sessions
   WHERE id = p_session_id AND estado = 'abierta'
   FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No hay turno abierto para registrar el movimiento';
  END IF;

  INSERT INTO cash_outflows (session_id, monto, moneda, tipo, motivo, categoria)
  VALUES (p_session_id, p_monto, upper(p_moneda), lower(p_tipo), trim(p_motivo), v_categoria)
  RETURNING id INTO v_id;

  RETURN v_id;
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


-- 7) turnos_con_stats: totales por turno, agregados en el servidor.
-- El historial por turnos los necesita para 55+ turnos y ~2.500 ventas; hacerlo en
-- el cliente obligaba a un .in() con miles de uuids (URL de ~95 KB, rechazada).
-- OJO: el criterio de ganancia (ingresos - costo mercaderia - salidas UYU) es el
-- mismo que calcularGananciaReal() en lib/services/reports.ts. Si cambia uno, cambiar el otro.
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
