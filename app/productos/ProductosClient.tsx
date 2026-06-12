"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import ReposicionTab from "./ReposicionTab";
import type { Product, ProductDraft, SortMode, TabMode, CategoryType } from "@/types";
import { fetchCategories, createCategory } from "@/lib/services/categories";
import {
  fetchProducts,
  createProduct,
  updateProduct,
  deleteProduct as deleteProductService,
} from "@/lib/services/products";
import { useToast } from "@/components/ui/Toast";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

export default function ProductosClient({ role }: { role: "admin" | "cajero" }) {
  const isAdmin = role === "admin";
  const toast = useToast();

  const [items, setItems] = useState<Product[]>([]);
  const [tab, setTab] = useState<TabMode>("listado");
  const [editMode, setEditMode] = useState(false);
  const [q, setQ] = useState("");
  const [categoriaFilter, setCategoriaFilter] = useState<string>("");
  const [sortMode, setSortMode] = useState<SortMode>("az");

  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState<string | null>(null);
  const [precio, setPrecio] = useState("");
  const [costo, setCosto] = useState("");
  const [stock, setStock] = useState("");
  const [stockMin, setStockMin] = useState("");

  const [drafts, setDrafts] = useState<Record<string, ProductDraft>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; nombre: string } | null>(null);

  const [categories, setCategories] = useState<CategoryType[]>([]);
  const [showNewCatModal, setShowNewCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [savingCat, setSavingCat] = useState(false);

  async function loadProducts() {
    try {
      const list = await fetchProducts();
      setItems(list);
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
    fetchCategories().then(setCategories).catch(() => {});
  }, []);

  async function handleCreateCategory() {
    const nombre = newCatName.trim();
    if (!nombre) return toast.warning("Ingresá el nombre de la categoría");
    if (categories.includes(nombre)) return toast.warning("Esa categoría ya existe");
    setSavingCat(true);
    try {
      await createCategory(nombre);
      const updated = await fetchCategories();
      setCategories(updated);
      setNewCatName("");
      setShowNewCatModal(false);
      toast.success(`Categoría "${nombre}" creada`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear categoría");
    } finally {
      setSavingCat(false);
    }
  }

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
      setNombre("");
      setCategoria(null);
      setPrecio("");
      setCosto("");
      setStock("");
      setStockMin("");
      loadProducts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear producto");
    }
  }

  function setDraft(id: string, patch: Partial<ProductDraft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
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
      setItems((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, precio: v.precioN, costo: v.costoN, stock: v.stockN, stock_minimo: v.minN, categoria: d.categoria }
            : p
        )
      );
      setSaved((prev) => ({ ...prev, [id]: true }));
      setTimeout(() => setSaved((prev) => ({ ...prev, [id]: false })), 1200);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving((prev) => ({ ...prev, [id]: false }));
    }
  }

  function handleDeleteProduct(id: string, nombre: string) {
    setDeleteTarget({ id, nombre });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteProductService(id);
      setItems((prev) => prev.filter((p) => p.id !== id));
      setDrafts((prev) => { const next = { ...prev }; delete next[id]; return next; });
      setSaving((prev) => { const next = { ...prev }; delete next[id]; return next; });
      setSaved((prev) => { const next = { ...prev }; delete next[id]; return next; });
      toast.success("Producto eliminado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    }
  }

  async function applyStockDelta(id: string, delta: number) {
    const d = drafts[id];
    if (!d) return;
    const curr = Math.floor(Number(d.stock) || 0);
    const next = Math.max(0, curr + delta);
    setDraft(id, { stock: String(next) });
    await saveRow(id);
  }

  const alertasCount = useMemo(() => {
    return items.filter((p) => Number(p.stock) <= Number(p.stock_minimo)).length;
  }, [items]);

  const shownItems = useMemo(() => {
    const query = q.trim().toLowerCase();
    let list = items;
    if (query) list = list.filter((p) => p.nombre.toLowerCase().includes(query));
    if (categoriaFilter) list = list.filter((p) => p.categoria === categoriaFilter);
    if (sortMode === "az") {
      list = [...list].sort((a, b) => a.nombre.localeCompare(b.nombre));
    } else if (sortMode === "stock") {
      list = [...list].sort((a, b) => Number(a.stock) - Number(b.stock));
    } else if (sortMode === "reponer") {
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

  // Admin: 7 cols (no edit) / 8 cols (edit). Cajero: 5 cols (no edit) / 6 cols (edit)
  const colCount = isAdmin ? (editMode ? 8 : 7) : (editMode ? 6 : 5);

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

      {/* HEADER */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Image src="/logo.png" alt="24 SIETE" width={40} height={40} className="cursor-pointer" />
            </Link>
            <h1 className="text-3xl font-bold neon-text-cyan">PRODUCTOS</h1>
            <div className="text-2xl">📦</div>
          </div>

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

          <div className="flex gap-2">
            <button
              className={`cyber-button ${tab === "listado" ? "neon-outline-cyan" : ""}`}
              onClick={() => setTab("listado")}
            >
              Productos
            </button>
            <button
              className={`cyber-button ${tab === "reposicion" ? "neon-outline-cyan" : ""}`}
              onClick={() => setTab("reposicion")}
            >
              Reposición
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {tab === "listado" && (
            <button
              className={`cyber-button-magenta ${editMode ? "neon-outline-magenta" : ""}`}
              onClick={() => setEditMode((v) => !v)}
            >
              {editMode ? "Salir de editar" : "Editar"}
            </button>
          )}
          <button className="cyber-button" onClick={loadProducts} title="Recargar desde la base">
            Recargar
          </button>
        </div>
      </div>

      {/* CONTENIDO */}
      {tab === "reposicion" ? (
        <ReposicionTab products={items.map((p) => ({ id: p.id, nombre: p.nombre }))} />
      ) : (
        <>
          {/* Controles: buscar / ordenar */}
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
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
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

          {/* Nuevo Producto (solo admin) */}
          {isAdmin && (
            <div className="data-card neon-hover-cyan">
              <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-[var(--neon-cyan)] uppercase tracking-wide">Nuevo Producto</span>
                <button
                  type="button"
                  onClick={() => setShowNewCatModal(true)}
                  className="cyber-button text-xs"
                >
                  + Nueva categoría
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                <label className="block">
                  <span className="block text-xs text-[var(--text-secondary)] uppercase tracking-wide mb-1">Nombre</span>
                  <input
                    className="cyber-input w-full"
                    placeholder="Ej: Coca 600ml"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="block text-xs text-[var(--text-secondary)] uppercase tracking-wide mb-1">Categoría</span>
                  <select
                    className="cyber-input w-full"
                    value={categoria ?? ""}
                    onChange={(e) => setCategoria(e.target.value || null)}
                  >
                    <option value="">Sin categoría</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs text-[var(--text-secondary)] uppercase tracking-wide mb-1">Precio venta $</span>
                  <input
                    className="cyber-input w-full"
                    placeholder="0"
                    type="number"
                    step="0.01"
                    value={precio}
                    onChange={(e) => setPrecio(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="block text-xs text-[var(--text-secondary)] uppercase tracking-wide mb-1">Costo $</span>
                  <input
                    className="cyber-input w-full"
                    placeholder="0"
                    type="number"
                    step="0.01"
                    value={costo}
                    onChange={(e) => setCosto(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="block text-xs text-[var(--text-secondary)] uppercase tracking-wide mb-1">Stock</span>
                  <input
                    className="cyber-input w-full"
                    placeholder="0"
                    type="number"
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="block text-xs text-[var(--text-secondary)] uppercase tracking-wide mb-1">Stock mínimo</span>
                  <input
                    className="cyber-input w-full"
                    placeholder="0"
                    type="number"
                    value={stockMin}
                    onChange={(e) => setStockMin(e.target.value)}
                  />
                </label>
              </div>
              <button onClick={crearProducto} className="cyber-button-magenta mt-3">
                Crear Producto
              </button>
            </div>
          )}

          {/* Tabla */}
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
                  {isAdmin && <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Costo</th>}
                  {isAdmin && <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Ganancia</th>}
                  <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Stock</th>
                  <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Mín</th>
                  {editMode && <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Acciones</th>}
                </tr>
              </thead>

              <tbody>
                {shownItems.map((p) => {
                  const d = drafts[p.id] ?? {
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
                          ? "bg-[rgba(255,0,255,0.05)] shadow-[inset_3px_0_0_var(--neon-magenta)] hover:bg-[rgba(255,0,255,0.09)]"
                          : "hover:bg-[var(--carbon-gray)]"
                      }`}
                    >
                      {/* Producto */}
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
                        {editMode && isAdmin ? (
                          <select
                            className="cyber-input w-32 text-xs"
                            value={d.categoria ?? ""}
                            onChange={(e) => setDraft(p.id, { categoria: e.target.value || null })}
                            onBlur={() => saveRow(p.id)}
                          >
                            <option value="">Sin categoría</option>
                            {categories.map((cat) => (
                              <option key={cat} value={cat}>{cat}</option>
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
                        {editMode && isAdmin ? (
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

                      {/* Costo (solo admin) */}
                      {isAdmin && (
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
                      )}

                      {/* Ganancia (solo admin) */}
                      {isAdmin && (
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
                      )}

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
                        {editMode && isAdmin ? (
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

                      {/* Acciones (solo en editMode) */}
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
                            {isAdmin && (
                              <button
                                className="px-3 py-1.5 rounded-lg border border-[var(--error)] text-[var(--error)] hover:bg-[var(--error)] hover:text-[var(--dark-bg)] transition-all text-xs"
                                onClick={() => handleDeleteProduct(p.id, p.nombre)}
                              >
                                Eliminar
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {shownItems.length === 0 && (
                  <tr>
                    <td className="p-4 text-[var(--text-muted)] text-center font-mono" colSpan={colCount}>
                      No hay productos (o el filtro no encontró resultados).
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal: Nueva categoría */}
      {showNewCatModal && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
          <div className="data-card neon-outline-cyan w-full max-w-sm space-y-4">
            <h2 className="text-xl font-bold neon-text-cyan uppercase tracking-wide">Nueva Categoría</h2>
            <input
              className="cyber-input w-full"
              placeholder="Nombre de la categoría"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateCategory()}
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={handleCreateCategory}
                disabled={savingCat}
                className="cyber-button-cyan flex-1"
              >
                {savingCat ? "Guardando..." : "Crear"}
              </button>
              <button
                onClick={() => { setShowNewCatModal(false); setNewCatName(""); }}
                className="cyber-button flex-1"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
