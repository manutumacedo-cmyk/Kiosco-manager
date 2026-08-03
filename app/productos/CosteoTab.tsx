"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchProductosParaCostear,
  guardarCostos,
  costoPorPorcion,
  calcularCobertura,
  type ProductoParaCostear,
  type CostoAGuardar,
} from "@/lib/services/costeo";
import { useToast } from "@/components/ui/Toast";

const fmt = (n: number) =>
  n.toLocaleString("es-UY", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** Lo que el usuario está escribiendo, antes de guardar. Se guarda como texto para
 *  no pelear con el input mientras tipea (borrar el último dígito, etc). */
interface Borrador {
  costoDirecto: string;
  costoBotella: string;
  porciones: string;
  modo: "directo" | "botella";
}

function borradorInicial(p: ProductoParaCostear): Borrador {
  // Si ya tiene datos de botella, arranca en ese modo: es como se cargó antes.
  const tieneBotella = !!p.costo_botella && !!p.porciones_por_botella;
  return {
    costoDirecto: p.costo ? String(p.costo) : "",
    costoBotella: p.costo_botella ? String(p.costo_botella) : "",
    porciones: p.porciones_por_botella ? String(p.porciones_por_botella) : "",
    modo: tieneBotella ? "botella" : "directo",
  };
}

export default function CosteoTab() {
  const toast = useToast();

  const [productos, setProductos] = useState<ProductoParaCostear[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [borradores, setBorradores] = useState<Record<string, Borrador>>({});
  const [soloSinCosto, setSoloSinCosto] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchProductosParaCostear();
      setProductos(data);
      setBorradores(Object.fromEntries(data.map((p) => [p.id, borradorInicial(p)])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar productos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const cobertura = useMemo(() => calcularCobertura(productos), [productos]);

  const visibles = useMemo(
    () => (soloSinCosto ? productos.filter((p) => !p.costo) : productos),
    [productos, soloSinCosto]
  );

  /** Costo unitario que resulta del borrador, o null si todavía no alcanza. */
  function costoResultante(p: ProductoParaCostear): number | null {
    const b = borradores[p.id];
    if (!b) return null;

    if (b.modo === "botella") {
      return costoPorPorcion(Number(b.costoBotella) || null, Number(b.porciones) || null);
    }
    const directo = Number(b.costoDirecto);
    return directo > 0 ? directo : null;
  }

  /** Solo lo que cambió respecto de lo que ya está guardado. */
  const pendientes = useMemo(() => {
    const out: CostoAGuardar[] = [];
    for (const p of productos) {
      const b = borradores[p.id];
      if (!b) continue;
      const costo = costoResultante(p);
      if (costo == null || costo <= 0) continue;
      if (p.costo && Math.abs(p.costo - costo) < 0.01) continue;

      out.push({
        id: p.id,
        costo: Math.round(costo * 100) / 100,
        costo_botella: b.modo === "botella" ? Number(b.costoBotella) || null : null,
        porciones_por_botella: b.modo === "botella" ? Number(b.porciones) || null : null,
      });
    }
    return out;
  }, [productos, borradores]);

  function setBorrador(id: string, patch: Partial<Borrador>) {
    setBorradores((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function handleGuardar() {
    if (pendientes.length === 0) return;
    setGuardando(true);
    try {
      const { guardados, errores } = await guardarCostos(pendientes);
      if (guardados > 0) toast.success(`✅ ${guardados} costo(s) guardado(s)`);
      if (errores.length > 0) toast.error(`${errores.length} no se pudieron guardar`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setGuardando(false);
    }
  }

  if (loading) {
    return (
      <div className="data-card text-center py-12">
        <div className="neon-text-cyan font-mono animate-glow">Cargando productos...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="data-card neon-outline-red">
        <div className="text-[var(--error)] font-bold">No se pudieron cargar los productos</div>
        <div className="text-xs text-[var(--text-secondary)] mt-1 font-mono">{error}</div>
        <button onClick={load} className="cyber-button mt-4">Reintentar</button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Cobertura: el número que dice si los márgenes del sistema ya sirven */}
      <div className="data-card neon-outline-cyan">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <div className="text-[var(--text-muted)] text-xs uppercase tracking-wide">
              Facturación con costo conocido
            </div>
            <div className="text-3xl font-bold neon-text-cyan mt-1">
              {(cobertura.cobertura * 100).toFixed(0)}%
            </div>
          </div>
          <div className="text-right text-sm">
            <div className="text-[var(--text-secondary)]">
              {cobertura.sinCosto} de {cobertura.totalProductos} productos sin costo
            </div>
            <div className="text-[var(--warning)] font-mono">
              $ {fmt(cobertura.facturadoSinCosto)} facturados sin costear
            </div>
          </div>
        </div>

        <div className="mt-3 h-2 rounded-full bg-[var(--dark-bg)] overflow-hidden">
          <div
            className="h-full bg-[var(--success)] transition-all duration-500"
            style={{ width: `${Math.round(cobertura.cobertura * 100)}%` }}
          />
        </div>

        <p className="text-xs text-[var(--text-secondary)] mt-3 leading-relaxed">
          Mientras esto no llegue cerca del 100%, la ganancia y el margen que muestra el
          sistema salen <strong>inflados</strong>. La lista está ordenada por lo que más
          factura: los primeros son los que más mueven la aguja.
        </p>
      </div>

      {/* Acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
          <input
            type="checkbox"
            checked={soloSinCosto}
            onChange={(e) => setSoloSinCosto(e.target.checked)}
            className="accent-[var(--neon-cyan)]"
          />
          Mostrar solo los que faltan
        </label>

        <button
          onClick={handleGuardar}
          disabled={pendientes.length === 0 || guardando}
          className="cyber-button-cyan"
        >
          {guardando
            ? "Guardando..."
            : pendientes.length > 0
              ? `Guardar ${pendientes.length} costo(s)`
              : "Sin cambios"}
        </button>
      </div>

      {visibles.length === 0 ? (
        <div className="data-card text-center py-12">
          <div className="text-4xl mb-3">🎉</div>
          <div className="text-[var(--text-secondary)]">
            Todos los productos tienen costo cargado
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {visibles.map((p) => {
            const b = borradores[p.id];
            if (!b) return null;
            const costo = costoResultante(p);
            const margen = costo != null ? p.precio - costo : null;
            const margenPct = costo != null && p.precio > 0 ? (margen! / p.precio) * 100 : null;
            const cambiado = pendientes.some((x) => x.id === p.id);

            return (
              <div
                key={p.id}
                className={`data-card ${cambiado ? "neon-outline-cyan" : ""} transition-all`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold text-[var(--text-primary)]">{p.nombre}</div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {p.categoria} · vende a{" "}
                      <span className="font-mono text-[var(--text-secondary)]">$ {fmt(p.precio)}</span>
                      {p.facturado > 0 && (
                        <>
                          {" · "}
                          <span className="text-[var(--neon-cyan)]">
                            $ {fmt(p.facturado)} en 30d
                          </span>{" "}
                          ({p.unidades_vendidas}u)
                        </>
                      )}
                    </div>
                  </div>

                  {/* Resultado en vivo */}
                  <div className="text-right shrink-0">
                    {costo != null ? (
                      <>
                        <div className="font-mono font-bold text-[var(--text-primary)]">
                          costo $ {fmt(costo)}
                        </div>
                        <div
                          className={`text-xs font-mono ${
                            margen! >= 0 ? "text-[var(--success)]" : "text-[var(--error)]"
                          }`}
                        >
                          margen $ {fmt(margen!)} ({margenPct!.toFixed(0)}%)
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-[var(--text-muted)]">sin costo</div>
                    )}
                  </div>
                </div>

                {/* Modo de carga */}
                <div className="flex gap-2 mt-3">
                  {([
                    { id: "directo" as const, label: "Costo directo" },
                    { id: "botella" as const, label: "De una botella" },
                  ]).map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setBorrador(p.id, { modo: m.id })}
                      className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                        b.modo === m.id
                          ? "border-[var(--neon-cyan)] text-[var(--neon-cyan)]"
                          : "border-[var(--slate-gray)] text-[var(--text-muted)] hover:border-[var(--neon-cyan)]"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {b.modo === "directo" ? (
                  <div className="mt-3 max-w-[14rem]">
                    <label className="block text-[10px] uppercase text-[var(--text-muted)] mb-1">
                      Cuánto te cuesta cada uno
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="cyber-input w-full font-mono"
                      placeholder="0"
                      value={b.costoDirecto}
                      onChange={(e) => setBorrador(p.id, { costoDirecto: e.target.value })}
                    />
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <div className="w-40">
                      <label className="block text-[10px] uppercase text-[var(--text-muted)] mb-1">
                        Costo de la botella
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="cyber-input w-full font-mono"
                        placeholder="0"
                        value={b.costoBotella}
                        onChange={(e) => setBorrador(p.id, { costoBotella: e.target.value })}
                      />
                    </div>
                    <div className="text-[var(--text-muted)] pb-2.5 font-mono">÷</div>
                    <div className="w-32">
                      <label className="block text-[10px] uppercase text-[var(--text-muted)] mb-1">
                        Porciones
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="cyber-input w-full font-mono"
                        placeholder="0"
                        value={b.porciones}
                        onChange={(e) => setBorrador(p.id, { porciones: e.target.value })}
                      />
                    </div>
                    {costo != null && (
                      <div className="pb-2 text-sm font-mono text-[var(--neon-cyan)]">
                        = $ {fmt(costo)} c/u
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
