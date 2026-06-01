"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Product, CartItem, CategoryType, ComboWithProducts } from "@/types";
import { CATEGORIES } from "@/types";
import { fetchActiveProducts } from "@/lib/services/products";
import { createSale } from "@/lib/services/sales";
import { fetchActiveCombos, getExchangeRate, convertBRLtoUYU } from "@/lib/services/combos";
import { getOpenSession } from "@/lib/services/cashSessions";
import { useToast } from "@/components/ui/Toast";

type Currency = "UYU" | "BRL";

export default function NuevaVentaPage() {
  const toast = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [combos, setCombos] = useState<ComboWithProducts[]>([]);
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
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

  // Modal de cobro (M10)
  const [showCobrarModal, setShowCobrarModal] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  // "Latest ref" pattern: siempre apunta a la versión actual de guardarVenta
  // sin necesitar que el useEffect de atajos la liste como dependencia.
  const guardarVentaRef = useRef(guardarVenta);

  // Shot Extra (monto fijo configurable)
  const SHOT_EXTRA_AMOUNT = 50; // UYU
  const MONSTER_PRICE = 100.0; // UYU

  async function loadData() {
    try {
      const [productsData, combosData, rate, session] = await Promise.all([
        fetchActiveProducts(),
        fetchActiveCombos(),
        getExchangeRate(),
        getOpenSession(),
      ]);
      setProducts(productsData);
      setCombos(combosData);
      setExchangeRate(rate);
      setOpenSessionId(session?.id ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cargar datos");
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // Atajos de teclado — M1
  useEffect(() => {
    const TABS = [...CATEGORIES, "Combos"] as string[];

    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      const inInput = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";

      // Esc: siempre activo, prioridad modal > búsqueda
      if (e.key === "Escape") {
        if (showCobrarModal) {
          setShowCobrarModal(false);
          setShowCalculator(false);
          setPaidAmount(0);
          return;
        }
        if (document.activeElement === searchInputRef.current) {
          setQ("");
          searchInputRef.current?.blur();
          return;
        }
        return;
      }

      // F1–F5: cambiar tab (activos incluso con input enfocado; e.preventDefault evita F5=refresh)
      if (e.key === "F1" && !showCobrarModal) { e.preventDefault(); setCategoriaFilter(TABS[0]); setQ(""); return; }
      if (e.key === "F2" && !showCobrarModal) { e.preventDefault(); setCategoriaFilter(TABS[1]); setQ(""); return; }
      if (e.key === "F3" && !showCobrarModal) { e.preventDefault(); setCategoriaFilter(TABS[2]); setQ(""); return; }
      if (e.key === "F4" && !showCobrarModal) { e.preventDefault(); setCategoriaFilter(TABS[3]); setQ(""); return; }
      if (e.key === "F5" && !showCobrarModal) { e.preventDefault(); setCategoriaFilter(TABS[4]); setQ(""); return; }

      // Ctrl+Enter: confirmar venta (solo dentro del modal, con Ctrl para evitar accidentes)
      if (e.key === "Enter" && e.ctrlKey && showCobrarModal && !saving) {
        e.preventDefault();
        guardarVentaRef.current().then(() => setShowCobrarModal(false));
        return;
      }

      // Los atajos restantes solo actúan fuera de inputs
      if (inInput) return;

      // /: enfocar búsqueda
      if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // Enter: abrir modal de cobro
      if (e.key === "Enter" && !showCobrarModal && cart.length > 0) {
        e.preventDefault();
        setShowCobrarModal(true);
        return;
      }

      // Ctrl+Delete / Ctrl+Backspace: limpiar carrito
      if ((e.key === "Delete" || e.key === "Backspace") && e.ctrlKey && cart.length > 0) {
        e.preventDefault();
        setCart([]);
        return;
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showCobrarModal, cart, saving]);

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

  async function guardarVenta(vuelto_moneda: 'UYU' | 'BRL' | null = null) {
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
            precio_unitario:
              it.precio_unitario +
              (it.shotExtra || 0) +
              (it.includeMonster && it.categoria === "Vasos" ? MONSTER_PRICE : 0),
            stock_actual: it.stock_actual,
          });

          // Monster (B14): se cobra dentro del precio del vaso (arriba), pero su stock
          // debe descontarse como producto aparte. Lo agregamos con precio 0 para no
          // cobrar doble. Se identifica por nombre (match por inclusión).
          if (it.includeMonster && it.categoria === "Vasos") {
            const monster = products.find((p) =>
              p.nombre.toLowerCase().includes("monster")
            );
            if (monster) {
              saleItems.push({
                product_id: monster.id,
                cantidad: it.cantidad,
                precio_unitario: 0,
                stock_actual: monster.stock,
              });
            } else {
              toast.warning("Monster no encontrado en productos — stock no descontado");
            }
          }
        }
      }

      await createSale({
        metodo_pago: metodo,
        total,
        nota: nota.trim() ? nota.trim() : null,
        moneda: paidCurrency,
        pagado: paidAmount > 0 ? paidAmount : null,
        vuelto: paidAmount > 0 && changeCalculation.changeUYU > 0
          ? (vuelto_moneda === 'BRL'
              ? changeCalculation.changeUYU / exchangeRate
              : changeCalculation.changeUYU)
          : null,
        vuelto_moneda: vuelto_moneda,
        session_id: openSessionId,
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

  // Actualizar la ref en cada render para que el useEffect de atajos
  // siempre llame a la versión actual sin re-registrar el listener.
  guardarVentaRef.current = guardarVenta;

  const billetsUYU = [50, 100, 200, 500, 1000, 2000];
  const billetsBRL = [5, 10, 20, 50, 100, 200];

  // Tab activo: repropósita categoriaFilter; "" equivale a primera categoría
  const activeTab = categoriaFilter || CATEGORIES[0];
  // Grilla: todos los productos de la categoría activa (sin límite de 25);
  // si hay búsqueda activa, usa filtered con sus resultados de texto
  const gridProducts = q.trim()
    ? filtered
    : products.filter((p) => p.activo && p.stock > 0 && p.categoria === activeTab);

  return (
    <div className="h-screen flex flex-col bg-[var(--deep-dark)] overflow-hidden">

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--slate-gray)] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-full neon-border-magenta animate-pulse-magenta" />
          <h1 className="text-xl font-bold neon-text-magenta tracking-wide">PUNTO DE VENTA</h1>
        </div>
        <input
          ref={searchInputRef}
          className="cyber-input text-sm w-56"
          placeholder="Buscar producto..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="text-xs text-[var(--text-muted)] font-mono">
          1 BRL = ${exchangeRate.toFixed(2)} UYU
        </div>
      </div>

      {/* ── TABS DE CATEGORÍA ── */}
      <div className="flex gap-1 px-4 pt-2 border-b border-[var(--slate-gray)] flex-shrink-0">
        {([...CATEGORIES, "Combos"] as string[]).map((cat) => (
          <button
            key={cat}
            onClick={() => { setCategoriaFilter(cat); setQ(""); }}
            className={`px-5 py-2 rounded-t-lg font-bold text-sm uppercase tracking-wide transition-all border-t border-l border-r ${
              activeTab === cat
                ? "border-[var(--neon-cyan)] text-[var(--neon-cyan)] bg-[var(--cyan-glow)]"
                : "border-[var(--slate-gray)] text-[var(--text-secondary)] hover:text-[var(--neon-cyan)] hover:border-[var(--neon-cyan)]"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* ── CUERPO: Grilla + Carrito ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* IZQUIERDA – Grilla de productos / combos */}
        <div className="flex-1 overflow-auto p-4">
          {activeTab === "Combos" ? (
            combos.length === 0 ? (
              <div className="text-center py-16 text-[var(--text-muted)] font-mono text-sm">
                No hay combos activos
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {combos.map((combo) => (
                  <button
                    key={combo.id}
                    onClick={() => addCombo(combo)}
                    className="flex flex-col items-start p-4 border border-[var(--slate-gray)] rounded-xl hover:border-[var(--neon-magenta)] hover:bg-[var(--magenta-glow)] active:scale-95 transition-all duration-150 text-left min-h-[110px]"
                  >
                    <div className="font-bold text-[var(--text-primary)] text-sm leading-tight mb-1 truncate w-full">
                      {combo.nombre}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] leading-tight flex-1">
                      {combo.items.map((it) => `${it.cantidad}× ${it.nombre}`).join(" · ")}
                    </div>
                    <div className="font-mono font-bold text-[var(--neon-magenta)] text-lg mt-2">
                      ${Number(combo.precio).toFixed(2)}
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : gridProducts.length === 0 ? (
            <div className="text-center py-16 text-[var(--text-muted)] font-mono text-sm">
              {q.trim() ? "Sin resultados para esa búsqueda" : "Sin productos en esta categoría"}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {gridProducts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => add(p)}
                  className="flex flex-col items-start p-4 border border-[var(--slate-gray)] rounded-xl hover:border-[var(--neon-cyan)] hover:bg-[var(--cyan-glow)] active:scale-95 transition-all duration-150 text-left min-h-[100px]"
                >
                  <div className="font-bold text-[var(--text-primary)] text-sm leading-tight truncate w-full">
                    {p.nombre}
                  </div>
                  <div className="font-mono font-bold text-[var(--neon-cyan)] text-2xl mt-auto">
                    ${Number(p.precio).toFixed(2)}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono">
                    Stock: {p.stock}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* DERECHA – Carrito */}
        <div className="w-[360px] flex flex-col border-l border-[var(--slate-gray)] flex-shrink-0">

          {/* Encabezado carrito */}
          <div className="px-4 py-3 border-b border-[var(--slate-gray)] flex items-center justify-between flex-shrink-0">
            <span className="text-[var(--neon-magenta)] font-bold text-sm uppercase tracking-wide">
              Carrito ({cart.length})
            </span>
            {cart.length > 0 && (
              <button
                onClick={() => setCart([])}
                className="text-[10px] px-2 py-1 rounded border border-transparent text-[var(--text-muted)] hover:border-[var(--error)] hover:text-[var(--error)] transition-all"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Ítems */}
          <div className="flex-1 overflow-auto p-3 space-y-2">
            {cart.length === 0 ? (
              <div className="text-center py-16 text-[var(--text-muted)] font-mono text-sm leading-relaxed">
                Tocá un producto<br />para agregarlo
              </div>
            ) : (
              cart.map((it, idx) => {
                const subtotal =
                  it.cantidad * it.precio_unitario +
                  (it.includeMonster && it.categoria === "Vasos" ? it.cantidad * MONSTER_PRICE : 0) +
                  (it.shotExtra || 0);
                const esVaso = it.categoria === "Vasos" && !it.isCombo;

                return (
                  <div
                    key={`${it.product_id}-${it.isCombo}-${idx}`}
                    className="border border-[var(--slate-gray)] rounded-xl p-3 bg-[var(--carbon-gray)]"
                  >
                    {/* Fila 1: nombre + quitar */}
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <span className="font-semibold text-[var(--text-primary)] text-sm leading-tight truncate">
                        {it.nombre}{it.isCombo ? " 🎁" : ""}
                      </span>
                      <button
                        onClick={() => remove(it.product_id, it.isCombo)}
                        className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-[var(--error)] text-[var(--error)] hover:bg-[var(--error)] hover:text-white transition-all leading-none"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Fila 2: cantidad +/- · precio unitario · subtotal */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setQty(it.product_id, it.cantidad - 1, it.isCombo)}
                        className="w-7 h-7 rounded border border-[var(--slate-gray)] text-[var(--text-secondary)] hover:border-[var(--neon-cyan)] hover:text-[var(--neon-cyan)] font-bold text-base leading-none transition-all"
                      >
                        −
                      </button>
                      <span className="w-7 text-center font-mono font-bold text-[var(--text-primary)] text-sm">
                        {it.cantidad}
                      </span>
                      <button
                        onClick={() => setQty(it.product_id, it.cantidad + 1, it.isCombo)}
                        className="w-7 h-7 rounded border border-[var(--slate-gray)] text-[var(--text-secondary)] hover:border-[var(--neon-cyan)] hover:text-[var(--neon-cyan)] font-bold text-base leading-none transition-all"
                      >
                        +
                      </button>
                      <span className="text-[var(--text-muted)] text-[11px] font-mono ml-1 flex-1">
                        × ${it.precio_unitario}
                      </span>
                      <span className="font-bold font-mono text-[var(--neon-magenta)] text-sm">
                        ${subtotal.toFixed(2)}
                      </span>
                    </div>

                    {/* Fila 3: extras Monster + Shot Extra (solo Vasos) */}
                    {esVaso && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => toggleMonster(it.product_id)}
                          className={`flex-1 text-[11px] py-1.5 rounded-lg border font-semibold transition-all ${
                            it.includeMonster
                              ? "bg-[var(--magenta-glow)] border-[var(--neon-magenta)] text-[var(--neon-magenta)]"
                              : "border-[var(--slate-gray)] text-[var(--text-muted)] hover:border-[var(--neon-magenta)]"
                          }`}
                        >
                          Monster{it.includeMonster ? ` +$${MONSTER_PRICE}` : ""}
                        </button>
                        <button
                          onClick={() => toggleShotExtra(it.product_id, false)}
                          className={`flex-1 text-[11px] py-1.5 rounded-lg border font-semibold transition-all ${
                            it.shotExtra
                              ? "bg-[var(--cyan-glow)] border-[var(--neon-cyan)] text-[var(--neon-cyan)]"
                              : "border-[var(--slate-gray)] text-[var(--text-muted)] hover:border-[var(--neon-cyan)]"
                          }`}
                        >
                          Shot Extra{it.shotExtra ? ` +$${SHOT_EXTRA_AMOUNT}` : ""}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Total + COBRAR */}
          <div className="border-t border-[var(--slate-gray)] p-4 space-y-3 flex-shrink-0">
            <div className="flex justify-between items-baseline">
              <span className="text-[var(--text-muted)] text-xs uppercase tracking-wide">Total</span>
              <span className="text-3xl font-bold font-mono neon-text-cyan">
                ${total.toFixed(2)}
              </span>
            </div>
            <button
              onClick={() => setShowCobrarModal(true)}
              disabled={cart.length === 0}
              className="w-full py-4 text-lg font-bold uppercase tracking-widest rounded-xl border-2 border-[var(--neon-magenta)] text-[var(--neon-magenta)] bg-[var(--magenta-glow)] hover:bg-[var(--neon-magenta)] hover:text-[var(--deep-dark)] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
            >
              COBRAR →
            </button>
          </div>
        </div>
      </div>

      {/* ── MODAL DE COBRO ── */}
      {showCobrarModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--deep-dark)] border border-[var(--neon-magenta)] rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4 max-h-[90vh] overflow-auto">

            {/* Cabecera modal */}
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold neon-text-magenta uppercase tracking-widest">Cobrar</h2>
              <button
                onClick={() => { setShowCobrarModal(false); setShowCalculator(false); setPaidAmount(0); }}
                className="text-[var(--text-muted)] hover:text-[var(--error)] text-2xl leading-none transition-all"
              >
                ✕
              </button>
            </div>

            {/* Total */}
            <div className="text-center py-3 rounded-xl bg-[var(--cyan-glow)] border border-[var(--neon-cyan)]">
              <div className="text-[var(--text-muted)] text-xs uppercase tracking-wide">Total a cobrar</div>
              <div className="text-4xl font-bold font-mono neon-text-cyan mt-1">
                ${total.toFixed(2)} <span className="text-base font-normal">UYU</span>
              </div>
            </div>

            {!showCalculator ? (
              <div className="space-y-4">
                {/* Billetes UYU */}
                <div>
                  <div className="text-[var(--text-muted)] text-[11px] uppercase tracking-wide mb-2">Pesos UYU</div>
                  <div className="grid grid-cols-3 gap-2">
                    {billetsUYU.map((amount) => (
                      <button
                        key={amount}
                        onClick={() => handlePaymentButton(amount, "UYU")}
                        className="py-3 text-sm font-bold rounded-lg border border-[var(--neon-magenta)] text-[var(--neon-magenta)] hover:bg-[var(--neon-magenta)] hover:text-[var(--deep-dark)] transition-all"
                      >
                        ${amount}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Billetes BRL */}
                <div>
                  <div className="text-[var(--text-muted)] text-[11px] uppercase tracking-wide mb-2">Reales BRL</div>
                  <div className="grid grid-cols-3 gap-2">
                    {billetsBRL.map((amount) => (
                      <button
                        key={amount}
                        onClick={() => handlePaymentButton(amount, "BRL")}
                        className="py-3 text-sm font-bold rounded-lg border border-[var(--neon-cyan)] text-[var(--neon-cyan)] hover:bg-[var(--neon-cyan)] hover:text-[var(--deep-dark)] transition-all"
                      >
                        R${amount}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Monto personalizado */}
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <div className="text-[10px] text-[var(--text-muted)] uppercase mb-1">Monto personalizado</div>
                    <input
                      className="cyber-input w-full text-sm font-mono"
                      type="number"
                      step="0.01"
                      min="0"
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      placeholder="175.50"
                    />
                  </div>
                  <div className="w-20">
                    <div className="text-[10px] text-[var(--text-muted)] uppercase mb-1">Moneda</div>
                    <select
                      className="cyber-input w-full text-xs"
                      value={customCurrency}
                      onChange={(e) => setCustomCurrency(e.target.value as Currency)}
                    >
                      <option value="UYU">UYU</option>
                      <option value="BRL">BRL</option>
                    </select>
                  </div>
                  <button
                    onClick={handleCustomPayment}
                    disabled={!customAmount || Number(customAmount) <= 0}
                    className="py-2 px-3 text-xs font-bold rounded-lg border border-[var(--neon-cyan)] text-[var(--neon-cyan)] hover:bg-[var(--neon-cyan)] hover:text-[var(--deep-dark)] disabled:opacity-40 transition-all whitespace-nowrap"
                  >
                    Calcular
                  </button>
                </div>
              </div>
            ) : (
              /* Vuelto */
              <div className="border border-[var(--neon-magenta)] rounded-xl p-5 bg-[var(--magenta-glow)] text-center space-y-3">
                <div>
                  <div className="text-[var(--text-muted)] text-xs uppercase">Pagó con</div>
                  <div className="text-xl font-bold font-mono text-[var(--text-primary)] mt-1">
                    {paidCurrency === "UYU" ? `$${paidAmount} UYU` : `R$${paidAmount} BRL`}
                  </div>
                  {paidCurrency === "BRL" && (
                    <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                      ≈ ${changeCalculation.paidUYU.toFixed(2)} UYU
                    </div>
                  )}
                </div>
                <div className="pt-3 border-t border-[var(--neon-magenta)]">
                  <div className="text-[var(--text-muted)] text-xs uppercase">Cambio a devolver</div>
                  <div className={`text-5xl font-bold font-mono mt-1 ${
                    changeCalculation.changeUYU >= 0 ? "neon-text-magenta" : "text-[var(--error)]"
                  }`}>
                    ${Math.abs(changeCalculation.changeUYU).toFixed(2)}
                    <span className="text-lg font-normal ml-1">UYU</span>
                  </div>
                  {changeCalculation.changeUYU < 0 && (
                    <div className="text-xs text-[var(--error)] mt-1">Falta dinero</div>
                  )}
                </div>
                {metodo === "efectivo" && paidCurrency === "BRL" && changeCalculation.changeUYU > 0 && (
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={async () => { await guardarVenta("UYU"); setShowCobrarModal(false); }}
                      disabled={saving}
                      className="w-full py-3 text-sm font-bold uppercase tracking-widest rounded-xl border-2 border-[var(--neon-cyan)] text-[var(--neon-cyan)] hover:bg-[var(--neon-cyan)] hover:text-[var(--deep-dark)] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150"
                    >
                      {saving ? "PROCESANDO..." : `Di el vuelto en PESOS ($${changeCalculation.changeUYU.toFixed(2)} UYU)`}
                    </button>
                    <button
                      onClick={async () => { await guardarVenta("BRL"); setShowCobrarModal(false); }}
                      disabled={saving}
                      className="w-full py-3 text-sm font-bold uppercase tracking-widest rounded-xl border-2 border-[var(--neon-magenta)] text-[var(--neon-magenta)] bg-[var(--magenta-glow)] hover:bg-[var(--neon-magenta)] hover:text-[var(--deep-dark)] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150"
                    >
                      {saving ? "PROCESANDO..." : `Di el vuelto en REALES (R$${(changeCalculation.changeUYU / exchangeRate).toFixed(2)} BRL)`}
                    </button>
                  </div>
                )}
                <button
                  onClick={() => setShowCalculator(false)}
                  className="text-xs py-2 px-4 rounded-lg border border-[var(--slate-gray)] text-[var(--text-muted)] hover:border-[var(--text-secondary)] transition-all"
                >
                  ← Cambiar billete
                </button>
              </div>
            )}

            {/* Método + nota + confirmar */}
            <div className="border-t border-[var(--slate-gray)] pt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[10px] text-[var(--text-muted)] uppercase mb-1">Método de pago</div>
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
                </div>
                <div>
                  <div className="text-[10px] text-[var(--text-muted)] uppercase mb-1">Nota (opcional)</div>
                  <input
                    className="cyber-input text-sm w-full"
                    placeholder="..."
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                  />
                </div>
              </div>
              <button
                onClick={async () => { await guardarVenta(null); setShowCobrarModal(false); }}
                disabled={saving}
                className="w-full py-4 text-base font-bold uppercase tracking-widest rounded-xl border-2 border-[var(--neon-magenta)] text-[var(--neon-magenta)] bg-[var(--magenta-glow)] hover:bg-[var(--neon-magenta)] hover:text-[var(--deep-dark)] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150"
              >
                {saving ? "PROCESANDO..." : "CONFIRMAR VENTA"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
