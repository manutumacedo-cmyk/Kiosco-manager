"use client";

/**
 * =========================================================
 * TAB REPOSICIÓN
 * - Guarda info de proveedores/lugares y precio de compra (restock_sources)
 * - Permite registrar compras reales (restock_purchases) y sumar stock
 * =========================================================
 */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type ProductMini = { id: string; nombre: string };

type Source = {
  id: string;
  product_id: string;
  lugar: string;
  precio_compra: number;
  moneda: string;
  presentacion: string | null;
  contacto: string | null;
  url: string | null;
  notas: string | null;
  created_at: string;
};

export default function ReposicionTab({ products }: { products: ProductMini[] }) {
  /** =========================
   * 1) ESTADO: producto seleccionado + lista de proveedores (sources)
   * ========================= */
  const [selected, setSelected] = useState<string>("");
  const [rows, setRows] = useState<Source[]>([]);
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

    const { data, error } = await supabase
      .from("restock_sources")
      .select("id,product_id,lugar,precio_compra,moneda,presentacion,contacto,url,notas,created_at")
      .eq("product_id", selected)
      .order("created_at", { ascending: false });

    setLoading(false);

    if (error) return alert(error.message);

    const list = (data ?? []) as Source[];
    setRows(list);

    // Auto-seleccionar proveedor si no hay
    if ((!sourceId || !list.some((x) => x.id === sourceId)) && list.length > 0) {
      setSourceId(list[0].id);
    }
  }

  useEffect(() => {
    loadSources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  /** =========================
   * 7) CREAR NUEVO PROVEEDOR (restock_sources)
   * ========================= */
  async function crearSource() {
    if (!selected) return alert("Elegí un producto");
    if (!lugar.trim()) return alert("Falta lugar/proveedor");

    const { error } = await supabase.from("restock_sources").insert({
      product_id: selected,
      lugar: lugar.trim(),
      precio_compra: Number(precioCompra) || 0,
      moneda: moneda.trim() || "UYU",
      presentacion: presentacion.trim() || null,
      contacto: contacto.trim() || null,
      url: url.trim() || null,
      notas: notas.trim() || null,
    });

    if (error) return alert(error.message);

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
  }

  /** =========================
   * 8) BORRAR PROVEEDOR (restock_sources)
   * ========================= */
  async function borrarSource(id: string) {
    const ok = confirm("¿Borrar este proveedor/dato de reposición?");
    if (!ok) return;

    const { error } = await supabase.from("restock_sources").delete().eq("id", id);
    if (error) return alert(error.message);

    setRows((prev) => prev.filter((r) => r.id !== id));

    // si borraste el seleccionado, elegir otro
    if (sourceId === id) {
      setSourceId("");
      setTimeout(() => {
        // recarga para volver a elegir primero
        loadSources();
      }, 0);
    }
  }

  /** =========================
   * 9) REGISTRAR COMPRA (restock_purchases) + SUMAR STOCK
   * ========================= */
  async function registrarCompra() {
    if (!selected) return alert("Elegí un producto");
    if (!sourceId) return alert("Elegí un proveedor/lugar");
    if (!selectedSource) return alert("Proveedor inválido");

    const qty = Math.max(1, Math.floor(Number(cantidadCompra) || 1));
    const unit = Number(selectedSource.precio_compra) || 0;
    const mon = (selectedSource.moneda || "UYU").trim();
    const total = unit * qty;

    setSavingCompra(true);

    // 1) Insert compra (salida)
    const ins = await supabase.from("restock_purchases").insert({
      product_id: selected,
      source_id: sourceId,
      cantidad: qty,
      precio_unitario: unit,
      moneda: mon,
      costo_total: total,
      notas: notasCompra.trim() || null,
    });

    if (ins.error) {
      setSavingCompra(false);
      return alert(ins.error.message);
    }

    // 2) Leer stock actual
    const cur = await supabase
      .from("products")
      .select("stock")
      .eq("id", selected)
      .single();

    if (cur.error) {
      setSavingCompra(false);
      return alert(cur.error.message);
    }

    const currentStock = Number(cur.data?.stock ?? 0);

    // 3) Actualizar stock (sumar qty)
    const upd = await supabase
      .from("products")
      .update({ stock: currentStock + qty })
      .eq("id", selected);

    setSavingCompra(false);

    if (upd.error) return alert(upd.error.message);

    // reset compra
    setCantidadCompra("1");
    setNotasCompra("");

    alert(`Compra registrada ✅ (+${qty} stock)`);
  }

  /** =========================
   * 10) UI
   * ========================= */
  return (
    <div className="space-y-4">
      {/* Header de reposición */}
      <div className="border rounded-xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center gap-2 md:justify-between">
          <div>
            <div className="font-semibold">Reposición</div>
            <div className="text-sm text-gray-600">
              Guardá lugares/proveedores y precios de compra por producto.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              className="border rounded-lg px-3 py-2"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>

            <button className="px-4 py-2 rounded-lg border hover:bg-gray-50" onClick={loadSources}>
              Recargar
            </button>

            <button
              className="px-4 py-2 rounded-lg border hover:bg-gray-50"
              onClick={() => setShowForm((v) => !v)}
            >
              {showForm ? "Ocultar nuevo dato" : "Nuevo dato"}
            </button>
          </div>
        </div>

        <div className="text-sm">
          Producto: <span className="font-semibold">{selectedName}</span>
        </div>
      </div>

      {/* Registrar compra (salida + suma stock) */}
      <div className="border rounded-xl p-4 space-y-3">
        <div className="font-semibold">Registrar compra (reposicion)</div>

        {rows.length === 0 ? (
          <div className="text-sm text-gray-500">
            No hay proveedores para este producto. Cargá uno en “Nuevo dato” primero.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <select
                className="border rounded-lg px-3 py-2"
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
                className="border rounded-lg px-3 py-2"
                placeholder="Cantidad"
                value={cantidadCompra}
                onChange={(e) => setCantidadCompra(e.target.value)}
              />

              <div className="border rounded-lg px-3 py-2 text-sm flex items-center justify-between">
                <span>Total</span>
                <span className="font-semibold">
                  {monedaCompra} {totalCompra.toFixed(2)}
                </span>
              </div>
            </div>

            <textarea
              className="border rounded-lg px-3 py-2 w-full"
              rows={2}
              placeholder="Notas (opcional)"
              value={notasCompra}
              onChange={(e) => setNotasCompra(e.target.value)}
            />

            <button
              onClick={registrarCompra}
              disabled={savingCompra}
              className="px-4 py-2 rounded-lg bg-black text-white disabled:opacity-50"
            >
              {savingCompra ? "Registrando..." : "Registrar compra"}
            </button>
          </>
        )}
      </div>

      {/* Form nuevo (plegable) */}
      {showForm && (
        <div className="border rounded-xl p-4 space-y-3">
          <div className="font-semibold">Nuevo dato de reposición</div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input
              className="border rounded-lg px-3 py-2"
              placeholder="Lugar/Proveedor"
              value={lugar}
              onChange={(e) => setLugar(e.target.value)}
            />
            <input
              className="border rounded-lg px-3 py-2"
              placeholder="Precio compra"
              value={precioCompra}
              onChange={(e) => setPrecioCompra(e.target.value)}
            />
            <input
              className="border rounded-lg px-3 py-2"
              placeholder="Moneda (UYU/BRL)"
              value={moneda}
              onChange={(e) => setMoneda(e.target.value)}
            />
            <input
              className="border rounded-lg px-3 py-2"
              placeholder="Presentación (ej: pack x6)"
              value={presentacion}
              onChange={(e) => setPresentacion(e.target.value)}
            />
            <input
              className="border rounded-lg px-3 py-2"
              placeholder="Contacto (tel/whatsapp)"
              value={contacto}
              onChange={(e) => setContacto(e.target.value)}
            />
            <input
              className="border rounded-lg px-3 py-2"
              placeholder="Link/URL (opcional)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <textarea
            className="border rounded-lg px-3 py-2 w-full"
            rows={3}
            placeholder="Notas (opcional)"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
          />

          <button onClick={crearSource} className="px-4 py-2 rounded-lg bg-black text-white">
            Guardar
          </button>
        </div>
      )}

      {/* Tabla historial (proveedores) */}
      <div className="border rounded-xl overflow-hidden">
        <div className="px-4 py-2 border-b font-semibold">Historial para este producto</div>

        {loading ? (
          <div className="p-4 text-sm text-gray-500">Cargando...</div>
        ) : rows.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">No hay datos todavía.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-left">Lugar</th>
                <th className="p-3 text-left">Precio</th>
                <th className="p-3 text-left">Presentación</th>
                <th className="p-3 text-left">Contacto</th>
                <th className="p-3 text-left">Link</th>
                <th className="p-3 text-left">Acciones</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-3">{r.lugar}</td>
                  <td className="p-3">
                    {r.moneda} {Number(r.precio_compra).toFixed(2)}
                  </td>
                  <td className="p-3">{r.presentacion ?? "-"}</td>
                  <td className="p-3">{r.contacto ?? "-"}</td>
                  <td className="p-3">
                    {r.url ? (
                      <a className="text-blue-600 underline" href={r.url} target="_blank" rel="noreferrer">
                        Abrir
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="p-3">
                    <button
                      className="px-3 py-1.5 rounded-lg border hover:bg-gray-50"
                      onClick={() => borrarSource(r.id)}
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
