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
import ReposicionTab from "./ReposicionTab";
import type { Product, ProductDraft, SortMode, TabMode, CategoryType } from "@/types";
import { CATEGORIES } from "@/types";
import {
  fetchProducts,
  createProduct,
  updateProduct,
  deleteProduct as deleteProductService,
} from "@/lib/services/products";
import { useToast } from "@/components/ui/Toast";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

export default function ProductosPage() {
  const toast = useToast();

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
  const [categoriaFilter, setCategoriaFilter] = useState<string>("");
  const [sortMode, setSortMode] = useState<SortMode>("az");

  /** =========================
   * 3) ESTADO: FORM NUEVO PRODUCTO
   * ========================= */
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState<string | null>(null);
  const [precio, setPrecio] = useState("0");
  const [costo, setCosto] = useState("0");
  const [stock, setStock] = useState("0");
  const [stockMin, setStockMin] = useState("0");

  /** =========================
   * 4) ESTADO: EDICIÓN POR FILA
   * - drafts: valores que el usuario edita antes de guardar
   * - saving/saved: feedback visual
   * ========================= */
  const [drafts, setDrafts] = useState<Record<string, ProductDraft>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  /** Estado para diálogo de confirmación de eliminación */
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; nombre: string } | null>(null);

  /** =========================
   * 5) CARGA INICIAL DESDE SUPABASE
   * ========================= */
  async function loadProducts() {
    try {
      const list = await fetchProducts();
      setItems(list);

      // Inicializar drafts solo si no existían
      setDrafts((prev) => {
        const next = { ...prev };
        for (const p of list) {
          if (!next[p.id]) {
            next[p.id] = {
              precio: String(p.precio ?? 0),
              costo: String(p.costo ?? 0),
              stock: String(p.stock ?? 0),
              stock_minimo: String(p.stock_minimo ?? 0),
              categoria: p.categoria,
            };
          }
        }
        return next;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cargar productos");
    }
  }

  useEffect(() => {
    loadProducts();
  }, []);

  /** =========================
   * 6) CREAR PRODUCTO NUEVO
   * TODO: si querés agregar "categoria", agregá input y mandalo acá.
   * ========================= */
  async function crearProducto() {
    if (!nombre.trim()) return toast.warning("Falta nombre");

    try {
      await createProduct({
        nombre: nombre.trim(),
        categoria: categoria,
        precio: Number(precio) || 0,
        costo: Number(costo) || 0,
        stock: Number(stock) || 0,
        stock_minimo: Number(stockMin) || 0,
      });

      // reset inputs
      setNombre("");
      setCategoria(null);
      setPrecio("0");
      setCosto("0");
      setStock("0");
      setStockMin("0");

      // reload
      loadProducts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear producto");
    }
  }

  /** =========================
   * 7) HELPERS DE EDICIÓN (drafts)
   * ========================= */
  function setDraft(id: string, patch: Partial<ProductDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
    // si estaba como "guardado ✅", lo apago al editar
    setSaved((prev) => ({ ...prev, [id]: false }));
  }

  function parseAndValidate(d: ProductDraft) {
    const precioN = Number(d.precio);
    const costoN = Number(d.costo);
    const stockN = Math.floor(Number(d.stock));
    const minN = Math.floor(Number(d.stock_minimo));

    if (Number.isNaN(precioN) || precioN < 0) return { ok: false as const, msg: "Precio inválido" };
    if (Number.isNaN(costoN) || costoN < 0) return { ok: false as const, msg: "Costo inválido" };
    if (Number.isNaN(stockN) || stockN < 0) return { ok: false as const, msg: "Stock inválido" };
    if (Number.isNaN(minN) || minN < 0) return { ok: false as const, msg: "Mínimo inválido" };

    return { ok: true as const, precioN, costoN, stockN, minN };
  }

  /** =========================
   * 8) GUARDAR 1 FILA (update en DB + update en UI)
   * TODO: si agregás campos editables nuevos, agregalos acá también.
   * ========================= */
  async function saveRow(id: string) {
    const d = drafts[id];
    if (!d) return;

    const v = parseAndValidate(d);
    if (!v.ok) return toast.warning(v.msg);

    setSaving((prev) => ({ ...prev, [id]: true }));

    try {
      await updateProduct(id, {
        precio: v.precioN,
        costo: v.costoN,
        stock: v.stockN,
        stock_minimo: v.minN,
        categoria: d.categoria,
      });

      // actualizar en memoria para que se refleje al toque
      setItems((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, precio: v.precioN, costo: v.costoN, stock: v.stockN, stock_minimo: v.minN, categoria: d.categoria } : p
        )
      );

      // feedback ✅
      setSaved((prev) => ({ ...prev, [id]: true }));
      setTimeout(() => setSaved((prev) => ({ ...prev, [id]: false })), 1200);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving((prev) => ({ ...prev, [id]: false }));
    }
  }

  // =========================================================
  // ELIMINAR PRODUCTO (BORRA DE products)
  // OJO: si tenés FK con ON DELETE CASCADE, también borra restock_sources
  // =========================================================
  function handleDeleteProduct(id: string, nombre: string) {
    setDeleteTarget({ id, nombre });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    setDeleteTarget(null);

    try {
      await deleteProductService(id);

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
      toast.success("Producto eliminado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    }
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

    // FILTRO por categoría
    if (categoriaFilter) list = list.filter((p) => p.categoria === categoriaFilter);

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
  }, [items, q, categoriaFilter, sortMode]);

  /** =========================
   * 12) RENDER
   * - HEADER: titulo + badge alertas + botones tabs + editar + recargar
   * - TAB: listado o reposición
   * ========================= */
  return (
    <div className="min-h-screen bg-[var(--deep-dark)] p-6 space-y-6">
      <ConfirmDialog
        open={!!deleteTarget}
        title="Eliminar producto"
        message={`¿Eliminar "${deleteTarget?.nombre}"? Esto lo borra del sistema.`}
        confirmLabel="Eliminar"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* =========================
          HEADER PRINCIPAL
         ========================= */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          {/* Título con ícono */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full neon-border-cyan animate-pulse-cyan" />
            <h1 className="text-3xl font-bold neon-text-cyan">PRODUCTOS</h1>
            <div className="text-2xl">📦</div>
          </div>

          {/* Badge de alertas */}
          <div className="text-sm">
            {alertasCount > 0 ? (
              <span className="px-4 py-2 rounded-full neon-outline-magenta animate-pulse-magenta bg-[var(--magenta-glow)] text-[var(--neon-magenta)] font-bold">
                ⚠️ {alertasCount} para reponer
              </span>
            ) : (
              <span className="px-4 py-2 rounded-full border border-[var(--success)] text-[var(--success)] bg-[rgba(0,255,136,0.1)] font-mono">
                ✓ Sin alertas
              </span>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-2">
            <button
              className={`cyber-button ${
                tab === "listado" ? "neon-outline-cyan" : ""
              }`}
              onClick={() => setTab("listado")}
            >
              Productos
            </button>

            <button
              className={`cyber-button ${
                tab === "reposicion" ? "neon-outline-cyan" : ""
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
              className={`cyber-button-magenta ${
                editMode ? "neon-outline-magenta" : ""
              }`}
              onClick={() => setEditMode((v) => !v)}
            >
              {editMode ? "Salir de editar" : "Editar"}
            </button>
          )}

          <button
            className="cyber-button"
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
          <div className="data-card neon-hover-cyan">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                className="cyber-input"
                placeholder="Buscar producto..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />

              <select
                className="cyber-input"
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

              <select
                className="cyber-input"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
              >
                <option value="az">Orden: A → Z</option>
                <option value="stock">Orden: Stock (menor primero)</option>
                <option value="reponer">Orden: Reponer primero</option>
              </select>

              <div className="flex items-center text-[var(--text-secondary)] font-mono text-sm">
                Mostrando: <span className="ml-2 font-bold text-[var(--neon-cyan)]">{shownItems.length}</span>
              </div>
            </div>
          </div>

          {/* =========================
              FORM: nuevo producto
              TODO: acá agregás inputs extras (categoria, etc.)
             ========================= */}
          <div className="data-card neon-hover-cyan">
            <div className="font-bold text-[var(--neon-cyan)] uppercase tracking-wide mb-3">Nuevo Producto</div>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <input
                className="cyber-input"
                placeholder="Nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
              <select
                className="cyber-input"
                value={categoria ?? ""}
                onChange={(e) => setCategoria(e.target.value || null)}
              >
                <option value="">Sin categoría</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <input
                className="cyber-input"
                placeholder="Precio venta"
                type="number"
                step="0.01"
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
              />
              <input
                className="cyber-input"
                placeholder="Costo"
                type="number"
                step="0.01"
                value={costo}
                onChange={(e) => setCosto(e.target.value)}
              />
              <input
                className="cyber-input"
                placeholder="Stock"
                type="number"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
              />
              <input
                className="cyber-input"
                placeholder="Stock mínimo"
                type="number"
                value={stockMin}
                onChange={(e) => setStockMin(e.target.value)}
              />
            </div>

            <button onClick={crearProducto} className="cyber-button-magenta mt-3">
              Crear Producto
            </button>
          </div>

          {/* =========================
              TABLA: listado
              - Modo ver: texto
              - Modo editar: inputs + botones + guardar
             ========================= */}
          <div className="data-card overflow-hidden p-0">
            <div className="px-4 py-3 border-b-2 border-[var(--neon-cyan)] bg-[var(--carbon-gray)]">
              <span className="font-bold text-[var(--neon-cyan)] uppercase tracking-wide">Listado de Productos</span>
            </div>

            <table className="w-full text-sm">
              <thead className="bg-[var(--carbon-gray)] border-b-2 border-[var(--neon-cyan)]">
                <tr>
                  <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Producto</th>
                  <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Categoría</th>
                  <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Precio</th>
                  <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Costo</th>
                  <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Ganancia</th>
                  <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Stock</th>
                  <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Mín</th>
                  {editMode && <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Acciones</th>}
                </tr>
              </thead>

              <tbody>
                {shownItems.map((p) => {
                  const d =
                    drafts[p.id] ?? {
                      precio: String(p.precio ?? 0),
                      costo: String(p.costo ?? 0),
                      stock: String(p.stock ?? 0),
                      stock_minimo: String(p.stock_minimo ?? 0),
                      categoria: p.categoria,
                    };

                  const enAlerta = Number(p.stock) <= Number(p.stock_minimo);
                  const ganancia = Number(p.precio) - Number(p.costo);
                  const gananciaPercent = Number(p.precio) > 0
                    ? ((ganancia / Number(p.precio)) * 100).toFixed(1)
                    : "0";

                  return (
                    <tr
                      key={p.id}
                      className={`border-t border-[var(--slate-gray)] ${
                        enAlerta
                          ? "neon-outline-magenta animate-pulse-magenta bg-[var(--magenta-glow)]"
                          : "hover:bg-[var(--carbon-gray)]"
                      }`}
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[var(--text-primary)] font-medium">{p.nombre}</span>
                          {enAlerta && (
                            <span className="text-xs px-2 py-0.5 rounded-full border border-[var(--neon-magenta)] text-[var(--neon-magenta)] bg-[var(--magenta-glow)] font-bold">
                              ⚠️ REPONER
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Categoría */}
                      <td className="p-3">
                        {editMode ? (
                          <select
                            className="cyber-input w-32 text-xs"
                            value={d.categoria ?? ""}
                            onChange={(e) => setDraft(p.id, { categoria: e.target.value || null })}
                            onBlur={() => saveRow(p.id)}
                          >
                            <option value="">Sin categoría</option>
                            {CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs px-2 py-1 rounded-full bg-[var(--slate-gray)] text-[var(--text-secondary)]">
                            {p.categoria || "Sin categoría"}
                          </span>
                        )}
                      </td>

                      {/* Precio */}
                      <td className="p-3">
                        {editMode ? (
                          <input
                            className="cyber-input w-28 text-sm"
                            type="number"
                            step="0.01"
                            value={d.precio}
                            onChange={(e) => setDraft(p.id, { precio: e.target.value })}
                            onBlur={() => saveRow(p.id)}
                          />
                        ) : (
                          <span className="font-mono text-[var(--neon-cyan)]">${Number(p.precio).toFixed(2)}</span>
                        )}
                      </td>

                      {/* Costo */}
                      <td className="p-3">
                        {editMode ? (
                          <input
                            className="cyber-input w-28 text-sm"
                            type="number"
                            step="0.01"
                            value={d.costo}
                            onChange={(e) => setDraft(p.id, { costo: e.target.value })}
                            onBlur={() => saveRow(p.id)}
                          />
                        ) : (
                          <span className="font-mono text-[var(--text-secondary)]">${Number(p.costo).toFixed(2)}</span>
                        )}
                      </td>

                      {/* Ganancia */}
                      <td className="p-3">
                        <div className="flex flex-col">
                          <span className={`font-mono font-bold ${ganancia >= 0 ? "text-[var(--success)]" : "text-[var(--error)]"}`}>
                            ${ganancia.toFixed(2)}
                          </span>
                          <span className="text-xs text-[var(--text-muted)] font-mono">
                            {gananciaPercent}%
                          </span>
                        </div>
                      </td>

                      {/* Stock */}
                      <td className="p-3">
                        {editMode ? (
                          <div className="flex items-center gap-2">
                            <button
                              className="px-2 py-1 rounded border border-[var(--slate-gray)] text-[var(--text-primary)] hover:bg-[var(--cyan-glow)] hover:border-[var(--neon-cyan)] transition-all"
                              onClick={() => applyStockDelta(p.id, -1)}
                              title="-1"
                            >
                              -1
                            </button>

                            <input
                              className="cyber-input w-20 text-center text-sm"
                              type="number"
                              value={d.stock}
                              onChange={(e) => setDraft(p.id, { stock: e.target.value })}
                              onBlur={() => saveRow(p.id)}
                            />

                            <button
                              className="px-2 py-1 rounded border border-[var(--slate-gray)] text-[var(--text-primary)] hover:bg-[var(--cyan-glow)] hover:border-[var(--neon-cyan)] transition-all"
                              onClick={() => applyStockDelta(p.id, +1)}
                              title="+1"
                            >
                              +1
                            </button>
                          </div>
                        ) : (
                          <span className="font-mono text-[var(--text-primary)]">{p.stock}</span>
                        )}
                      </td>

                      {/* Mínimo */}
                      <td className="p-3">
                        {editMode ? (
                          <input
                            className="cyber-input w-20 text-center text-sm"
                            type="number"
                            value={d.stock_minimo}
                            onChange={(e) => setDraft(p.id, { stock_minimo: e.target.value })}
                            onBlur={() => saveRow(p.id)}
                          />
                        ) : (
                          <span className="font-mono text-[var(--text-muted)]">{p.stock_minimo}</span>
                        )}
                      </td>

                      {/* Acciones (solo en editar) */}
                      {editMode && (
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <button
                            className="cyber-button-magenta text-xs"
                            onClick={() => saveRow(p.id)}
                            disabled={!!saving[p.id]}
                          >
                            {saving[p.id] ? "Guardando..." : "Guardar"}
                          </button>

                          {saved[p.id] && <span className="text-[var(--success)]">✅</span>}

                          {/* NUEVO: ELIMINAR */}
                          <button
                            className="px-3 py-1.5 rounded-lg border border-[var(--error)] text-[var(--error)] hover:bg-[var(--error)] hover:text-[var(--dark-bg)] transition-all text-xs"
                            onClick={() => handleDeleteProduct(p.id, p.nombre)}
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
                    <td className="p-4 text-[var(--text-muted)] text-center font-mono" colSpan={editMode ? 8 : 7}>
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
