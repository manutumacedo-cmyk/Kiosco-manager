"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Product, CartItem, CategoryType, ComboWithProducts } from "@/types";
import { CATEGORIES } from "@/types";
import { fetchActiveProducts } from "@/lib/services/products";
import { createSale } from "@/lib/services/sales";
import { fetchActiveCombos, getExchangeRate, convertBRLtoUYU } from "@/lib/services/combos";
import { getOpenSession } from "@/lib/services/cashSessions";
import { useToast } from "@/components/ui/Toast";

type Currency = "UYU" | "BRL";

// Pesos uruguayos no tienen centavos: redondeo a entero (≥0.50 sube, <0.50 baja).
// Solo para UYU — los reales (BRL) mantienen centavos.
const roundUYU = (n: number) => Math.round(n);

export default function NuevaVentaPage() {
  const toast = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [combos, setCombos] = useState<ComboWithProducts[]>([]);
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [q, setQ] = useState("");
  const [categoriaFilter, setCategoriaFilter] = useState<string>("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [nota, setNota] = useState("");
  const [showNota, setShowNota] = useState(false);
  const [saving, setSaving] = useState(false);

  // Tasa de cambio (se snapshot-ea en cada venta)
  const [exchangeRate, setExchangeRate] = useState(7.5); // BRL -> UYU

  // Modal de cobro
  const [showCobrarModal, setShowCobrarModal] = useState(false);
  const [cobroStep, setCobroStep] = useState<"select" | "vuelto">("select");
  const [paidAmount, setPaidAmount] = useState(0);
  const [paidCurrency, setPaidCurrency] = useState<Currency>("UYU");
  const [customAmount, setCustomAmount] = useState("");
  const [customCurrency, setCustomCurrency] = useState<Currency>("UYU");

  const searchInputRef = useRef<HTMLInputElement>(null);
  // "Latest ref" pattern: los atajos llaman a la versión actual sin re-registrar el listener.
  const abrirCobroRef = useRef(abrirCobro);
  const pagoJustoRef = useRef(cobrarPagoJusto);

  // Shot Extra (monto fijo configurable)
  const SHOT_EXTRA_AMOUNT = 50; // UYU
  const MONSTER_PRICE = 50.0; // UYU

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
      setSessionChecked(true);
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
        if (showCobrarModal) { cerrarCobro(); return; }
        if (document.activeElement === searchInputRef.current) {
          setQ("");
          searchInputRef.current?.blur();
        }
        return;
      }

      // F1–F5: cambiar tab (activos incluso con input enfocado; e.preventDefault evita F5=refresh)
      if (!showCobrarModal) {
        if (e.key === "F1") { e.preventDefault(); setCategoriaFilter(TABS[0]); setQ(""); return; }
        if (e.key === "F2") { e.preventDefault(); setCategoriaFilter(TABS[1]); setQ(""); return; }
        if (e.key === "F3") { e.preventDefault(); setCategoriaFilter(TABS[2]); setQ(""); return; }
        if (e.key === "F4") { e.preventDefault(); setCategoriaFilter(TABS[3]); setQ(""); return; }
        if (e.key === "F5") { e.preventDefault(); setCategoriaFilter(TABS[4]); setQ(""); return; }
      }

      // Ctrl+Enter: PAGO JUSTO (camino expreso), solo en el paso de selección
      if (e.key === "Enter" && e.ctrlKey && showCobrarModal && cobroStep === "select" && !saving) {
        e.preventDefault();
        pagoJustoRef.current();
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
        abrirCobroRef.current();
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
  }, [showCobrarModal, cobroStep, cart, saving]);

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
      return a + roundUYU(basePrice + monsterExtra + shotExtra);
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

  function resetCobro() {
    setCobroStep("select");
    setPaidAmount(0);
    setPaidCurrency("UYU");
    setCustomAmount("");
    setCustomCurrency("UYU");
    setShowNota(false);
  }

  function abrirCobro() {
    if (cart.length === 0) return;
    setNota("");
    resetCobro();
    setShowCobrarModal(true);
  }

  function cerrarCobro() {
    setShowCobrarModal(false);
    resetCobro();
  }

  // Vuelto en UYU según la moneda con que pagó
  const changeUYU = useMemo(() => {
    const paidInUYU = paidCurrency === "UYU" ? paidAmount : paidAmount * exchangeRate;
    return paidInUYU - total;
  }, [paidAmount, paidCurrency, total, exchangeRate]);

  // Único punto que registra una venta. Recibe el pago EXPLÍCITO (mata B24/B25:
  // no hay default ambiente de moneda; cada venta nace de una acción explícita).
  async function guardarVenta(pago: {
    metodo: string;
    moneda: Currency;
    pagado: number | null;
    vuelto: number | null;
    vuelto_moneda: Currency | null;
  }) {
    if (cart.length === 0) return toast.warning("Carrito vacío");

    setSaving(true);

    try {
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
        metodo_pago: pago.metodo,
        total,
        nota: nota.trim() ? nota.trim() : null,
        moneda: pago.moneda,
        pagado: pago.pagado,
        vuelto: pago.vuelto,
        vuelto_moneda: pago.vuelto_moneda,
        tasa_cambio: exchangeRate,
        session_id: openSessionId,
        items: saleItems,
        combos: combosVendidos.length > 0 ? combosVendidos : undefined,
      });

      toast.success("Venta guardada");

      setCart([]);
      setNota("");
      cerrarCobro();
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar venta");
    } finally {
      setSaving(false);
    }
  }

  // Acciones terminales (cada una = un pago explícito y completo)
  function cobrarPagoJusto() {
    guardarVenta({ metodo: "efectivo", moneda: "UYU", pagado: total, vuelto: 0, vuelto_moneda: "UYU" });
  }
  function cobrarPagoJustoBRL() {
    guardarVenta({ metodo: "efectivo", moneda: "BRL", pagado: total / exchangeRate, vuelto: 0, vuelto_moneda: "BRL" });
  }
  function cobrarDigital(metodo: string) {
    guardarVenta({ metodo, moneda: "UYU", pagado: null, vuelto: null, vuelto_moneda: null });
  }
  function elegirBillete(amount: number, currency: Currency) {
    setPaidAmount(amount);
    setPaidCurrency(currency);
    setCobroStep("vuelto");
  }
  function elegirCustom() {
    const raw = Number(customAmount);
    if (!raw || raw <= 0) return toast.warning("Ingresá un monto válido");
    const amount = customCurrency === "UYU" ? roundUYU(raw) : raw;
    setPaidAmount(amount);
    setPaidCurrency(customCurrency);
    setCobroStep("vuelto");
  }
  // Confirmaciones desde el paso "vuelto"
  function cobrarVueltoPesos() {
    guardarVenta({
      metodo: "efectivo",
      moneda: paidCurrency,
      pagado: paidAmount,
      vuelto: changeUYU > 0 ? roundUYU(changeUYU) : 0,
      vuelto_moneda: "UYU",
    });
  }
  function cobrarVueltoReales() {
    guardarVenta({
      metodo: "efectivo",
      moneda: paidCurrency,
      pagado: paidAmount,
      vuelto: changeUYU > 0 ? changeUYU / exchangeRate : 0,
      vuelto_moneda: "BRL",
    });
  }

  // Mantener las refs apuntando a la versión actual (para los atajos de teclado).
  abrirCobroRef.current = abrirCobro;
  pagoJustoRef.current = cobrarPagoJusto;

  const billetsUYU = [50, 100, 200, 500, 1000, 2000];
  const billetsBRL = [5, 10, 20, 50, 100, 200];

  // Tab activo: repropósita categoriaFilter; "" equivale a primera categoría
  const activeTab = categoriaFilter || CATEGORIES[0];
  // Grilla: todos los productos de la categoría activa (sin límite de 25);
  // si hay búsqueda activa, usa filtered con sus resultados de texto
  const gridProducts = q.trim()
    ? filtered
    : products.filter((p) => p.activo && p.stock > 0 && p.categoria === activeTab);

  if (sessionChecked && openSessionId === null) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[var(--deep-dark)] gap-6 p-6">
        <div className="text-6xl">🔒</div>
        <div className="text-center space-y-2">
          <p className="text-xl font-bold text-[var(--text-primary)]">No hay turno abierto.</p>
          <p className="text-[var(--text-secondary)]">Abrí la caja antes de cobrar.</p>
        </div>
        <Link
          href="/caja"
          className="px-6 py-3 rounded-lg font-bold uppercase tracking-wide transition-all neon-outline-cyan neon-text-cyan hover:bg-[var(--neon-cyan)]/10"
        >
          Ir a Caja →
        </Link>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[var(--deep-dark)] overflow-hidden">

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--slate-gray)] flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/" className="h-7 w-7 rounded-full neon-border-magenta animate-pulse-magenta hover:bg-[var(--magenta-glow)] transition-all flex-shrink-0" />
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
                      ${roundUYU(Number(combo.precio))}
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
                    ${roundUYU(Number(p.precio))}
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
                const subtotal = roundUYU(
                  it.cantidad * it.precio_unitario +
                  (it.includeMonster && it.categoria === "Vasos" ? it.cantidad * MONSTER_PRICE : 0) +
                  (it.shotExtra || 0)
                );
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
                        × ${roundUYU(it.precio_unitario)}
                      </span>
                      <span className="font-bold font-mono text-[var(--neon-magenta)] text-sm">
                        ${subtotal}
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
              <div className="text-right">
                <div className="text-3xl font-bold font-mono neon-text-cyan">
                  ${total} <span className="text-sm font-normal">UYU</span>
                </div>
                <div className="text-xs font-mono text-[var(--text-muted)]">
                  ≈ R${(total / exchangeRate).toFixed(2)} BRL
                </div>
              </div>
            </div>
            <button
              onClick={abrirCobro}
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

            {/* Cabecera */}
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold neon-text-magenta uppercase tracking-widest">Cobrar</h2>
              <button
                onClick={cerrarCobro}
                className="text-[var(--text-muted)] hover:text-[var(--error)] text-2xl leading-none transition-all"
              >
                ✕
              </button>
            </div>

            {/* Total */}
            <div className="text-center py-3 rounded-xl bg-[var(--cyan-glow)] border border-[var(--neon-cyan)]">
              <div className="text-[var(--text-muted)] text-xs uppercase tracking-wide">Total a cobrar</div>
              <div className="text-4xl font-bold font-mono neon-text-cyan mt-1">
                ${total} <span className="text-base font-normal">UYU</span>
              </div>
            </div>

            {cobroStep === "select" ? (
              <>
                {/* NIVEL 1 — PAGO JUSTO dual (un toque) */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={cobrarPagoJusto}
                    disabled={saving}
                    className="py-5 rounded-2xl border-2 border-[var(--neon-magenta)] bg-[var(--neon-magenta)] text-[var(--deep-dark)] font-bold uppercase tracking-wide shadow-lg hover:brightness-110 active:scale-[0.98] disabled:opacity-50 transition-all"
                  >
                    <div className="text-base leading-tight">PAGO JUSTO</div>
                    <div className="text-xl font-mono mt-0.5">${total}</div>
                    <div className="text-[10px] font-normal opacity-80 mt-0.5">UYU · un toque</div>
                  </button>
                  <button
                    onClick={cobrarPagoJustoBRL}
                    disabled={saving}
                    className="py-5 rounded-2xl border-2 border-[var(--neon-cyan)] text-[var(--neon-cyan)] font-bold uppercase tracking-wide hover:bg-[var(--neon-cyan)] hover:text-[var(--deep-dark)] active:scale-[0.98] disabled:opacity-50 transition-all"
                  >
                    <div className="text-base leading-tight">PAGO JUSTO</div>
                    <div className="text-xl font-mono mt-0.5">R${(total / exchangeRate).toFixed(2)}</div>
                    <div className="text-[10px] font-normal opacity-80 mt-0.5">BRL · un toque</div>
                  </button>
                </div>

                {/* divisor */}
                <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                  <div className="flex-1 h-px bg-[var(--slate-gray)]" /> pagó con otra cosa <div className="flex-1 h-px bg-[var(--slate-gray)]" />
                </div>

                {/* NIVEL 2 — billetes UYU */}
                <div>
                  <div className="text-[var(--text-muted)] text-[11px] uppercase tracking-wide mb-2">Billetes $ (pesos)</div>
                  <div className="grid grid-cols-3 gap-2">
                    {billetsUYU.map((amount) => (
                      <button
                        key={amount}
                        onClick={() => elegirBillete(amount, "UYU")}
                        disabled={saving}
                        className="py-2.5 text-sm font-bold rounded-lg border border-[var(--slate-gray)] text-[var(--text-secondary)] hover:border-[var(--neon-magenta)] hover:text-[var(--neon-magenta)] disabled:opacity-50 transition-all"
                      >
                        ${amount}
                      </button>
                    ))}
                  </div>
                </div>

                {/* NIVEL 2 — billetes BRL */}
                <div>
                  <div className="text-[var(--text-muted)] text-[11px] uppercase tracking-wide mb-2">Billetes R$ (reales)</div>
                  <div className="grid grid-cols-3 gap-2">
                    {billetsBRL.map((amount) => (
                      <button
                        key={amount}
                        onClick={() => elegirBillete(amount, "BRL")}
                        disabled={saving}
                        className="py-2.5 text-sm font-bold rounded-lg border border-[var(--slate-gray)] text-[var(--text-secondary)] hover:border-[var(--neon-cyan)] hover:text-[var(--neon-cyan)] disabled:opacity-50 transition-all"
                      >
                        R${amount}
                      </button>
                    ))}
                  </div>
                </div>

                {/* NIVEL 2 — monto custom */}
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <div className="text-[10px] text-[var(--text-muted)] uppercase mb-1">Otro monto</div>
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
                    onClick={elegirCustom}
                    disabled={!customAmount || Number(customAmount) <= 0 || saving}
                    className="py-2 px-3 text-xs font-bold rounded-lg border border-[var(--text-secondary)] text-[var(--text-secondary)] hover:border-[var(--neon-cyan)] hover:text-[var(--neon-cyan)] disabled:opacity-40 transition-all whitespace-nowrap"
                  >
                    Calcular
                  </button>
                </div>

                {/* NIVEL 3 — digital */}
                <div className="border-t border-[var(--slate-gray)] pt-3">
                  <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-2">Pago digital</div>
                  <div className="grid grid-cols-4 gap-2">
                    {([["debito", "Débito"], ["credito", "Crédito"], ["transferencia", "Transf."], ["mercadopago", "MP"]] as const).map(([val, label]) => (
                      <button
                        key={val}
                        onClick={() => cobrarDigital(val)}
                        disabled={saving}
                        className="py-2 text-[11px] font-semibold rounded-lg border border-[var(--slate-gray)] text-[var(--text-muted)] hover:border-[var(--neon-cyan)] hover:text-[var(--neon-cyan)] disabled:opacity-50 transition-all"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* NIVEL 3 — nota */}
                {showNota ? (
                  <input
                    className="cyber-input text-sm w-full"
                    placeholder="Nota..."
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    autoFocus
                  />
                ) : (
                  <button onClick={() => setShowNota(true)} className="text-xs text-[var(--text-muted)] hover:text-[var(--neon-cyan)] transition-all">
                    + Nota
                  </button>
                )}
              </>
            ) : (
              /* ── PASO VUELTO ── */
              <div className="space-y-4">
                <div className="text-center text-sm text-[var(--text-secondary)]">
                  Pagó con{" "}
                  <span className="font-bold text-[var(--text-primary)]">
                    {paidCurrency === "UYU" ? `$${roundUYU(paidAmount)} UYU` : `R$${paidAmount} BRL`}
                  </span>
                  {paidCurrency === "BRL" && (
                    <span className="text-[var(--text-muted)]"> (≈ ${roundUYU(paidAmount * exchangeRate)} UYU)</span>
                  )}
                </div>

                <div className="text-center py-3 rounded-xl border bg-[var(--magenta-glow)] border-[var(--neon-magenta)]">
                  <div className="text-[var(--text-muted)] text-xs uppercase">{changeUYU < 0 ? "Falta dinero" : "Vuelto a devolver"}</div>
                  <div className={`text-4xl font-bold font-mono mt-1 ${changeUYU < 0 ? "text-[var(--error)]" : "neon-text-magenta"}`}>
                    ${roundUYU(Math.abs(changeUYU))}<span className="text-base font-normal ml-1">UYU</span>
                  </div>
                </div>

                {changeUYU < 0 ? null : paidCurrency === "BRL" && changeUYU > 0 ? (
                  <>
                    <div className="text-center text-xs text-[var(--text-secondary)]">¿En qué moneda le das el vuelto?</div>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={cobrarVueltoPesos}
                        disabled={saving}
                        className="py-4 rounded-xl border-2 border-[var(--neon-cyan)] text-[var(--neon-cyan)] font-bold uppercase tracking-wide hover:bg-[var(--neon-cyan)] hover:text-[var(--deep-dark)] disabled:opacity-50 transition-all"
                      >
                        <div>En pesos</div>
                        <div className="font-mono text-lg mt-0.5">${roundUYU(changeUYU)}</div>
                      </button>
                      <button
                        onClick={cobrarVueltoReales}
                        disabled={saving}
                        className="py-4 rounded-xl border-2 border-[var(--neon-magenta)] bg-[var(--magenta-glow)] text-[var(--neon-magenta)] font-bold uppercase tracking-wide hover:bg-[var(--neon-magenta)] hover:text-[var(--deep-dark)] disabled:opacity-50 transition-all"
                      >
                        <div>En reales</div>
                        <div className="font-mono text-lg mt-0.5">R${(changeUYU / exchangeRate).toFixed(2)}</div>
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    onClick={cobrarVueltoPesos}
                    disabled={saving}
                    className="w-full py-4 rounded-xl border-2 border-[var(--neon-magenta)] bg-[var(--neon-magenta)] text-[var(--deep-dark)] font-bold uppercase tracking-widest hover:brightness-110 active:scale-[0.98] disabled:opacity-50 transition-all"
                  >
                    {saving ? "PROCESANDO..." : "Cobrar y cerrar"}
                  </button>
                )}

                <button
                  onClick={() => setCobroStep("select")}
                  disabled={saving}
                  className="text-xs py-2 px-4 rounded-lg border border-[var(--slate-gray)] text-[var(--text-muted)] hover:border-[var(--text-secondary)] transition-all"
                >
                  ← Cambiar billete
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
