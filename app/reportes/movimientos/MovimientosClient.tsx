"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { CategoriaSalida } from "@/types";
import {
  fetchMovimientosDetallados,
  type MovimientoDetallado,
} from "@/lib/services/cashSessions";
import { fetchIngresosPeriodo, fetchPromediosPorCategoria } from "@/lib/services/reports";
import { CATEGORIA_LABEL, money } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import { MetricCard, Panel, EmptyState, TH, TROW } from "@/app/reportes/hoy/dashboardUi";
import { CategoriaBreakdown } from "./CategoriaBreakdown";
import { PromedioMensualPanel } from "./PromedioMensualPanel";
import { CATEGORIA_FILTER_OPTIONS, type DateFilter, type CategoriaFilter } from "./types";

const CATEGORIAS_VACIAS: Record<CategoriaSalida, number> = {
  restock: 0,
  proveedor: 0,
  gasto_personal: 0,
  funcionario: 0,
  otro: 0,
};

function getDateRange(filter: DateFilter, customStart: string, customEnd: string): { desde: string; hasta: string } {
  const now = new Date();
  const desde = new Date(now);
  const hasta = new Date(now);

  switch (filter) {
    case "today":
      desde.setHours(0, 0, 0, 0);
      hasta.setHours(23, 59, 59, 999);
      break;
    case "week":
      desde.setDate(now.getDate() - 7);
      desde.setHours(0, 0, 0, 0);
      hasta.setHours(23, 59, 59, 999);
      break;
    case "month":
      desde.setDate(now.getDate() - 30);
      desde.setHours(0, 0, 0, 0);
      hasta.setHours(23, 59, 59, 999);
      break;
    case "custom":
      if (customStart && customEnd) {
        const cs = new Date(customStart);
        const ce = new Date(customEnd);
        cs.setHours(0, 0, 0, 0);
        ce.setHours(23, 59, 59, 999);
        return { desde: cs.toISOString(), hasta: ce.toISOString() };
      }
      desde.setDate(now.getDate() - 30);
      desde.setHours(0, 0, 0, 0);
      hasta.setHours(23, 59, 59, 999);
      break;
  }

  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
}

export default function MovimientosClient() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);

  const [dateFilter, setDateFilter] = useState<DateFilter>("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [categoriaFilter, setCategoriaFilter] = useState<CategoriaFilter>("todas");
  const [cajeroFilter, setCajeroFilter] = useState<string>("todos");

  const [movimientos, setMovimientos] = useState<MovimientoDetallado[]>([]);
  const [ingresosPeriodo, setIngresosPeriodo] = useState(0);
  const [promedios, setPromedios] = useState<Record<CategoriaSalida, number>>(CATEGORIAS_VACIAS);

  async function loadData() {
    setLoading(true);
    try {
      const { desde, hasta } = getDateRange(dateFilter, customStart, customEnd);
      const [movs, ingresos, prom] = await Promise.all([
        fetchMovimientosDetallados(desde, hasta),
        fetchIngresosPeriodo(desde, hasta),
        fetchPromediosPorCategoria(),
      ]);
      setMovimientos(movs);
      setIngresosPeriodo(ingresos);
      setPromedios(prom);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cargar movimientos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, [dateFilter, customStart, customEnd]);

  const cajeros = useMemo(() => {
    const set = new Set(movimientos.map((m) => m.cajero));
    return Array.from(set).sort();
  }, [movimientos]);

  const movimientosFiltrados = useMemo(() => {
    return movimientos.filter((m) => {
      // La categoría solo aplica a salidas (las entradas no llevan categoría por diseño —
      // ver CategoriaSalida). Filtrar por categoría no debe hacer desaparecer las entradas,
      // o "Total entradas"/"Neto" quedarían mal (siempre en 0 / negativo) apenas se elija
      // cualquier categoría.
      if (categoriaFilter !== "todas" && m.tipo === "salida" && m.categoria !== categoriaFilter) return false;
      if (cajeroFilter !== "todos" && m.cajero !== cajeroFilter) return false;
      return true;
    });
  }, [movimientos, categoriaFilter, cajeroFilter]);

  const resumen = useMemo(() => {
    const salidas = movimientosFiltrados.filter((m) => m.tipo === "salida");
    const entradas = movimientosFiltrados.filter((m) => m.tipo === "entrada");

    const totalSalidasUyu = salidas.filter((m) => m.moneda === "UYU").reduce((s, m) => s + Number(m.monto), 0);
    const totalSalidasBrl = salidas.filter((m) => m.moneda === "BRL").reduce((s, m) => s + Number(m.monto), 0);
    const totalEntradasUyu = entradas.filter((m) => m.moneda === "UYU").reduce((s, m) => s + Number(m.monto), 0);
    const totalEntradasBrl = entradas.filter((m) => m.moneda === "BRL").reduce((s, m) => s + Number(m.monto), 0);

    const salidasPorCategoria: Record<CategoriaSalida, number> = { ...CATEGORIAS_VACIAS };
    for (const m of salidas) {
      if (m.moneda === "UYU" && m.categoria) salidasPorCategoria[m.categoria] += Number(m.monto);
    }

    // Operating Expense Ratio: salidas del período / ingresos del período. Solo tiene
    // sentido con salidas en UYU sobre ingresos (ya en UYU, ver reports.ts).
    // `ingresosPeriodo` es el total de TODOS los cajeros (fetchIngresosPeriodo no filtra
    // por cajero) — si hay un filtro de cajero activo, el numerador queda restringido a
    // ese cajero pero el denominador no, dando un ratio que no compara lo mismo. En ese
    // caso el ratio no se muestra (ver `ratioValido` abajo) en vez de mostrar un número
    // que parece real pero está mal armado.
    const ratioValido = cajeroFilter === "todos" && ingresosPeriodo > 0;
    const ratioGasto = ratioValido ? (totalSalidasUyu / ingresosPeriodo) * 100 : 0;

    return {
      totalSalidasUyu,
      totalSalidasBrl,
      totalEntradasUyu,
      totalEntradasBrl,
      netoUyu: totalEntradasUyu - totalSalidasUyu,
      netoBrl: totalEntradasBrl - totalSalidasBrl,
      salidasPorCategoria,
      ratioValido,
      ratioGasto,
    };
  }, [movimientosFiltrados, ingresosPeriodo, cajeroFilter]);

  return (
    <div className="min-h-screen bg-[var(--deep-dark)] p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Image src="/logo.png" alt="24 SIETE" width={40} height={40} className="cursor-pointer" />
          </Link>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--cyan-core)" }}>
            Movimientos de caja
          </h1>
        </div>
        <button onClick={loadData} className="cyber-button" disabled={loading}>
          {loading ? "Cargando..." : "Refrescar"}
        </button>
      </div>

      {/* Filtros */}
      <Panel title="Filtros" accent="cyan">
        <div className="space-y-4">
          <div>
            <div className="text-xs text-[var(--text-muted)] uppercase tracking-wide mb-2">Período</div>
            <div className="flex gap-2 flex-wrap">
              {[
                { id: "today" as DateFilter, label: "Hoy" },
                { id: "week" as DateFilter, label: "Última semana" },
                { id: "month" as DateFilter, label: "Último mes" },
                { id: "custom" as DateFilter, label: "Personalizado" },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setDateFilter(f.id)}
                  className={`px-4 py-2 rounded-lg font-semibold text-sm uppercase tracking-wide transition-all border ${
                    dateFilter === f.id
                      ? "border-[var(--neon-magenta)] bg-[var(--magenta-glow)] text-[var(--neon-magenta)]"
                      : "border-[var(--slate-gray)] text-[var(--text-secondary)] hover:border-[var(--neon-cyan)] hover:text-[var(--neon-cyan)]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {dateFilter === "custom" && (
              <div className="flex gap-4 items-center mt-3">
                <div className="flex-1">
                  <label className="text-xs text-[var(--text-muted)] block mb-1.5">Desde</label>
                  <input
                    type="date"
                    className="cyber-input w-full"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-[var(--text-muted)] block mb-1.5">Hasta</label>
                  <input
                    type="date"
                    className="cyber-input w-full"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-6">
            <div>
              <div className="text-xs text-[var(--text-muted)] uppercase tracking-wide mb-2">Categoría</div>
              <div className="flex gap-2 flex-wrap">
                {CATEGORIA_FILTER_OPTIONS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategoriaFilter(c)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide transition-all border ${
                      categoriaFilter === c
                        ? "border-[var(--neon-cyan)] bg-[var(--cyan-glow)] text-[var(--neon-cyan)]"
                        : "border-[var(--slate-gray)] text-[var(--text-secondary)] hover:border-[var(--neon-cyan)]"
                    }`}
                  >
                    {c === "todas" ? "Todas" : CATEGORIA_LABEL[c]}
                  </button>
                ))}
              </div>
            </div>

            {cajeros.length > 0 && (
              <div>
                <div className="text-xs text-[var(--text-muted)] uppercase tracking-wide mb-2">Cajero</div>
                <select
                  value={cajeroFilter}
                  onChange={(e) => setCajeroFilter(e.target.value)}
                  className="cyber-input text-sm"
                >
                  <option value="todos">Todos</option>
                  {cajeros.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </Panel>

      {loading ? (
        <div className="data-card text-center py-12">
          <div className="text-[var(--text-secondary)] text-lg font-mono">Cargando movimientos…</div>
        </div>
      ) : (
        <>
          {/* Resumen */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <MetricCard
              accent="cost"
              label="Total salidas"
              value={money(resumen.totalSalidasUyu)}
              sub={resumen.totalSalidasBrl > 0 ? `+ R$${resumen.totalSalidasBrl.toFixed(2)}` : undefined}
            />
            <MetricCard
              accent="cyan"
              label="Total entradas"
              value={money(resumen.totalEntradasUyu)}
              sub={resumen.totalEntradasBrl > 0 ? `+ R$${resumen.totalEntradasBrl.toFixed(2)}` : undefined}
            />
            <MetricCard
              accent="magenta"
              hero
              label="Neto del período"
              value={money(resumen.netoUyu)}
              sub={resumen.netoBrl !== 0 ? `R$${resumen.netoBrl.toFixed(2)}` : "Entradas − salidas"}
              valueColor={resumen.netoUyu >= 0 ? "var(--success)" : "var(--error)"}
            />
            <MetricCard
              accent="cost"
              label={categoriaFilter === "todas" ? "Salidas / Ingresos del período" : `${CATEGORIA_LABEL[categoriaFilter]} / Ingresos del período`}
              value={resumen.ratioValido ? `${resumen.ratioGasto.toFixed(1)}%` : "N/A"}
              sub={
                cajeroFilter !== "todos"
                  ? "No aplica filtrado por cajero — los ingresos no se separan por cajero"
                  : ingresosPeriodo > 0
                  ? `Ingresos: ${money(ingresosPeriodo)}`
                  : "Sin ventas en el período"
              }
              valueColor={!resumen.ratioValido ? "var(--slate-gray)" : resumen.ratioGasto > 15 ? "var(--error)" : resumen.ratioGasto > 8 ? "var(--warning)" : "var(--success)"}
            />
          </div>

          <p className="text-xs text-[var(--text-muted)] -mt-3">
            Esta página filtra por fecha calendario (no por turno de caja como el Dashboard) — los totales de "mismo
            período" pueden diferir levemente entre las dos pantallas porque un turno nocturno cruza la medianoche.
          </p>

          <CategoriaBreakdown salidasPorCategoria={resumen.salidasPorCategoria} totalSalidasBrl={resumen.totalSalidasBrl} />

          <PromedioMensualPanel promedios={promedios} />

          {/* Tabla histórica */}
          <Panel title="Detalle de movimientos" accent="cyan" right={`${movimientosFiltrados.length} movimientos`}>
            {movimientosFiltrados.length === 0 ? (
              <EmptyState>Sin movimientos en este período con estos filtros</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-[var(--slate-gray)]">
                    <tr>
                      <th className={`${TH} text-left`}>Fecha</th>
                      <th className={`${TH} text-left`}>Turno (cajero)</th>
                      <th className={`${TH} text-left`}>Tipo</th>
                      <th className={`${TH} text-left`}>Categoría</th>
                      <th className={`${TH} text-left`}>Motivo</th>
                      <th className={`${TH} text-right`}>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimientosFiltrados.map((m) => (
                      <tr key={m.id} className={TROW}>
                        <td className="p-3 text-[var(--text-secondary)] font-mono text-xs">
                          {new Date(m.created_at).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="p-3 text-[var(--text-primary)]">{m.cajero}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase border ${
                            m.tipo === "entrada"
                              ? "border-[var(--success)] text-[var(--success)]"
                              : "border-[var(--warning)] text-[var(--warning)]"
                          }`}>
                            {m.tipo}
                          </span>
                        </td>
                        <td className="p-3 text-[var(--text-secondary)]">
                          {m.categoria ? CATEGORIA_LABEL[m.categoria] : "—"}
                        </td>
                        <td className="p-3 text-[var(--text-secondary)] max-w-xs truncate">{m.motivo}</td>
                        <td className={`p-3 text-right font-mono tabular-nums font-bold ${
                          m.tipo === "entrada" ? "text-[var(--success)]" : "text-[var(--warning)]"
                        }`}>
                          {m.tipo === "entrada" ? "+" : "−"} {m.moneda === "BRL" ? `R$${Number(m.monto).toFixed(2)}` : money(Number(m.monto))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
