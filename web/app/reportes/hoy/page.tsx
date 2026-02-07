"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

type Sale = { id: string; fecha: string; metodo_pago: string; total: number };
type Product = { id: string; nombre: string; stock: number; stock_minimo: number; activo: boolean };
type SaleItem = { cantidad: number; products: { nombre: string } | null };

export default function ReporteHoyPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [alertas, setAlertas] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  function todayRangeISO() {
    const now = new Date();
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end = new Date(now); end.setHours(23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  async function load() {
    setLoading(true);
    const { start, end } = todayRangeISO();

    const s1 = await supabase
      .from("sales")
      .select("id,fecha,metodo_pago,total")
      .gte("fecha", start)
      .lte("fecha", end);

    const s2 = await supabase
      .from("sale_items")
      .select("cantidad, products(nombre)")
      .gte("created_at", start)
      .lte("created_at", end);

    const s3 = await supabase
      .from("products")
      .select("id,nombre,stock,stock_minimo,activo")
      .eq("activo", true);

    if (s1.error) alert(s1.error.message);
    if (s2.error) alert(s2.error.message);
    if (s3.error) alert(s3.error.message);

    setSales((s1.data ?? []) as Sale[]);
    setItems((s2.data ?? []) as any);
    const prods = (s3.data ?? []) as Product[];
    setAlertas(prods.filter(p => p.stock <= p.stock_minimo));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const totalHoy = useMemo(
    () => sales.reduce((a, s) => a + Number(s.total), 0),
    [sales]
  );

  const porMetodo = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sales) m.set(s.metodo_pago, (m.get(s.metodo_pago) ?? 0) + Number(s.total));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [sales]);

  const topProductos = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) {
      const name = it.products?.nombre ?? "Desconocido";
      m.set(name, (m.get(name) ?? 0) + Number(it.cantidad || 0));
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [items]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-semibold">Reporte hoy</h1>
        <button onClick={load} className="px-4 py-2 rounded-lg border hover:bg-gray-50">
          Refrescar
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Cargando...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="border rounded-xl p-4">
            <div className="text-sm text-gray-500">Total vendido hoy</div>
            <div className="text-3xl font-semibold mt-1">${totalHoy.toFixed(2)}</div>
            <div className="text-sm text-gray-500 mt-2">Ventas: {sales.length}</div>
          </div>

          <div className="border rounded-xl p-4">
            <div className="font-semibold">Por método</div>
            <div className="mt-3 space-y-2 text-sm">
              {porMetodo.length === 0 ? (
                <div className="text-gray-500">Sin ventas hoy.</div>
              ) : (
                porMetodo.map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span>{k}</span>
                    <span className="font-medium">${v.toFixed(2)}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="border rounded-xl p-4">
            <div className="font-semibold">Top productos (qty)</div>
            <div className="mt-3 space-y-2 text-sm">
              {topProductos.length === 0 ? (
                <div className="text-gray-500">Sin items hoy.</div>
              ) : (
                topProductos.map(([name, qty]) => (
                  <div key={name} className="flex justify-between">
                    <span className="truncate pr-2">{name}</span>
                    <span className="font-medium">{qty}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="border rounded-xl p-4 lg:col-span-3">
            <div className="font-semibold">Alertas de reposición</div>
            <div className="mt-3 text-sm">
              {alertas.length === 0 ? (
                <div className="text-gray-500">Sin alertas 🎉</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {alertas.map(p => (
                    <div key={p.id} className="border rounded-lg p-3 bg-red-50">
                      <div className="font-medium">{p.nombre}</div>
                      <div className="text-gray-600">Stock: {p.stock} | Mín: {p.stock_minimo}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
