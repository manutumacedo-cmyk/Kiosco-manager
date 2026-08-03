-- ============================================================================
-- B27 — Venta en el cambio de turno = plata invisible
-- ============================================================================
-- create_sale_atomic insertaba el session_id que le mandaba el cliente SIN
-- verificar que ese turno siguiera abierto. Y el POS carga openSessionId una
-- sola vez al montar, sin refrescarlo nunca:
--
--   21:00  cajero abre el POS      → openSessionId = S1
--   23:42  se cierra el turno S1   → snapshot congelado, plata contada
--   23:43  cajero cobra            → venta con session_id = S1 (cerrado)
--
-- Esa venta no entra en el snapshot de S1 (se cerró antes) ni en ningún otro
-- turno. Plata cobrada que no cuadra en ningún lado, y sin dejar rastro.
--
-- Solución (decisión del dueño): la venta va al turno que está abierto AHORA,
-- que es donde físicamente entra la plata — el cajero nuevo la recibe en su
-- cajón. Queda el rastro en sales.session_id_original. Si no hay ningún turno
-- abierto, se rechaza el cobro pidiendo abrir caja.
--
-- ── Sobre los locks ────────────────────────────────────────────────────────
-- El chequeo del estado va BAJO LOCK: sin eso el turno puede cerrarse entre el
-- chequeo y el INSERT y volvemos al mismo agujero.
--
-- Se usa FOR SHARE, no FOR NO KEY UPDATE:
--   · conflictúa con el FOR NO KEY UPDATE de close_cash_session ✓ (es el punto)
--   · NO conflictúa consigo mismo → dos ventas simultáneas no se serializan,
--     que en hora pico es justo lo que no queremos.
--
-- Y esto obliga a unificar el ORDEN DE ADQUISICIÓN en todo el sistema, porque
-- create_sale_atomic pasa a tomar cash_sessions antes que products, mientras
-- que cancel_sale (tras B26) lo tomaba después:
--
--   antes → create: cash_sessions → products
--           cancel: sales → products → cash_sessions      ✗ cruzado, deadlock
--
--   ahora → create: cash_sessions → products
--           cancel: sales → cash_sessions → products      ✓ consistente
--
-- Orden único: sales → cash_sessions → products.
-- ============================================================================

ALTER TABLE sales ADD COLUMN IF NOT EXISTS session_id_original uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_session_id_original_fkey'
  ) THEN
    ALTER TABLE sales
      ADD CONSTRAINT sales_session_id_original_fkey
      FOREIGN KEY (session_id_original) REFERENCES cash_sessions(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN sales.session_id_original IS
  'Si la venta se reasignó porque su turno ya estaba cerrado al cobrar (B27), acá queda el turno original. NULL en el caso normal.';

-- ── 1) create_sale_atomic: resolver el turno bajo lock antes de insertar ────
CREATE OR REPLACE FUNCTION create_sale_atomic(
  p_metodo_pago text,
  p_total       numeric,
  p_nota        text,
  p_items       jsonb,
  p_moneda      text    DEFAULT 'UYU',
  p_pagado      numeric DEFAULT NULL,
  p_vuelto        numeric DEFAULT NULL,
  p_vuelto_moneda text    DEFAULT NULL,
  p_session_id    uuid    DEFAULT NULL,
  p_tasa_cambio   numeric DEFAULT NULL,
  p_client_request_id uuid DEFAULT NULL
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
BEGIN
  -- Idempotencia (B18): reintento tras respuesta perdida → devolver la que ya está.
  IF p_client_request_id IS NOT NULL THEN
    SELECT id INTO new_sale_id FROM sales WHERE client_request_id = p_client_request_id;
    IF FOUND THEN
      RETURN new_sale_id;
    END IF;
  END IF;

  -- Validación de efectivo: el cuadre por cajón necesita saber qué entró y qué salió.
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

  -- ── B27: ¿el turno que mandó el POS sigue abierto? ───────────────────────
  -- FOR SHARE bloquea contra close_cash_session pero no contra otras ventas.
  IF p_session_id IS NOT NULL THEN
    SELECT estado INTO v_estado
    FROM cash_sessions WHERE id = p_session_id FOR SHARE;

    IF v_estado IS DISTINCT FROM 'abierta' THEN
      -- El turno del POS ya cerró (o no existe). La plata entra en el vigente.
      SELECT id INTO v_open_session
      FROM cash_sessions WHERE estado = 'abierta' FOR SHARE;

      IF v_open_session IS NULL THEN
        RAISE EXCEPTION 'No hay caja abierta. Abrí un turno para poder cobrar.';
      END IF;

      v_session_original := p_session_id;
      p_session_id := v_open_session;
    END IF;
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
  -- Doble-submit concurrente (B18): otra transacción ganó con la misma clave.
  SELECT id INTO new_sale_id FROM sales WHERE client_request_id = p_client_request_id;
  RETURN new_sale_id;
END;
$$;

-- ── 2) cancel_sale: mismo cuerpo, pero tomando cash_sessions ANTES de products
--    para que el orden de locks quede consistente con create_sale_atomic.
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
  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id FOR UPDATE;

  IF v_sale.id IS NULL THEN
    RAISE EXCEPTION 'Venta no encontrada';
  END IF;
  IF v_sale.estado = 'anulada' THEN
    RAISE EXCEPTION 'La venta ya está anulada';
  END IF;

  UPDATE sales SET
    estado      = 'anulada',
    anulada_por = p_anulada_por,
    anulada_at  = now()
  WHERE id = p_sale_id;

  -- cash_sessions ANTES de products: orden único sales → cash_sessions → products.
  IF v_sale.session_id IS NOT NULL THEN
    SELECT estado INTO v_session_estado
    FROM cash_sessions WHERE id = v_sale.session_id FOR NO KEY UPDATE;
  END IF;

  -- Agregado por product_id (B35): dos líneas del mismo producto en la misma venta
  -- devolvían stock de una sola con UPDATE ... FROM sale_items plano.
  UPDATE products p
  SET stock = p.stock + agg.cant
  FROM (
    SELECT product_id, SUM(cantidad) AS cant
    FROM sale_items
    WHERE sale_id = p_sale_id
    GROUP BY product_id
  ) agg
  WHERE agg.product_id = p.id;

  -- El turno ya cerró: su snapshot quedó viejo, acumular el ajuste (B26).
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
