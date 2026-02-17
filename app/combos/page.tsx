"use client";

import { useEffect, useState } from "react";
import type { ComboWithProducts, Product } from "@/types";
import {
  fetchAllCombos,
  createCombo,
  updateCombo,
  deleteCombo,
  getExchangeRate,
  updateExchangeRate,
} from "@/lib/services/combos";
import { fetchActiveProducts } from "@/lib/services/products";
import { useToast } from "@/components/ui/Toast";

interface ComboFormItem {
  product_id: string;
  cantidad: number;
}

export default function CombosPage() {
  const toast = useToast();
  const [combos, setCombos] = useState<ComboWithProducts[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Exchange rate
  const [exchangeRate, setExchangeRateState] = useState(7.5);
  const [editingRate, setEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState("7.5");

  // Combo form
  const [showForm, setShowForm] = useState(false);
  const [editingCombo, setEditingCombo] = useState<ComboWithProducts | null>(null);
  const [formNombre, setFormNombre] = useState("");
  const [formDescripcion, setFormDescripcion] = useState("");
  const [formPrecio, setFormPrecio] = useState("");
  const [formItems, setFormItems] = useState<ComboFormItem[]>([]);

  async function loadData() {
    setLoading(true);
    try {
      const [combosData, productsData, rate] = await Promise.all([
        fetchAllCombos(),
        fetchActiveProducts(),
        getExchangeRate(),
      ]);
      setCombos(combosData);
      setProducts(productsData);
      setExchangeRateState(rate);
      setRateInput(rate.toFixed(2));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function openCreateForm() {
    setEditingCombo(null);
    setFormNombre("");
    setFormDescripcion("");
    setFormPrecio("");
    setFormItems([]);
    setShowForm(true);
  }

  function openEditForm(combo: ComboWithProducts) {
    setEditingCombo(combo);
    setFormNombre(combo.nombre);
    setFormDescripcion(combo.descripcion || "");
    setFormPrecio(combo.precio.toString());
    setFormItems(
      combo.items.map((it) => ({
        product_id: it.product_id,
        cantidad: it.cantidad,
      }))
    );
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingCombo(null);
  }

  function addItemToForm() {
    if (products.length === 0) return;
    setFormItems([...formItems, { product_id: products[0].id, cantidad: 1 }]);
  }

  function removeItemFromForm(index: number) {
    setFormItems(formItems.filter((_, i) => i !== index));
  }

  function updateFormItem(index: number, field: "product_id" | "cantidad", value: string | number) {
    setFormItems(
      formItems.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    );
  }

  async function handleSubmitCombo() {
    if (!formNombre.trim()) return toast.warning("Ingresá el nombre del combo");
    if (!formPrecio || Number(formPrecio) <= 0) return toast.warning("Ingresá un precio válido");
    if (formItems.length === 0) return toast.warning("Agregá al menos un producto");

    try {
      if (editingCombo) {
        await updateCombo({
          id: editingCombo.id,
          nombre: formNombre.trim(),
          descripcion: formDescripcion.trim() || null,
          precio: Number(formPrecio),
          activo: editingCombo.activo,
          items: formItems,
        });
        toast.success("Combo actualizado");
      } else {
        await createCombo({
          nombre: formNombre.trim(),
          descripcion: formDescripcion.trim() || null,
          precio: Number(formPrecio),
          items: formItems,
        });
        toast.success("Combo creado");
      }

      closeForm();
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar combo");
    }
  }

  async function handleToggleActive(combo: ComboWithProducts) {
    try {
      await updateCombo({
        id: combo.id,
        nombre: combo.nombre,
        descripcion: combo.descripcion,
        precio: combo.precio,
        activo: !combo.activo,
        items: combo.items.map((it) => ({
          product_id: it.product_id,
          cantidad: it.cantidad,
        })),
      });
      toast.success(combo.activo ? "Combo desactivado" : "Combo activado");
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar combo");
    }
  }

  async function handleSaveExchangeRate() {
    const rate = Number(rateInput);

    if (!rate || rate <= 0) {
      return toast.warning("Ingresá una tasa válida (mayor a 0)");
    }

    if (rate > 100) {
      return toast.warning("La tasa no puede superar 100 UYU");
    }

    try {
      await updateExchangeRate(rate);
      setExchangeRateState(rate);
      setEditingRate(false);
      toast.success(`Tasa actualizada: 1 BRL = $${rate.toFixed(2)} UYU`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar tasa");
    }
  }

  return (
    <div className="min-h-screen bg-[var(--deep-dark)] p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full neon-border-cyan animate-pulse-cyan" />
          <h1 className="text-3xl font-bold neon-text-cyan">ADMINISTRACIÓN DE COMBOS</h1>
          <div className="text-2xl">🎁</div>
        </div>
        <button onClick={openCreateForm} className="cyber-button-cyan">
          + Crear Combo
        </button>
      </div>

      {/* Configuración de Tasa de Cambio */}
      <div className="data-card neon-outline-magenta p-4">
        <div className="text-[var(--neon-magenta)] font-bold text-lg uppercase tracking-wide mb-4">
          💱 Configuración de Cambio (BRL → UYU)
        </div>

        {!editingRate ? (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[var(--text-muted)] text-sm mb-1">Tasa actual:</div>
              <div className="text-3xl font-bold text-[var(--neon-cyan)] font-mono">
                1 BRL = ${exchangeRate.toFixed(2)} UYU
              </div>
            </div>
            <button
              onClick={() => setEditingRate(true)}
              className="cyber-button text-sm px-4 py-2"
            >
              ✏️ Modificar
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-[var(--text-muted)] text-sm mb-2">
                Nueva tasa (1 BRL = X UYU):
              </div>
              <input
                className="cyber-input w-full text-lg font-mono"
                type="number"
                step="0.01"
                min="0.01"
                max="100"
                value={rateInput}
                onChange={(e) => setRateInput(e.target.value)}
                placeholder="Ej: 7.50"
                autoFocus
              />
              <div className="text-xs text-[var(--text-secondary)] mt-1 font-mono">
                Rango permitido: 0.01 - 100.00 UYU
              </div>
            </div>
            <button
              onClick={handleSaveExchangeRate}
              className="cyber-button-cyan px-6 py-3 text-sm font-bold"
              disabled={!rateInput || Number(rateInput) <= 0 || Number(rateInput) > 100}
            >
              ✅ Guardar
            </button>
            <button
              onClick={() => {
                setEditingRate(false);
                setRateInput(exchangeRate.toFixed(2));
              }}
              className="cyber-button px-4 py-3 text-sm"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Lista de Combos */}
      <div className="data-card neon-outline-cyan p-4">
        <div className="text-[var(--neon-cyan)] font-bold text-lg uppercase tracking-wide mb-4">
          📋 Combos Existentes
        </div>

        {loading ? (
          <div className="text-center py-8 text-[var(--text-muted)] font-mono">Cargando...</div>
        ) : combos.length === 0 ? (
          <div className="text-center py-8 text-[var(--text-muted)] font-mono">
            No hay combos creados. Creá uno con el botón de arriba.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {combos.map((combo) => (
              <div
                key={combo.id}
                className={`border rounded-lg p-4 transition-all duration-200 ${
                  combo.activo
                    ? "border-[var(--neon-cyan)] bg-[var(--cyan-glow)] hover:border-[var(--neon-magenta)]"
                    : "border-[var(--slate-gray)] bg-[var(--carbon-gray)] opacity-60"
                }`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="font-bold text-[var(--text-primary)] text-lg">{combo.nombre}</div>
                    {combo.descripcion && (
                      <div className="text-xs text-[var(--text-muted)] mt-1">{combo.descripcion}</div>
                    )}
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded font-bold ${
                      combo.activo
                        ? "bg-[var(--success)] text-[var(--dark-bg)]"
                        : "bg-[var(--slate-gray)] text-[var(--text-muted)]"
                    }`}
                  >
                    {combo.activo ? "ACTIVO" : "INACTIVO"}
                  </span>
                </div>

                <div className="border-t border-[var(--slate-gray)] pt-3 mb-3">
                  <div className="text-xs text-[var(--text-muted)] uppercase mb-2">Productos incluidos:</div>
                  <div className="space-y-1">
                    {combo.items.map((item, idx) => (
                      <div key={idx} className="text-sm text-[var(--text-secondary)] font-mono">
                        • {item.cantidad}x {item.nombre}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-[var(--slate-gray)] pt-3 mb-3">
                  <div className="text-xs text-[var(--text-muted)] uppercase">Precio del combo:</div>
                  <div className="text-2xl font-bold text-[var(--neon-magenta)] font-mono">
                    ${Number(combo.precio).toFixed(2)}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => openEditForm(combo)}
                    className="flex-1 cyber-button text-xs py-2"
                  >
                    ✏️ Editar
                  </button>
                  <button
                    onClick={() => handleToggleActive(combo)}
                    className={`flex-1 text-xs py-2 rounded border font-bold transition-all duration-200 ${
                      combo.activo
                        ? "border-[var(--error)] text-[var(--error)] hover:bg-[var(--error)] hover:text-[var(--dark-bg)]"
                        : "border-[var(--success)] text-[var(--success)] hover:bg-[var(--success)] hover:text-[var(--dark-bg)]"
                    }`}
                  >
                    {combo.activo ? "🚫 Desactivar" : "✅ Activar"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de Formulario */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-6">
          <div className="data-card neon-outline-magenta p-6 max-w-2xl w-full max-h-[90vh] overflow-auto">
            <div className="text-[var(--neon-magenta)] font-bold text-xl uppercase tracking-wide mb-4">
              {editingCombo ? "✏️ Editar Combo" : "➕ Crear Combo"}
            </div>

            <div className="space-y-4">
              {/* Nombre */}
              <div>
                <label className="block text-sm text-[var(--text-muted)] uppercase mb-2">
                  Nombre del Combo
                </label>
                <input
                  className="cyber-input w-full"
                  value={formNombre}
                  onChange={(e) => setFormNombre(e.target.value)}
                  placeholder="Ej: Combo Noche"
                />
              </div>

              {/* Descripción */}
              <div>
                <label className="block text-sm text-[var(--text-muted)] uppercase mb-2">
                  Descripción (opcional)
                </label>
                <input
                  className="cyber-input w-full"
                  value={formDescripcion}
                  onChange={(e) => setFormDescripcion(e.target.value)}
                  placeholder="Ej: Botella + Hielo + 2 Vasos"
                />
              </div>

              {/* Precio */}
              <div>
                <label className="block text-sm text-[var(--text-muted)] uppercase mb-2">
                  Precio del Combo (UYU)
                </label>
                <input
                  className="cyber-input w-full"
                  type="number"
                  step="0.01"
                  value={formPrecio}
                  onChange={(e) => setFormPrecio(e.target.value)}
                  placeholder="Ej: 350.00"
                />
              </div>

              {/* Productos del Combo */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="text-sm text-[var(--text-muted)] uppercase">
                    Productos incluidos
                  </label>
                  <button
                    onClick={addItemToForm}
                    className="cyber-button text-xs px-3 py-1"
                  >
                    + Agregar Producto
                  </button>
                </div>

                {formItems.length === 0 ? (
                  <div className="text-center py-4 text-[var(--text-muted)] text-sm font-mono">
                    Agregá productos al combo
                  </div>
                ) : (
                  <div className="space-y-2">
                    {formItems.map((item, index) => (
                      <div
                        key={index}
                        className="flex gap-2 items-center border border-[var(--slate-gray)] rounded-lg p-2"
                      >
                        <select
                          className="cyber-input flex-1 text-sm"
                          value={item.product_id}
                          onChange={(e) => updateFormItem(index, "product_id", e.target.value)}
                        >
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nombre}
                            </option>
                          ))}
                        </select>

                        <input
                          className="cyber-input w-20 text-sm"
                          type="number"
                          min="1"
                          value={item.cantidad}
                          onChange={(e) =>
                            updateFormItem(index, "cantidad", Number(e.target.value))
                          }
                        />

                        <button
                          onClick={() => removeItemFromForm(index)}
                          className="text-xs px-3 py-2 rounded border border-[var(--error)] text-[var(--error)] hover:bg-[var(--error)] hover:text-[var(--dark-bg)] transition-all duration-200"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Botones */}
              <div className="flex gap-3 pt-4">
                <button onClick={handleSubmitCombo} className="flex-1 cyber-button-magenta py-3">
                  {editingCombo ? "💾 Guardar Cambios" : "➕ Crear Combo"}
                </button>
                <button onClick={closeForm} className="cyber-button py-3 px-6">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
