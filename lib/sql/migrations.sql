-- =========================================================
-- KIOSCO MANAGER: Funciones PostgreSQL para operaciones atómicas
-- Ejecutar en Supabase SQL Editor (Dashboard > SQL Editor)
-- =========================================================

-- Primero eliminar funciones antiguas si existen
DROP FUNCTION IF EXISTS decrement_stock(uuid, integer);
DROP FUNCTION IF EXISTS increment_stock(uuid, integer);
DROP FUNCTION IF EXISTS create_sale_atomic(text, numeric, text, jsonb);

-- 1) Decremento atómico de stock (para ventas)
-- Usa FOR UPDATE para bloquear la fila y evitar race conditions
CREATE OR REPLACE FUNCTION decrement_stock(
  p_product_id uuid,
  p_cantidad integer
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  current_stock integer;
  new_stock integer;
BEGIN
  SELECT stock INTO current_stock
  FROM products
  WHERE id = p_product_id
  FOR UPDATE;

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

-- 2) Incremento atómico de stock (para reposición)
CREATE OR REPLACE FUNCTION increment_stock(
  p_product_id uuid,
  p_cantidad integer
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  current_stock integer;
  new_stock integer;
BEGIN
  SELECT stock INTO current_stock
  FROM products
  WHERE id = p_product_id
  FOR UPDATE;

  IF current_stock IS NULL THEN
    RAISE EXCEPTION 'Producto % no encontrado', p_product_id;
  END IF;

  new_stock := current_stock + p_cantidad;
  UPDATE products SET stock = new_stock WHERE id = p_product_id;
  RETURN new_stock;
END;
$$;

-- 3) Venta atómica completa: crea sale + items + descuenta stock en una transacción
CREATE OR REPLACE FUNCTION create_sale_atomic(
  p_metodo_pago text,
  p_total numeric,
  p_nota text,
  p_items jsonb  -- array de {product_id, cantidad, precio_unitario}
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  new_sale_id uuid;
  item jsonb;
  cur_stock integer;
  new_stock integer;
BEGIN
  -- Crear sale header
  INSERT INTO sales (metodo_pago, total, nota)
  VALUES (p_metodo_pago, p_total, p_nota)
  RETURNING id INTO new_sale_id;

  -- Iterar items: insertar sale_item + descontar stock
  FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO sale_items (sale_id, product_id, cantidad, precio_unitario)
    VALUES (
      new_sale_id,
      (item->>'product_id')::uuid,
      (item->>'cantidad')::integer,
      (item->>'precio_unitario')::numeric
    );

    -- Lock + decrement stock
    SELECT stock INTO cur_stock
    FROM products
    WHERE id = (item->>'product_id')::uuid
    FOR UPDATE;

    new_stock := cur_stock - (item->>'cantidad')::integer;

    IF new_stock < 0 THEN
      RAISE EXCEPTION 'Stock insuficiente para producto %', item->>'product_id';
    END IF;

    UPDATE products
    SET stock = new_stock
    WHERE id = (item->>'product_id')::uuid;
  END LOOP;

  RETURN new_sale_id;
END;
$$;
