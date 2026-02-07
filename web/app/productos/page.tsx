"use client";

/**
 * =========================================================
 * /productos - Pantalla principal
 * - Pestañas: Productos | Reposición
 * - En Productos:
 *   - Buscar / Ordenar
 *   - Modo Ver / Editar (botón "Editar")
 *   - Alta de producto
 *   - Tabla (solo lectura en modo ver)
 *   - Tabla editable en modo editar + guardar por fila
 * =========================================================
 */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import ReposicionTab from "./ReposicionTab";

/** =========================
 * TIPOS
 * ========================= */
type Product = {
  id: string;
  nombre: string;
  precio: number;
  stock: number;
  stock_minimo: number;
  activo?: boolean;
};

type Draft = {
  precio: string;
  stock: string;
  stock_minimo: string;
};

type SortMode = "az" | "stock" | "reponer";
type TabMode = "listado" | "reposicion";

export default function ProductosPage() {
  /** =========================
   * 1) ESTADO BASE (productos desde DB)
   * ========================= */
  const [items, setItems] = useState<Product[]>([]);

  /** =========================
   * 2) ESTADO UI: pestañas, editar, filtro, orden
   * ========================= */
  const [tab, setTab] = useState<TabMode>("listado");
  const [editMode, setEditMode] = useState(false);
  const [q, setQ] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("az");

  /** =========================
   * 3) ESTADO: FORM NUEVO PRODUCTO
   * ========================= */
  const [nombre, setNombre] = useState("");
  const [precio, setPrecio] = useState("0");
  const [stock, setStock] = useState("0");
  const [stockMin, setStockMin] = useState("0");

  /** =========================
   * 4) ESTADO: EDICIÓN POR FILA
   * - drafts: valores que el usuario edita antes de guardar
   * - saving/saved: feedback visual
   * ========================= */
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  /** =========================
   * 5) CARGA INICIAL DESDE SUPABASE
   * ========================= */
  async function loadProducts() {
    const { data, error } = await supabase
      .from("products")
      .select("id,nombre,precio,stock,stock_minimo,activo")
      .order("nombre", { ascending: true });

    if (error) return alert(error.message);

    const list = (data ?? []) as Product[];
    setItems(list);

    // Inicializar drafts solo si no existían
    setDrafts((prev) => {
      const next = { ...prev };
      for (const p of list) {
        if (!next[p.id]) {
          next[p.id] = {
            precio: String(p.precio ?? 0),
            stock: String(p.stock ?? 0),
            stock_minimo: String(p.stock_minimo ?? 0),
          };
        }
      }
      return next;
    });
  }

  useEffect(() => {
    loadProducts();
  }, []);

  /** =========================
   * 6) CREAR PRODUCTO NUEVO
   * TODO: si querés agregar "categoria", agregá input y mandalo acá.
   * ========================= */
  async function crearProducto() {
    if (!nombre.trim()) return alert("Falta nombre");

    const { error } = await supabase.from("products").insert({
      nombre: nombre.trim(),
      precio: Number(precio) || 0,
      stock: Number(stock) || 0,
      stock_minimo: Number(stockMin) || 0,
      activo: true,
    });

    if (error) return alert(error.message);

    // reset inputs
    setNombre("");
    setPrecio("0");
    setStock("0");
    setStockMin("0");

    // reload
    loadProducts();
  }

  /** =========================
   * 7) HELPERS DE EDICIÓN (drafts)
   * ========================= */
  function setDraft(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
    // si estaba como “guardado ✅”, lo apago al editar
    setSaved((prev) => ({ ...prev, [id]: false }));
  }

  function parseAndValidate(d: Draft) {
    const precioN = Number(d.precio);
    const stockN = Math.floor(Number(d.stock));
    const minN = Math.floor(Number(d.stock_minimo));

    if (Number.isNaN(precioN) || precioN < 0) return { ok: false as const, msg: "Precio inválido" };
    if (Number.isNaN(stockN) || stockN < 0) return { ok: false as const, msg: "Stock inválido" };
    if (Number.isNaN(minN) || minN < 0) return { ok: false as const, msg: "Mínimo inválido" };

    return { ok: true as const, precioN, stockN, minN };
  }

  /** =========================
   * 8) GUARDAR 1 FILA (update en DB + update en UI)
   * TODO: si agregás campos editables nuevos, agregalos acá también.
   * ========================= */
  async function saveRow(id: string) {
    const d = drafts[id];
    if (!d) return;

    const v = parseAndValidate(d);
    if (!v.ok) return alert(v.msg);

    setSaving((prev) => ({ ...prev, [id]: true }));

    const { error } = await supabase
      .from("products")
      .update({
        precio: v.precioN,
        stock: v.stockN,
        stock_minimo: v.minN,
      })
      .eq("id", id);

    setSaving((prev) => ({ ...prev, [id]: false }));
    if (error) return alert(error.message);

    // actualizar en memoria para que se refleje al toque
    setItems((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, precio: v.precioN, stock: v.stockN, stock_minimo: v.minN } : p
      )
    );

    // feedback ✅
    setSaved((prev) => ({ ...prev, [id]: true }));
    setTimeout(() => setSaved((prev) => ({ ...prev, [id]: false })), 1200);
  }

  // =========================================================
  // ELIMINAR PRODUCTO (BORRA DE products)
  // OJO: si tenés FK con ON DELETE CASCADE, también borra restock_sources
  // =========================================================
  async function deleteProduct(id: string, nombre: string) {
    const ok = confirm(`¿Eliminar "${nombre}"? Esto lo borra del sistema.`);
    if (!ok) return;

    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) return alert(error.message);

    // actualizar UI local
    setItems((prev) => prev.filter((p) => p.id !== id));
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setSaving((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setSaved((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  /** =========================
   * 9) BOTONES RAPIDOS: -1 / +1 en stock
   * ========================= */
  async function applyStockDelta(id: string, delta: number) {
    const d = drafts[id];
    if (!d) return;

    const curr = Math.floor(Number(d.stock) || 0);
    const next = Math.max(0, curr + delta);

    setDraft(id, { stock: String(next) });
    await saveRow(id);
  }

  /** =========================
   * 10) MÉTRICAS / ALERTAS
   * ========================= */
  const alertasCount = useMemo(() => {
    return items.filter((p) => Number(p.stock) <= Number(p.stock_minimo)).length;
  }, [items]);

  /** =========================
   * 11) LISTA MOSTRADA: filtro + orden
   * TODO: acá ajustás lógica de orden/filtros.
   * ========================= */
  const shownItems = useMemo(() => {
    const query = q.trim().toLowerCase();
    let list = items;

    // FILTRO por nombre
    if (query) list = list.filter((p) => p.nombre.toLowerCase().includes(query));

    // ORDEN
    if (sortMode === "az") {
      list = [...list].sort((a, b) => a.nombre.localeCompare(b.nombre));
    } else if (sortMode === "stock") {
      list = [...list].sort((a, b) => Number(a.stock) - Number(b.stock));
    } else if (sortMode === "reponer") {
      // Reponer primero => alertas arriba
      list = [...list].sort((a, b) => {
        const aAlert = Number(a.stock) <= Number(a.stock_minimo) ? 0 : 1;
        const bAlert = Number(b.stock) <= Number(b.stock_minimo) ? 0 : 1;
        if (aAlert !== bAlert) return aAlert - bAlert;
        const s = Number(a.stock) - Number(b.stock);
        if (s !== 0) return s;
        return a.nombre.localeCompare(b.nombre);
      });
    }

    return list;
  }, [items, q, sortMode]);

  /** =========================
   * 12) RENDER
   * - HEADER: titulo + badge alertas + botones tabs + editar + recargar
   * - TAB: listado o reposición
   * ========================= */
  return (
    <div className="p-6 space-y-4">
      {/* =========================
          HEADER PRINCIPAL
         ========================= */}
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Productos</h1>

          {/* Badge de alertas */}
          <div className="text-sm mt-1">
            {alertasCount > 0 ? (
              <span className="px-3 py-1 rounded-full bg-red-100 text-red-800">
                {alertasCount} para reponer
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full bg-green-100 text-green-800">
                Sin alertas
              </span>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mt-3">
            <button
              className={`px-4 py-2 rounded-lg border ${
                tab === "listado" ? "bg-black text-white" : "hover:bg-gray-50"
              }`}
              onClick={() => setTab("listado")}
            >
              Productos
            </button>

            <button
              className={`px-4 py-2 rounded-lg border ${
                tab === "reposicion" ? "bg-black text-white" : "hover:bg-gray-50"
              }`}
              onClick={() => setTab("reposicion")}
            >
              Reposición
            </button>
          </div>
        </div>

        {/* Acciones a la derecha */}
        <div className="flex items-center gap-2">
          {/* Botón editar SOLO aplica al listado */}
          {tab === "listado" && (
            <button
              className={`px-4 py-2 rounded-lg border ${
                editMode ? "bg-black text-white" : "hover:bg-gray-50"
              }`}
              onClick={() => setEditMode((v) => !v)}
            >
              {editMode ? "Salir de editar" : "Editar"}
            </button>
          )}

          <button
            className="px-4 py-2 rounded-lg border hover:bg-gray-50"
            onClick={loadProducts}
            title="Recargar desde la base"
          >
            Recargar
          </button>
        </div>
      </div>

      {/* =========================
          CONTENIDO POR PESTAÑA
         ========================= */}
      {tab === "reposicion" ? (
        /**
         * TAB: REPOSICIÓN
         * - Le pasamos productos para elegir
         * TODO: si querés que muestre solo "en alerta", filtrás acá.
         */
        <ReposicionTab products={items.map((p) => ({ id: p.id, nombre: p.nombre }))} />
      ) : (
        /**
         * TAB: PRODUCTOS (Listado)
         */
        <>
          {/* =========================
              CONTROLES: buscar / ordenar
             ========================= */}
          <div className="border rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <input
                className="border rounded-lg px-3 py-2"
                placeholder="Buscar producto..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />

              <select
                className="border rounded-lg px-3 py-2"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
              >
                <option value="az">Orden: A → Z</option>
                <option value="stock">Orden: Stock (menor primero)</option>
                <option value="reponer">Orden: Reponer primero</option>
              </select>

              <div className="text-sm text-gray-600 flex items-center">
                Mostrando: <span className="ml-1 font-semibold">{shownItems.length}</span>
              </div>
            </div>
          </div>

          {/* =========================
              FORM: nuevo producto
              TODO: acá agregás inputs extras (categoria, etc.)
             ========================= */}
          <div className="border rounded-xl p-4 space-y-2">
            <div className="font-semibold">Nuevo</div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <input
                className="border rounded-lg px-3 py-2"
                placeholder="Nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
              <input
                className="border rounded-lg px-3 py-2"
                placeholder="Precio"
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
              />
              <input
                className="border rounded-lg px-3 py-2"
                placeholder="Stock"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
              />
              <input
                className="border rounded-lg px-3 py-2"
                placeholder="Stock mínimo"
                value={stockMin}
                onChange={(e) => setStockMin(e.target.value)}
              />
            </div>

            <button onClick={crearProducto} className="px-4 py-2 rounded-lg bg-black text-white">
              Crear
            </button>
          </div>

          {/* =========================
              TABLA: listado
              - Modo ver: texto
              - Modo editar: inputs + botones + guardar
             ========================= */}
          <div className="border rounded-xl overflow-hidden">
            <div className="px-4 py-2 border-b font-semibold">Listado</div>

            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-3 text-left">Producto</th>
                  <th className="p-3 text-left">Precio</th>
                  <th className="p-3 text-left">Stock</th>
                  <th className="p-3 text-left">Mín</th>
                  {editMode && <th className="p-3 text-left">Acciones</th>}
                </tr>
              </thead>

              <tbody>
                {shownItems.map((p) => {
                  const d =
                    drafts[p.id] ?? {
                      precio: String(p.precio ?? 0),
                      stock: String(p.stock ?? 0),
                      stock_minimo: String(p.stock_minimo ?? 0),
                    };

                  const enAlerta = Number(p.stock) <= Number(p.stock_minimo);

                  return (
                    <tr key={p.id} className={`border-t ${enAlerta ? "bg-red-50" : ""}`}>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span>{p.nombre}</span>
                          {enAlerta && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-red-200 text-red-900">
                              Reponer
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Precio */}
                      <td className="p-3">
                        {editMode ? (
                          <input
                            className="border rounded-lg px-2 py-1 w-28"
                            value={d.precio}
                            onChange={(e) => setDraft(p.id, { precio: e.target.value })}
                            onBlur={() => saveRow(p.id)}
                          />
                        ) : (
                          <>${Number(p.precio).toFixed(2)}</>
                        )}
                      </td>

                      {/* Stock */}
                      <td className="p-3">
                        {editMode ? (
                          <div className="flex items-center gap-2">
                            <button
                              className="px-2 py-1 rounded border hover:bg-gray-50"
                              onClick={() => applyStockDelta(p.id, -1)}
                              title="-1"
                            >
                              -1
                            </button>

                            <input
                              className="border rounded-lg px-2 py-1 w-20 text-center"
                              value={d.stock}
                              onChange={(e) => setDraft(p.id, { stock: e.target.value })}
                              onBlur={() => saveRow(p.id)}
                            />

                            <button
                              className="px-2 py-1 rounded border hover:bg-gray-50"
                              onClick={() => applyStockDelta(p.id, +1)}
                              title="+1"
                            >
                              +1
                            </button>
                          </div>
                        ) : (
                          <>{p.stock}</>
                        )}
                      </td>

                      {/* Mínimo */}
                      <td className="p-3">
                        {editMode ? (
                          <input
                            className="border rounded-lg px-2 py-1 w-20 text-center"
                            value={d.stock_minimo}
                            onChange={(e) => setDraft(p.id, { stock_minimo: e.target.value })}
                            onBlur={() => saveRow(p.id)}
                          />
                        ) : (
                          <>{p.stock_minimo}</>
                        )}
                      </td>

                      {/* Acciones (solo en editar) */}
                      {editMode && (
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <button
                            className="px-3 py-1.5 rounded-lg bg-black text-white disabled:opacity-50"
                            onClick={() => saveRow(p.id)}
                            disabled={!!saving[p.id]}
                          >
                            {saving[p.id] ? "Guardando..." : "Guardar"}
                          </button>

                          {saved[p.id] && <span className="text-green-700">✅</span>}

                          {/* NUEVO: ELIMINAR */}
                          <button
                            className="px-3 py-1.5 rounded-lg border hover:bg-red-50"
                            onClick={() => deleteProduct(p.id, p.nombre)}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    )}
                    </tr>
                  );
                })}
                {shownItems.length === 0 && (
                  <tr>
                    <td className="p-3 text-gray-500" colSpan={editMode ? 5 : 4}>
                      No hay productos (o el filtro no encontró resultados).
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
