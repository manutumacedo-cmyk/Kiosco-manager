"use client";

import { useEffect, useMemo, useState } from "react";
import type { Sale, SaleItemWithProduct, Product } from "@/types";
import { fetchTodayReport } from "@/lib/services/reports";
import { useToast } from "@/components/ui/Toast";

export default function ReporteHoyPage() {
  const toast = useToast();
  const [sales, setSales] = useState<Sale[]>([]);
  const [items, setItems] = useState<SaleItemWithProduct[]>([]);
  const [alertas, setAlertas] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const report = await fetchTodayReport();
      setSales(report.sales);
      setItems(report.items);
      setAlertas(report.alertas);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cargar reporte");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const totalHoy = useMemo(
    () => sales.reduce((a, s) => a + Number(s.total), 0),
    [sales]
  );

  const costoTotal = useMemo(() => {
    return items.reduce((acc, it) => {
      const prod = Array.isArray(it.products) ? it.products[0] : it.products;
      const costo = prod?.costo ?? 0;
      const cantidad = Number(it.cantidad || 0);
      return acc + (costo * cantidad);
    }, 0);
  }, [items]);

  const gananciaLimpia = useMemo(() => {
    return totalHoy - costoTotal;
  }, [totalHoy, costoTotal]);

  const porMetodo = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sales) m.set(s.metodo_pago, (m.get(s.metodo_pago) ?? 0) + Number(s.total));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [sales]);

  const topProductos = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) {
      const prod = Array.isArray(it.products) ? it.products[0] : it.products;
      const name = prod?.nombre ?? "Desconocido";
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
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="border rounded-xl p-4">
            <div className="text-sm text-gray-500">Total vendido hoy</div>
            <div className="text-3xl font-semibold mt-1">${totalHoy.toFixed(2)}</div>
            <div className="text-sm text-gray-500 mt-2">Ventas: {sales.length}</div>
          </div>

          <div className="border rounded-xl p-4 bg-green-50">
            <div className="text-sm text-gray-500">Ganancia limpia</div>
            <div className="text-3xl font-semibold mt-1 text-green-700">
              ${gananciaLimpia.toFixed(2)}
            </div>
            <div className="text-xs text-gray-500 mt-2">
              Costo: ${costoTotal.toFixed(2)}
            </div>
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

          <div className="border rounded-xl p-4 lg:col-span-4">
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
