"use client";

import { useEffect, useMemo, useState } from "react";
import type { Product, CartItem, CategoryType } from "@/types";
import { CATEGORIES } from "@/types";
import { fetchActiveProducts } from "@/lib/services/products";
import { createSale } from "@/lib/services/sales";
import { useToast } from "@/components/ui/Toast";

export default function NuevaVentaPage() {
  const toast = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [q, setQ] = useState("");
  const [categoriaFilter, setCategoriaFilter] = useState<string>("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [metodo, setMetodo] = useState("efectivo");
  const [nota, setNota] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadProducts() {
    try {
      const data = await fetchActiveProducts();
      setProducts(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cargar productos");
    }
  }

  useEffect(() => {
    loadProducts();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    let base = products.filter((p) => p.activo && p.stock > 0);

    // Filtrar por categoría
    if (categoriaFilter) {
      base = base.filter((p) => p.categoria === categoriaFilter);
    }

    // Filtrar por nombre
    if (!s) return base.slice(0, 25);
    return base
      .filter((p) => p.nombre.toLowerCase().includes(s))
      .slice(0, 25);
  }, [q, categoriaFilter, products]);

  const total = useMemo(() => {
    return cart.reduce((a, it) => a + it.cantidad * it.precio_unitario, 0);
  }, [cart]);

  function add(p: Product) {
    if (p.stock <= 0) return;

    setCart((prev) => {
      const f = prev.find((x) => x.product_id === p.id);
      if (f) {
        // no permitir pasar el stock disponible
        if (f.cantidad + 1 > f.stock_actual) return prev;
        return prev.map((x) =>
          x.product_id === p.id ? { ...x, cantidad: x.cantidad + 1 } : x
        );
      }
      return [
        ...prev,
        {
          product_id: p.id,
          nombre: p.nombre,
          cantidad: 1,
          precio_unitario: Number(p.precio) || 0,
          stock_actual: p.stock,
        },
      ];
    });

    setQ("");
  }

  function remove(product_id: string) {
    setCart((prev) => prev.filter((x) => x.product_id !== product_id));
  }

  function setQty(product_id: string, cantidad: number) {
    setCart((prev) =>
      prev.map((x) => {
        if (x.product_id !== product_id) return x;
        const c = Math.max(1, Math.min(x.stock_actual, cantidad || 1));
        return { ...x, cantidad: c };
      })
    );
  }

  function setPrice(product_id: string, precio_unitario: number) {
    setCart((prev) =>
      prev.map((x) =>
        x.product_id === product_id
          ? { ...x, precio_unitario: Math.max(0, Number(precio_unitario) || 0) }
          : x
      )
    );
  }

  async function guardarVenta() {
    if (cart.length === 0) return toast.warning("Carrito vacío");
    if (!metodo.trim()) return toast.warning("Elegí método de pago");

    setSaving(true);

    try {
      await createSale({
        metodo_pago: metodo,
        total,
        nota: nota.trim() ? nota.trim() : null,
        items: cart.map((it) => ({
          product_id: it.product_id,
          cantidad: it.cantidad,
          precio_unitario: it.precio_unitario,
          stock_actual: it.stock_actual,
        })),
      });

      toast.success("Venta guardada");

      setCart([]);
      setMetodo("efectivo");
      setNota("");
      await loadProducts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar venta");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Nueva venta</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Buscar */}
        <div className="border rounded-xl p-4 space-y-2">
          <div className="font-semibold">Buscar producto</div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input
              className="border rounded-lg px-3 py-2 w-full"
              placeholder="Escribí el nombre..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />

            <select
              className="border rounded-lg px-3 py-2"
              value={categoriaFilter}
              onChange={(e) => setCategoriaFilter(e.target.value)}
            >
              <option value="">Todas las categorías</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="border rounded-lg max-h-80 overflow-auto">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => add(p)}
                className="w-full text-left px-3 py-2 border-b hover:bg-gray-50"
              >
                <div className="flex justify-between">
                  <span className="font-medium">{p.nombre}</span>
                  <span>${Number(p.precio).toFixed(2)}</span>
                </div>
                <div className="text-xs text-gray-500">Stock: {p.stock}</div>
              </button>
            ))}

            {filtered.length === 0 && (
              <div className="p-3 text-sm text-gray-500">Sin resultados.</div>
            )}
          </div>
        </div>

        {/* Carrito */}
        <div className="border rounded-xl p-4 space-y-3">
          <div className="font-semibold">Carrito</div>

          {cart.length === 0 ? (
            <div className="text-sm text-gray-500">Agregá productos.</div>
          ) : (
            <div className="space-y-2">
              {cart.map((it) => (
                <div key={it.product_id} className="border rounded-lg p-3">
                  <div className="flex justify-between items-center gap-2">
                    <div className="font-medium">{it.nombre}</div>
                    <button
                      onClick={() => remove(it.product_id)}
                      className="text-sm px-2 py-1 rounded border hover:bg-gray-50"
                    >
                      Quitar
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <div className="text-xs text-gray-500">Cantidad</div>
                      <input
                        className="border rounded-lg px-2 py-1 w-full"
                        value={it.cantidad}
                        onChange={(e) =>
                          setQty(it.product_id, Number(e.target.value))
                        }
                      />
                      <div className="text-[11px] text-gray-400">
                        Máx: {it.stock_actual}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-gray-500">Precio unit.</div>
                      <input
                        className="border rounded-lg px-2 py-1 w-full"
                        value={it.precio_unitario}
                        onChange={(e) =>
                          setPrice(it.product_id, Number(e.target.value))
                        }
                      />
                    </div>
                  </div>

                  <div className="mt-2 text-sm text-right font-semibold">
                    ${(it.cantidad * it.precio_unitario).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border-t pt-3 space-y-2">
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span>${total.toFixed(2)}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <select
                className="border rounded-lg px-3 py-2"
                value={metodo}
                onChange={(e) => setMetodo(e.target.value)}
              >
                <option value="efectivo">efectivo</option>
                <option value="debito">debito</option>
                <option value="credito">credito</option>
                <option value="transferencia">transferencia</option>
                <option value="mercadopago">mercadopago</option>
              </select>

              <input
                className="border rounded-lg px-3 py-2"
                placeholder="Nota (opcional)"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
              />
            </div>

            <button
              onClick={guardarVenta}
              disabled={saving}
              className="w-full px-4 py-2 rounded-lg bg-black text-white disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Guardar venta"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
