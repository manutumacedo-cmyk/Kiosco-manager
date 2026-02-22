"use client";

import { useEffect, useMemo, useState } from "react";
import type { Product, CartItem, CategoryType, ComboWithProducts } from "@/types";
import { CATEGORIES } from "@/types";
import { fetchActiveProducts } from "@/lib/services/products";
import { createSale } from "@/lib/services/sales";
import { fetchActiveCombos, getExchangeRate, convertBRLtoUYU } from "@/lib/services/combos";
import { useToast } from "@/components/ui/Toast";

type Currency = "UYU" | "BRL";

export default function NuevaVentaPage() {
  const toast = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [combos, setCombos] = useState<ComboWithProducts[]>([]);
  const [q, setQ] = useState("");
  const [categoriaFilter, setCategoriaFilter] = useState<string>("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [metodo, setMetodo] = useState("efectivo");
  const [nota, setNota] = useState("");
  const [saving, setSaving] = useState(false);

  // Calculadora de cambio
  const [exchangeRate, setExchangeRate] = useState(7.5); // BRL -> UYU
  const [showCalculator, setShowCalculator] = useState(false);
  const [paidAmount, setPaidAmount] = useState(0);
  const [paidCurrency, setPaidCurrency] = useState<Currency>("UYU");

  // Monto personalizado
  const [customAmount, setCustomAmount] = useState("");
  const [customCurrency, setCustomCurrency] = useState<Currency>("UYU");

  // Shot Extra (monto fijo configurable)
  const SHOT_EXTRA_AMOUNT = 50; // UYU
  const MONSTER_PRICE = 100.0; // UYU

  async function loadData() {
    try {
      const [productsData, combosData, rate] = await Promise.all([
        fetchActiveProducts(),
        fetchActiveCombos(),
        getExchangeRate(),
      ]);
      setProducts(productsData);
      setCombos(combosData);
      setExchangeRate(rate);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cargar datos");
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    let base = products.filter((p) => p.activo && p.stock > 0);

    if (categoriaFilter) {
      base = base.filter((p) => p.categoria === categoriaFilter);
    }

    if (!s) return base.slice(0, 25);
    return base.filter((p) => p.nombre.toLowerCase().includes(s)).slice(0, 25);
  }, [q, categoriaFilter, products]);

  const total = useMemo(() => {
    return cart.reduce((a, it) => {
      const basePrice = it.cantidad * it.precio_unitario;
      const monsterExtra = it.includeMonster && it.categoria === "Vasos" ? it.cantidad * MONSTER_PRICE : 0;
      const shotExtra = it.shotExtra || 0;
      return a + basePrice + monsterExtra + shotExtra;
    }, 0);
  }, [cart]);

  function add(p: Product) {
    if (p.stock <= 0) return;

    setCart((prev) => {
      const f = prev.find((x) => x.product_id === p.id && !x.isCombo);
      if (f) {
        if (f.cantidad + 1 > f.stock_actual) return prev;
        return prev.map((x) =>
          x.product_id === p.id && !x.isCombo ? { ...x, cantidad: x.cantidad + 1 } : x
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
          categoria: p.categoria,
          includeMonster: false,
          shotExtra: 0,
          isCombo: false,
        },
      ];
    });

    setQ("");
  }

  function addCombo(combo: ComboWithProducts) {
    // Verificar stock de todos los productos del combo
    for (const item of combo.items) {
      const product = products.find((p) => p.id === item.product_id);
      if (!product || product.stock < item.cantidad) {
        toast.warning(`Stock insuficiente para "${item.nombre}"`);
        return;
      }
    }

    setCart((prev) => [
      ...prev,
      {
        product_id: combo.id, // Usamos el ID del combo como product_id
        nombre: combo.nombre,
        cantidad: 1,
        precio_unitario: Number(combo.precio) || 0,
        stock_actual: 999, // Los combos no tienen límite directo
        categoria: "Combo",
        isCombo: true,
        combo_id: combo.id,
        shotExtra: 0,
      },
    ]);
  }

  function remove(product_id: string, isCombo: boolean = false) {
    setCart((prev) => prev.filter((x) => !(x.product_id === product_id && x.isCombo === isCombo)));
  }

  function setQty(product_id: string, cantidad: number, isCombo: boolean = false) {
    setCart((prev) =>
      prev.map((x) => {
        if (x.product_id !== product_id || x.isCombo !== isCombo) return x;
        const c = Math.max(1, isCombo ? cantidad : Math.min(x.stock_actual, cantidad || 1));
        return { ...x, cantidad: c };
      })
    );
  }

  function setPrice(product_id: string, precio_unitario: number, isCombo: boolean = false) {
    setCart((prev) =>
      prev.map((x) =>
        x.product_id === product_id && x.isCombo === isCombo
          ? { ...x, precio_unitario: Math.max(0, Number(precio_unitario) || 0) }
          : x
      )
    );
  }

  function toggleMonster(product_id: string) {
    setCart((prev) =>
      prev.map((x) =>
        x.product_id === product_id && !x.isCombo
          ? { ...x, includeMonster: !x.includeMonster }
          : x
      )
    );
  }

  function toggleShotExtra(product_id: string, isCombo: boolean = false) {
    setCart((prev) =>
      prev.map((x) => {
        if (x.product_id === product_id && x.isCombo === isCombo) {
          return {
            ...x,
            shotExtra: x.shotExtra ? 0 : SHOT_EXTRA_AMOUNT,
          };
        }
        return x;
      })
    );
  }

  async function handlePaymentButton(amount: number, currency: Currency) {
    setPaidAmount(amount);
    setPaidCurrency(currency);
    setShowCalculator(true);
  }

  function handleCustomPayment() {
    const amount = Number(customAmount);
    if (!amount || amount <= 0) {
      toast.warning("Ingresá un monto válido");
      return;
    }
    setPaidAmount(amount);
    setPaidCurrency(customCurrency);
    setShowCalculator(true);
  }

  const changeCalculation = useMemo(() => {
    if (paidCurrency === "UYU") {
      return {
        totalUYU: total,
        paidUYU: paidAmount,
        changeUYU: paidAmount - total,
      };
    } else {
      // Paga en BRL -> convertir a UYU
      const paidInUYU = paidAmount * exchangeRate;
      return {
        totalUYU: total,
        paidUYU: paidInUYU,
        changeUYU: paidInUYU - total,
      };
    }
  }, [paidAmount, paidCurrency, total, exchangeRate]);

  async function guardarVenta() {
    if (cart.length === 0) return toast.warning("Carrito vacío");
    if (!metodo.trim()) return toast.warning("Elegí método de pago");

    setSaving(true);

    try {
      // Preparar items para la venta
      const saleItems: Array<{
        product_id: string;
        cantidad: number;
        precio_unitario: number;
        stock_actual: number;
      }> = [];

      const combosVendidos: Array<{
        combo_id: string;
        combo_nombre: string;
        cantidad: number;
        precio_unitario: number;
        costo_unitario: number;
      }> = [];

      for (const it of cart) {
        if (it.isCombo) {
          // Es un combo: descontar inventario de cada producto componente
          const combo = combos.find((c) => c.id === it.combo_id);
          if (!combo) continue;

          for (const comboItem of combo.items) {
            const product = products.find((p) => p.id === comboItem.product_id);
            if (!product) continue;

            saleItems.push({
              product_id: comboItem.product_id,
              cantidad: comboItem.cantidad * it.cantidad,
              precio_unitario: 0, // El precio está en el combo
              stock_actual: product.stock,
            });
          }

          // Calcular costo unitario del combo
          const costoUnitario = combo.items.reduce((acc, ci) => {
            const product = products.find((p) => p.id === ci.product_id);
            return acc + (product?.costo ?? 0) * ci.cantidad;
          }, 0);

          combosVendidos.push({
            combo_id: combo.id,
            combo_nombre: combo.nombre,
            cantidad: it.cantidad,
            precio_unitario: it.precio_unitario + (it.shotExtra || 0),
            costo_unitario: costoUnitario,
          });
        } else {
          // Producto normal
          saleItems.push({
            product_id: it.product_id,
            cantidad: it.cantidad,
            precio_unitario: it.precio_unitario + (it.shotExtra || 0),
            stock_actual: it.stock_actual,
          });
        }
      }

      await createSale({
        metodo_pago: metodo,
        total,
        nota: nota.trim() ? nota.trim() : null,
        items: saleItems,
        combos: combosVendidos.length > 0 ? combosVendidos : undefined,
      });

      toast.success("Venta guardada");

      setCart([]);
      setMetodo("efectivo");
      setNota("");
      setShowCalculator(false);
      setPaidAmount(0);
      setCustomAmount("");
      setCustomCurrency("UYU");
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar venta");
    } finally {
      setSaving(false);
    }
  }

  const billetsUYU = [50, 100, 200, 500, 1000, 2000];
  const billetsBRL = [5, 10, 20, 50, 100, 200];

  return (
    <div className="min-h-screen bg-[var(--deep-dark)] p-4 space-y-4">
      {/* Header Compacto */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full neon-border-magenta animate-pulse-magenta" />
          <h1 className="text-2xl font-bold neon-text-magenta">PUNTO DE VENTA</h1>
          <div className="text-xl">🛒</div>
        </div>
        <div className="text-sm text-[var(--text-muted)] font-mono">
          Tipo de cambio: 1 BRL = ${exchangeRate.toFixed(2)} UYU
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* PANEL IZQUIERDO: Búsqueda + Carrito (2/3 del ancho) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Búsqueda de productos */}
          <div className="data-card neon-outline-cyan p-4">
            <div className="text-[var(--neon-cyan)] font-bold text-sm uppercase tracking-wide mb-3">
              🔍 Buscar producto
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <input
                className="cyber-input text-sm"
                placeholder="Nombre..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <select
                className="cyber-input text-sm"
                value={categoriaFilter}
                onChange={(e) => setCategoriaFilter(e.target.value)}
              >
                <option value="">Todas</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="border border-[var(--slate-gray)] rounded-lg max-h-40 overflow-auto bg-[var(--carbon-gray)]">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => add(p)}
                  className="w-full text-left px-3 py-2 text-sm border-b border-[var(--slate-gray)] hover:bg-[var(--cyan-glow)] hover:border-[var(--neon-cyan)] transition-all duration-200"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-[var(--text-primary)]">{p.nombre}</span>
                    <span className="font-mono font-bold text-[var(--neon-cyan)] text-xs">
                      ${Number(p.precio).toFixed(2)}
                    </span>
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono">Stock: {p.stock}</div>
                </button>
              ))}

              {filtered.length === 0 && (
                <div className="p-3 text-xs text-[var(--text-muted)] text-center font-mono">
                  Sin resultados.
                </div>
              )}
            </div>
          </div>

          {/* Combos disponibles */}
          {combos.length > 0 && (
            <div className="data-card neon-outline-magenta p-4">
              <div className="text-[var(--neon-magenta)] font-bold text-sm uppercase tracking-wide mb-3">
                🎁 Combos disponibles
              </div>
              <div className="grid grid-cols-2 gap-2">
                {combos.map((combo) => (
                  <button
                    key={combo.id}
                    onClick={() => addCombo(combo)}
                    className="text-left p-2 border border-[var(--slate-gray)] rounded-lg hover:border-[var(--neon-magenta)] hover:bg-[var(--magenta-glow)] transition-all duration-200"
                  >
                    <div className="font-semibold text-[var(--text-primary)] text-sm">{combo.nombre}</div>
                    <div className="text-[10px] text-[var(--text-muted)] mt-1">
                      {combo.items.map((it) => `${it.cantidad}x ${it.nombre}`).join(", ")}
                    </div>
                    <div className="font-mono font-bold text-[var(--neon-magenta)] text-xs mt-1">
                      ${Number(combo.precio).toFixed(2)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Carrito */}
          <div className="data-card neon-outline-magenta p-4">
            <div className="text-[var(--neon-magenta)] font-bold text-sm uppercase tracking-wide mb-3">
              🛒 Carrito ({cart.length})
            </div>

            {cart.length === 0 ? (
              <div className="text-center py-6 text-[var(--text-muted)] font-mono text-sm">
                Agregá productos
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-auto">
                {cart.map((it, idx) => (
                  <div
                    key={`${it.product_id}-${it.isCombo}-${idx}`}
                    className="border border-[var(--slate-gray)] rounded-lg p-2 bg-[var(--carbon-gray)] hover:border-[var(--neon-magenta)] transition-all duration-200"
                  >
                    <div className="flex justify-between items-center gap-2 mb-2">
                      <div className="font-semibold text-[var(--text-primary)] text-sm">
                        {it.nombre} {it.isCombo && <span className="text-[var(--neon-magenta)]">🎁</span>}
                      </div>
                      <button
                        onClick={() => remove(it.product_id, it.isCombo)}
                        className="text-[10px] px-2 py-1 rounded border border-[var(--error)] text-[var(--error)] hover:bg-[var(--error)] hover:text-[var(--dark-bg)] transition-all duration-200"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mb-2">
                      <div>
                        <div className="text-[10px] text-[var(--text-muted)] uppercase mb-1">Cant.</div>
                        <input
                          className="cyber-input w-full text-xs p-1"
                          type="number"
                          value={it.cantidad}
                          onChange={(e) => setQty(it.product_id, Number(e.target.value), it.isCombo)}
                        />
                      </div>

                      <div className="col-span-2">
                        <div className="text-[10px] text-[var(--text-muted)] uppercase mb-1">Precio</div>
                        <input
                          className="cyber-input w-full text-xs p-1"
                          type="number"
                          step="0.01"
                          value={it.precio_unitario}
                          onChange={(e) => setPrice(it.product_id, Number(e.target.value), it.isCombo)}
                        />
                      </div>
                    </div>

                    {/* Botones adicionales */}
                    <div className="flex gap-2 mb-2">
                      {/* Monster toggle (solo para Vasos) */}
                      {it.categoria === "Vasos" && !it.isCombo && (
                        <button
                          onClick={() => toggleMonster(it.product_id)}
                          className={`flex-1 text-[10px] px-2 py-1 rounded border transition-all duration-200 ${
                            it.includeMonster
                              ? "bg-[var(--magenta-glow)] border-[var(--neon-magenta)] text-[var(--neon-magenta)]"
                              : "border-[var(--slate-gray)] text-[var(--text-secondary)]"
                          }`}
                        >
                          🥤 Monster {it.includeMonster && `+$${MONSTER_PRICE}`}
                        </button>
                      )}

                      {/* Shot Extra */}
                      <button
                        onClick={() => toggleShotExtra(it.product_id, it.isCombo)}
                        className={`flex-1 text-[10px] px-2 py-1 rounded border font-bold transition-all duration-200 ${
                          it.shotExtra
                            ? "bg-[var(--cyan-glow)] border-[var(--neon-cyan)] text-[var(--neon-cyan)]"
                            : "border-[var(--slate-gray)] text-[var(--text-secondary)]"
                        }`}
                      >
                        🔥 Shot Extra {it.shotExtra ? `+$${SHOT_EXTRA_AMOUNT}` : ""}
                      </button>
                    </div>

                    <div className="pt-2 border-t border-[var(--slate-gray)] text-right">
                      <span className="text-[var(--text-muted)] text-[10px] uppercase mr-2">Subtotal:</span>
                      <span className="text-sm font-bold text-[var(--neon-magenta)] font-mono">
                        $
                        {(
                          it.cantidad * it.precio_unitario +
                          (it.includeMonster && it.categoria === "Vasos" ? it.cantidad * MONSTER_PRICE : 0) +
                          (it.shotExtra || 0)
                        ).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* PANEL DERECHO: Calculadora + Total (1/3 del ancho) */}
        <div className="space-y-4">
          {/* Total GIGANTE */}
          <div className="data-card neon-outline-cyan p-4 text-center bg-[var(--cyan-glow)]">
            <div className="text-[var(--text-muted)] text-xs uppercase tracking-wide mb-2">Total a Pagar</div>
            <div className="text-5xl font-bold text-[var(--neon-cyan)] font-mono animate-glow">
              ${total.toFixed(2)}
            </div>
            <div className="text-[var(--text-secondary)] text-sm mt-2 font-mono">UYU</div>
          </div>

          {/* Calculadora de Cambio */}
          {!showCalculator ? (
            <>
              {/* Monto Personalizado */}
              <div className="data-card neon-outline-cyan p-4">
                <div className="text-[var(--neon-cyan)] font-bold text-xs uppercase tracking-wide mb-3">
                  ✍️ Monto Personalizado
                </div>

                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <div className="text-[10px] text-[var(--text-muted)] uppercase mb-1">Monto</div>
                    <input
                      className="cyber-input w-full text-sm font-mono"
                      type="number"
                      step="0.01"
                      min="0"
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      placeholder="Ej: 175.50"
                      disabled={cart.length === 0}
                    />
                  </div>

                  <div className="w-24">
                    <div className="text-[10px] text-[var(--text-muted)] uppercase mb-1">Moneda</div>
                    <select
                      className="cyber-input w-full text-xs"
                      value={customCurrency}
                      onChange={(e) => setCustomCurrency(e.target.value as Currency)}
                      disabled={cart.length === 0}
                    >
                      <option value="UYU">UYU $</option>
                      <option value="BRL">BRL R$</option>
                    </select>
                  </div>

                  <button
                    onClick={handleCustomPayment}
                    disabled={cart.length === 0 || !customAmount || Number(customAmount) <= 0}
                    className="cyber-button-cyan py-2 px-4 text-xs font-bold whitespace-nowrap"
                  >
                    Calcular
                  </button>
                </div>
              </div>

              {/* Botones de billetes UYU */}
              <div className="data-card neon-outline-magenta p-4">
                <div className="text-[var(--neon-magenta)] font-bold text-xs uppercase tracking-wide mb-3">
                  💵 Pesos Uruguayos (UYU)
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {billetsUYU.map((amount) => (
                    <button
                      key={amount}
                      onClick={() => handlePaymentButton(amount, "UYU")}
                      className="cyber-button-magenta py-3 text-sm font-bold"
                      disabled={cart.length === 0}
                    >
                      ${amount}
                    </button>
                  ))}
                </div>
              </div>

              {/* Botones de billetes BRL */}
              <div className="data-card neon-outline-cyan p-4">
                <div className="text-[var(--neon-cyan)] font-bold text-xs uppercase tracking-wide mb-3">
                  💶 Reales Brasileños (BRL)
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {billetsBRL.map((amount) => (
                    <button
                      key={amount}
                      onClick={() => handlePaymentButton(amount, "BRL")}
                      className="cyber-button py-3 text-sm font-bold"
                      disabled={cart.length === 0}
                    >
                      R${amount}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            /* Visualización del CAMBIO */
            <div className="data-card neon-outline-magenta p-4 bg-[var(--magenta-glow)]">
              <div className="text-center space-y-3">
                <div>
                  <div className="text-[var(--text-muted)] text-xs uppercase">Total en Pesos</div>
                  <div className="text-2xl font-bold text-[var(--neon-cyan)] font-mono">
                    ${changeCalculation.totalUYU.toFixed(2)} UYU
                  </div>
                </div>

                <div>
                  <div className="text-[var(--text-muted)] text-xs uppercase">Pagó con</div>
                  <div className="text-xl font-bold text-[var(--text-primary)] font-mono">
                    {paidCurrency === "UYU" ? (
                      <>${paidAmount} UYU</>
                    ) : (
                      <>
                        R${paidAmount} BRL
                        <div className="text-xs text-[var(--text-secondary)] mt-1">
                          (≈ ${changeCalculation.paidUYU.toFixed(2)} UYU)
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t-2 border-[var(--neon-magenta)]">
                  <div className="text-[var(--text-muted)] text-xs uppercase">Cambio a Devolver</div>
                  <div
                    className={`text-4xl font-bold font-mono animate-pulse ${
                      changeCalculation.changeUYU >= 0 ? "text-[var(--neon-magenta)]" : "text-[var(--error)]"
                    }`}
                  >
                    ${Math.abs(changeCalculation.changeUYU).toFixed(2)} UYU
                  </div>
                  {changeCalculation.changeUYU < 0 && (
                    <div className="text-xs text-[var(--error)] mt-2">⚠️ Falta dinero</div>
                  )}
                </div>

                <button
                  onClick={() => setShowCalculator(false)}
                  className="cyber-button w-full py-2 text-xs"
                >
                  ← Cambiar billete
                </button>
              </div>
            </div>
          )}

          {/* Método de pago y Nota */}
          <div className="data-card neon-outline-cyan p-4 space-y-3">
            <select
              className="cyber-input text-sm w-full"
              value={metodo}
              onChange={(e) => setMetodo(e.target.value)}
            >
              <option value="efectivo">Efectivo</option>
              <option value="debito">Débito</option>
              <option value="credito">Crédito</option>
              <option value="transferencia">Transferencia</option>
              <option value="mercadopago">MercadoPago</option>
            </select>

            <input
              className="cyber-input text-sm w-full"
              placeholder="Nota (opcional)"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
            />

            <button
              onClick={guardarVenta}
              disabled={saving || cart.length === 0}
              className="cyber-button-magenta w-full py-3 text-sm font-bold"
            >
              {saving ? "PROCESANDO..." : "💾 GUARDAR VENTA"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
