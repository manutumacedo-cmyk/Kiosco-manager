-- ============================================================================
-- B27b — Cerrar el hueco de session_id NULL y afinar dos locks
-- ============================================================================
-- Seguimiento de migration_b27_venta_cambio_turno.sql, tras auditarla con Opus.
-- Tres cosas:
--
-- 1) El guard de B27 estaba TODO adentro de `IF p_session_id IS NOT NULL`. Con
--    NULL la venta se insertaba con session_id = NULL: plata cobrada que no
--    aparece en ningún turno, o sea el mismo resultado que B27 venía a arreglar,
--    entrando por otra puerta. Ahora NULL se trata igual que "turno cerrado":
--    se manda al turno vigente, o se rechaza si no hay ninguno.
--
-- 2) Si p_session_id apuntaba a un turno inexistente (pestaña vieja del POS, o
--    una sesión borrada — las FKs son ON DELETE SET NULL), se guardaba ese uuid
--    fantasma en session_id_original y el INSERT reventaba con un error crudo de
--    FK que el cajero veía en pantalla. Ahora se distingue "no existe" de
--    "existe pero cerrado" y solo en el segundo caso se guarda el original.
--
-- 3) register_cash_movement usaba FOR UPDATE, el lock más fuerte. Eso conflictúa
--    con el FOR KEY SHARE que toma el chequeo de FK de todo INSERT en sales, así
--    que registrar una salida de caja bloqueaba los cobros de ese turno. Baja a
--    FOR NO KEY UPDATE: conserva la exclusión contra close_cash_session y contra
--    create_sale_atomic (FOR SHARE), pero deja pasar los chequeos de FK.
--
-- Verificado aparte: idx_one_open_session EXISTE en producción
--   CREATE UNIQUE INDEX idx_one_open_session ON cash_sessions(estado)
--     WHERE estado = 'abierta'
-- así que no puede haber dos turnos abiertos y el SELECT del turno vigente no
-- puede elegir el equivocado. Igual se le agrega ORDER BY ... LIMIT 1 como
-- cinturón, por si ese índice se cae alguna vez.
-- ============================================================================

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
  v_session_existe boolean := false;
BEGIN
  IF p_client_request_id IS NOT NULL THEN
    SELECT id INTO new_sale_id FROM sales WHERE client_request_id = p_client_request_id;
    IF FOUND THEN
      RETURN new_sale_id;
    END IF;
  END IF;

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

  -- ── B27: toda venta tiene que caer en un turno ABIERTO ───────────────────
  -- FOR SHARE (no FOR NO KEY UPDATE): bloquea contra close_cash_session, pero no
  -- consigo mismo, así que dos cobros simultáneos no se serializan.
  -- OJO: los dos locks de cash_sessions de este bloque son FOR SHARE a propósito.
  -- Es la única función que lockea DOS filas de la misma tabla; que sean
  -- auto-compatibles es lo que evita un deadlock entre dos ventas que las tomen
  -- en orden inverso. No subir el nivel de ninguno de los dos.
  IF p_session_id IS NOT NULL THEN
    SELECT estado INTO v_estado
    FROM cash_sessions WHERE id = p_session_id FOR SHARE;
    v_session_existe := FOUND;
  END IF;

  IF NOT v_session_existe OR v_estado IS DISTINCT FROM 'abierta' THEN
    SELECT id INTO v_open_session
    FROM cash_sessions WHERE estado = 'abierta'
    ORDER BY apertura_at DESC LIMIT 1
    FOR SHARE;

    IF v_open_session IS NULL THEN
      RAISE EXCEPTION 'No hay caja abierta. Abrí un turno para poder cobrar.';
    END IF;

    -- Solo dejamos rastro si el turno original existía de verdad; si no, sería un
    -- uuid fantasma que violaría sales_session_id_original_fkey.
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
  SELECT id INTO new_sale_id FROM sales WHERE client_request_id = p_client_request_id;
  RETURN new_sale_id;
END;
$$;

-- ── register_cash_movement: FOR UPDATE → FOR NO KEY UPDATE ─────────────────
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
  -- del chequeo de FK de todo INSERT en sales, así que registrar una salida
  -- bloqueaba los cobros del turno (B27b).
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
