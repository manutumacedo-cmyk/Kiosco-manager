"use client";

/**
 * =========================================================
 * TAB REPOSICIÓN
 * - Guarda info de proveedores/lugares y precio de compra (restock_sources)
 * - Permite registrar compras reales (restock_purchases) y sumar stock
 * =========================================================
 */

import { useEffect, useMemo, useState } from "react";
import type { ProductMini, RestockSource } from "@/types";
import {
  fetchSourcesForProduct,
  createSource,
  deleteSource,
  registerPurchase,
} from "@/lib/services/restock";
import { useToast } from "@/components/ui/Toast";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

export default function ReposicionTab({ products }: { products: ProductMini[] }) {
  const toast = useToast();

  /** =========================
   * 1) ESTADO: producto seleccionado + lista de proveedores (sources)
   * ========================= */
  const [selected, setSelected] = useState<string>("");
  const [rows, setRows] = useState<RestockSource[]>([]);
  const [loading, setLoading] = useState(false);

  /** =========================
   * 2) ESTADO: form "Nuevo dato de reposición" (source)
   * ========================= */
  const [lugar, setLugar] = useState("");
  const [precioCompra, setPrecioCompra] = useState("0");
  const [moneda, setMoneda] = useState("UYU");
  const [presentacion, setPresentacion] = useState("");
  const [contacto, setContacto] = useState("");
  const [url, setUrl] = useState("");
  const [notas, setNotas] = useState("");

  /** =========================
   * 3) UI: plegar/desplegar form "Nuevo dato"
   * ========================= */
  const [showForm, setShowForm] = useState(false);

  /** =========================
   * 4) COMPRA REAL: registrar salida + sumar stock
   * ========================= */
  const [sourceId, setSourceId] = useState<string>("");
  const [cantidadCompra, setCantidadCompra] = useState("1");
  const [notasCompra, setNotasCompra] = useState("");
  const [savingCompra, setSavingCompra] = useState(false);
  const [deleteSourceTarget, setDeleteSourceTarget] = useState<string | null>(null);

  /** =========================
   * 5) Helpers
   * ========================= */
  const selectedName = useMemo(
    () => products.find((p) => p.id === selected)?.nombre ?? "",
    [products, selected]
  );

  const selectedSource = useMemo(
    () => rows.find((r) => r.id === sourceId) ?? null,
    [rows, sourceId]
  );

  const precioUnit = Number(selectedSource?.precio_compra ?? 0);
  const monedaCompra = selectedSource?.moneda ?? "UYU";
  const qtyCompra = Math.max(1, Math.floor(Number(cantidadCompra) || 1));
  const totalCompra = precioUnit * qtyCompra;

  // Cuando llegan productos por primera vez, selecciona el primero
  useEffect(() => {
    if (products.length && !selected) setSelected(products[0].id);
  }, [products, selected]);

  /** =========================
   * 6) CARGAR PROVEEDORES (restock_sources) DEL PRODUCTO SELECCIONADO
   * ========================= */
  async function loadSources() {
    if (!selected) return;

    setLoading(true);

    try {
      const list = await fetchSourcesForProduct(selected);
      setRows(list);

      // Auto-seleccionar proveedor si no hay
      if ((!sourceId || !list.some((x) => x.id === sourceId)) && list.length > 0) {
        setSourceId(list[0].id);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cargar proveedores");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  /** =========================
   * 7) CREAR NUEVO PROVEEDOR (restock_sources)
   * ========================= */
  async function crearSourceHandler() {
    if (!selected) return toast.warning("Elegí un producto");
    if (!lugar.trim()) return toast.warning("Falta lugar/proveedor");

    try {
      await createSource({
        product_id: selected,
        lugar: lugar.trim(),
        precio_compra: Number(precioCompra) || 0,
        moneda: moneda.trim() || "UYU",
        presentacion: presentacion.trim() || null,
        contacto: contacto.trim() || null,
        url: url.trim() || null,
        notas: notas.trim() || null,
      });

      // reset form
      setLugar("");
      setPrecioCompra("0");
      setMoneda("UYU");
      setPresentacion("");
      setContacto("");
      setUrl("");
      setNotas("");

      await loadSources();

      // opcional: cerrar form
      setShowForm(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear proveedor");
    }
  }

  /** =========================
   * 8) BORRAR PROVEEDOR (restock_sources)
   * ========================= */
  function borrarSourceHandler(id: string) {
    setDeleteSourceTarget(id);
  }

  async function confirmDeleteSource() {
    if (!deleteSourceTarget) return;
    const id = deleteSourceTarget;
    setDeleteSourceTarget(null);

    try {
      await deleteSource(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
      toast.success("Proveedor eliminado");

      // si borraste el seleccionado, elegir otro
      if (sourceId === id) {
        setSourceId("");
        loadSources();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al borrar proveedor");
    }
  }

  /** =========================
   * 9) REGISTRAR COMPRA (restock_purchases) + SUMAR STOCK
   * ========================= */
  async function registrarCompraHandler() {
    if (!selected) return toast.warning("Elegí un producto");
    if (!sourceId) return toast.warning("Elegí un proveedor/lugar");
    if (!selectedSource) return toast.warning("Proveedor inválido");

    const qty = Math.max(1, Math.floor(Number(cantidadCompra) || 1));
    const unit = Number(selectedSource.precio_compra) || 0;
    const mon = (selectedSource.moneda || "UYU").trim();
    const total = unit * qty;

    setSavingCompra(true);

    try {
      await registerPurchase({
        product_id: selected,
        source_id: sourceId,
        cantidad: qty,
        precio_unitario: unit,
        moneda: mon,
        costo_total: total,
        notas: notasCompra.trim() || null,
      });

      // reset compra
      setCantidadCompra("1");
      setNotasCompra("");

      toast.success(`Compra registrada (+${qty} stock)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al registrar compra");
    } finally {
      setSavingCompra(false);
    }
  }

  /** =========================
   * 10) UI
   * ========================= */
  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={!!deleteSourceTarget}
        title="Borrar proveedor"
        message="¿Borrar este proveedor/dato de reposición?"
        confirmLabel="Borrar"
        danger
        onConfirm={confirmDeleteSource}
        onCancel={() => setDeleteSourceTarget(null)}
      />

      {/* Header de reposición */}
      <div className="data-card neon-hover-cyan">
        <div className="flex flex-col md:flex-row md:items-center gap-3 md:justify-between">
          <div>
            <div className="font-bold text-[var(--neon-cyan)] text-lg uppercase tracking-wide">Reposición</div>
            <div className="text-sm text-[var(--text-secondary)] font-mono mt-1">
              Guardá lugares/proveedores y precios de compra por producto.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              className="cyber-input"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>

            <button className="cyber-button" onClick={loadSources}>
              Recargar
            </button>

            <button
              className="cyber-button-magenta"
              onClick={() => setShowForm((v) => !v)}
            >
              {showForm ? "Ocultar" : "Nuevo dato"}
            </button>
          </div>
        </div>

        <div className="text-sm mt-3 pt-3 border-t border-[var(--slate-gray)]">
          <span className="text-[var(--text-muted)] uppercase tracking-wide text-xs">Producto:</span>{" "}
          <span className="font-bold text-[var(--neon-cyan)] font-mono">{selectedName}</span>
        </div>
      </div>

      {/* Registrar compra (salida + suma stock) */}
      <div className="data-card neon-outline-magenta">
        <div className="font-bold text-[var(--neon-magenta)] text-lg uppercase tracking-wide mb-4">
          Registrar compra (reposicion)
        </div>

        {rows.length === 0 ? (
          <div className="text-center py-6">
            <div className="text-4xl mb-3">📦</div>
            <div className="text-sm text-[var(--text-muted)] font-mono">
              No hay proveedores para este producto. Cargá uno en &quot;Nuevo dato&quot; primero.
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <select
                className="cyber-input"
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
              >
                {rows.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.lugar} — {r.moneda} {Number(r.precio_compra).toFixed(2)}
                  </option>
                ))}
              </select>

              <input
                className="cyber-input"
                type="number"
                placeholder="Cantidad"
                value={cantidadCompra}
                onChange={(e) => setCantidadCompra(e.target.value)}
              />

              <div className="bg-[var(--magenta-glow)] border border-[var(--neon-magenta)] rounded-lg px-3 py-2 text-sm flex items-center justify-between">
                <span className="text-[var(--text-muted)] uppercase tracking-wide">Total</span>
                <span className="font-bold font-mono text-[var(--neon-magenta)]">
                  {monedaCompra} {totalCompra.toFixed(2)}
                </span>
              </div>
            </div>

            <textarea
              className="cyber-input w-full resize-none"
              rows={2}
              placeholder="Notas (opcional)"
              value={notasCompra}
              onChange={(e) => setNotasCompra(e.target.value)}
            />

            <button
              onClick={registrarCompraHandler}
              disabled={savingCompra}
              className="cyber-button-magenta w-full"
            >
              {savingCompra ? "REGISTRANDO..." : "REGISTRAR COMPRA"}
            </button>
          </>
        )}
      </div>

      {/* Form nuevo (plegable) */}
      {showForm && (
        <div className="data-card neon-outline-cyan animate-slide-in">
          <div className="font-bold text-[var(--neon-cyan)] text-lg uppercase tracking-wide mb-4">
            Nuevo dato de reposición
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              className="cyber-input"
              placeholder="Lugar/Proveedor"
              value={lugar}
              onChange={(e) => setLugar(e.target.value)}
            />
            <input
              className="cyber-input"
              type="number"
              step="0.01"
              placeholder="Precio compra"
              value={precioCompra}
              onChange={(e) => setPrecioCompra(e.target.value)}
            />
            <input
              className="cyber-input"
              placeholder="Moneda (UYU/BRL)"
              value={moneda}
              onChange={(e) => setMoneda(e.target.value)}
            />
            <input
              className="cyber-input"
              placeholder="Presentación (ej: pack x6)"
              value={presentacion}
              onChange={(e) => setPresentacion(e.target.value)}
            />
            <input
              className="cyber-input"
              placeholder="Contacto (tel/whatsapp)"
              value={contacto}
              onChange={(e) => setContacto(e.target.value)}
            />
            <input
              className="cyber-input"
              placeholder="Link/URL (opcional)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <textarea
            className="cyber-input w-full resize-none"
            rows={3}
            placeholder="Notas (opcional)"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
          />

          <button onClick={crearSourceHandler} className="cyber-button-magenta">
            Guardar Proveedor
          </button>
        </div>
      )}

      {/* Tabla historial (proveedores) */}
      <div className="data-card overflow-hidden p-0">
        <div className="px-4 py-3 border-b-2 border-[var(--neon-cyan)] bg-[var(--carbon-gray)]">
          <span className="font-bold text-[var(--neon-cyan)] uppercase tracking-wide">
            Historial para este producto
          </span>
        </div>

        {loading ? (
          <div className="p-6 text-center">
            <div className="neon-text-cyan text-lg font-mono animate-glow">Cargando datos...</div>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center">
            <div className="text-4xl mb-3">📋</div>
            <div className="text-sm text-[var(--text-muted)] font-mono">No hay datos todavía.</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[var(--carbon-gray)] border-b-2 border-[var(--neon-cyan)]">
              <tr>
                <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Lugar</th>
                <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Precio</th>
                <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Presentación</th>
                <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Contacto</th>
                <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Link</th>
                <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Acciones</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--slate-gray)] hover:bg-[var(--carbon-gray)]">
                  <td className="p-3">
                    <span className="text-[var(--text-primary)] font-medium">{r.lugar}</span>
                  </td>
                  <td className="p-3">
                    <span className="font-mono text-[var(--neon-cyan)]">
                      {r.moneda} {Number(r.precio_compra).toFixed(2)}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className="text-[var(--text-secondary)]">{r.presentacion ?? "-"}</span>
                  </td>
                  <td className="p-3">
                    <span className="text-[var(--text-secondary)] font-mono text-xs">{r.contacto ?? "-"}</span>
                  </td>
                  <td className="p-3">
                    {r.url ? (
                      <a
                        className="text-[var(--neon-cyan)] underline hover:text-[var(--cyan-bright)] transition-colors"
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir
                      </a>
                    ) : (
                      <span className="text-[var(--text-muted)]">-</span>
                    )}
                  </td>
                  <td className="p-3">
                    <button
                      className="px-3 py-1.5 rounded-lg border border-[var(--error)] text-[var(--error)] hover:bg-[var(--error)] hover:text-[var(--dark-bg)] transition-all text-xs"
                      onClick={() => borrarSourceHandler(r.id)}
                    >
                      Borrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
