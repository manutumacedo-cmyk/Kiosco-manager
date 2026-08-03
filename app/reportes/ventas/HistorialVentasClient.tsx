"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import type { SaleConItems } from "@/lib/services/sales";
import {
  fetchSalesByDateRange,
  fetchSalesBySessionWithItems,
  cancelSale,
} from "@/lib/services/sales";
import { fetchTurnosConStats, etiquetaTurno, type TurnoConStats } from "@/lib/services/turnos";
import TurnoSelector from "./TurnoSelector";
import { useToast } from "@/components/ui/Toast";

type DateFilter = "today" | "week" | "month" | "custom";
/** El turno es el eje por defecto: la jornada cruza la medianoche, así que el
 *  calendario parte los turnos al medio. El rango de fechas queda como secundario,
 *  para mirar un mes entero. */
type Modo = "turno" | "rango";

export default function HistorialVentasClient({ username }: { username: string }) {
  const toast = useToast();

  const [modo, setModo] = useState<Modo>("turno");
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<SaleConItems[]>([]);

  const [turnos, setTurnos] = useState<TurnoConStats[]>([]);
  const [loadingTurnos, setLoadingTurnos] = useState(true);
  const [errorTurnos, setErrorTurnos] = useState<string | null>(null);
  const [turnoSel, setTurnoSel] = useState<string | null>(null);

  const [dateFilter, setDateFilter] = useState<DateFilter>("today");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [expandedSale, setExpandedSale] = useState<string | null>(null);
  const [cancelingSale, setCancelingSale] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState<string | null>(null);

  async function loadTurnos() {
    setLoadingTurnos(true);
    setErrorTurnos(null);
    try {
      const data = await fetchTurnosConStats();
      setTurnos(data);
      // Arranca en el turno más reciente, que es lo que uno quiere mirar.
      setTurnoSel((actual) => actual ?? data[0]?.session.id ?? null);
    } catch (err) {
      // Se guarda el error además del toast: si no, un fallo de carga se ve igual
      // que "no hay turnos", que es justo lo que pasó la primera vez.
      const msg = err instanceof Error ? err.message : "Error al cargar turnos";
      setErrorTurnos(msg);
      toast.error(msg);
    } finally {
      setLoadingTurnos(false);
    }
  }

  async function loadSales() {
    if (modo === "turno" && !turnoSel) {
      setSales([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      if (modo === "turno") {
        setSales(await fetchSalesBySessionWithItems(turnoSel!));
      } else {
        const { start, end } = getDateRange();
        setSales(await fetchSalesByDateRange(start, end));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cargar ventas");
    } finally {
      setLoading(false);
    }
  }

  function getDateRange(): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);

    switch (dateFilter) {
      case "today":
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case "week":
        start.setDate(now.getDate() - 7);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case "month":
        start.setDate(now.getDate() - 30);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case "custom":
        if (customStartDate && customEndDate) {
          const customStart = new Date(customStartDate);
          const customEnd = new Date(customEndDate);
          customStart.setHours(0, 0, 0, 0);
          customEnd.setHours(23, 59, 59, 999);
          return { start: customStart, end: customEnd };
        }
        // Si no hay fechas custom, default a hoy
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
    }

    return { start, end };
  }

  useEffect(() => {
    loadTurnos();
  }, []);

  useEffect(() => {
    loadSales();
  }, [modo, turnoSel, dateFilter, customStartDate, customEndDate]);

  async function handleCancelSale(saleId: string) {
    setCancelingSale(saleId);
    try {
      const res = await cancelSale(saleId, username);
      toast.success(
        res.ajuste_post_cierre
          ? "✅ Venta anulada. El turno ya estaba cerrado: se registró como ajuste posterior."
          : "✅ Venta anulada y stock restaurado"
      );
      setShowCancelModal(null);
      // Los totales del turno cambian con la anulación, así que se recargan los dos.
      loadSales();
      loadTurnos();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al anular venta");
    } finally {
      setCancelingSale(null);
    }
  }

  const ventasActivas = sales.filter(s => s.estado === "activa");
  const ventasAnuladas = sales.filter(s => s.estado === "anulada");
  const totalIngresos = ventasActivas.reduce((acc, s) => acc + Number(s.total), 0);
  const turnoActual = turnos.find((t) => t.session.id === turnoSel);

  return (
    <div className="min-h-full bg-[var(--deep-dark)] p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Image src="/logo.png" alt="24 SIETE" width={40} height={40} className="cursor-pointer" />
          </Link>
          <h1 className="text-3xl font-bold neon-text-cyan">HISTORIAL DE VENTAS</h1>
          <div className="text-2xl">📋</div>
        </div>
        <button
          onClick={() => { loadSales(); loadTurnos(); }}
          className="cyber-button"
          disabled={loading}
        >
          {loading ? "Cargando..." : "Refrescar"}
        </button>
      </div>

      {/* Eje del historial: turno (default) o rango de fechas */}
      <div className="flex gap-2">
        {([
          { id: "turno" as Modo, label: "Por turno", icon: "🌙" },
          { id: "rango" as Modo, label: "Por fechas", icon: "📅" },
        ]).map((m) => (
          <button
            key={m.id}
            onClick={() => setModo(m.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm uppercase tracking-wide transition-all ${
              modo === m.id
                ? "neon-outline-cyan bg-[var(--cyan-glow)] text-[var(--neon-cyan)]"
                : "border border-[var(--slate-gray)] text-[var(--text-secondary)] hover:border-[var(--neon-cyan)]"
            }`}
          >
            <span>{m.icon}</span>
            <span>{m.label}</span>
          </button>
        ))}
      </div>

      {modo === "turno" ? (
        <>
          <div className="text-xs text-[var(--text-muted)]">
            La jornada cruza la medianoche, así que cada turno se nombra por el día en
            que <strong>abrió</strong>. Elegí uno para ver sus ventas.
          </div>
          {errorTurnos ? (
            <div className="data-card neon-outline-red">
              <div className="text-[var(--error)] font-bold">No se pudieron cargar los turnos</div>
              <div className="text-xs text-[var(--text-secondary)] mt-1 font-mono">{errorTurnos}</div>
              <button onClick={loadTurnos} className="cyber-button mt-4">Reintentar</button>
            </div>
          ) : (
            <TurnoSelector
              turnos={turnos}
              seleccionado={turnoSel}
              onSelect={setTurnoSel}
              loading={loadingTurnos}
            />
          )}
        </>
      ) : (
      <div className="data-card neon-outline-cyan">
        <div className="text-[var(--text-secondary)] text-sm uppercase tracking-wide mb-4">
          Filtrar por período
        </div>
        <div className="flex gap-3 flex-wrap mb-4">
          {[
            { id: "today" as DateFilter, label: "Hoy", icon: "☀️" },
            { id: "week" as DateFilter, label: "Última semana", icon: "📅" },
            { id: "month" as DateFilter, label: "Último mes", icon: "📆" },
            { id: "custom" as DateFilter, label: "Personalizado", icon: "🎯" },
          ].map(filter => (
            <button
              key={filter.id}
              onClick={() => setDateFilter(filter.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm uppercase tracking-wide transition-all ${
                dateFilter === filter.id
                  ? "neon-outline-magenta bg-[var(--magenta-glow)] text-[var(--neon-magenta)]"
                  : "border border-[var(--slate-gray)] text-[var(--text-secondary)] hover:border-[var(--neon-cyan)]"
              }`}
            >
              <span>{filter.icon}</span>
              <span>{filter.label}</span>
            </button>
          ))}
        </div>

        {/* Custom date inputs */}
        {dateFilter === "custom" && (
          <div className="flex gap-4 items-center">
            <div className="flex-1">
              <label className="text-xs text-[var(--text-muted)] block mb-2">Desde</label>
              <input
                type="date"
                className="cyber-input w-full"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-[var(--text-muted)] block mb-2">Hasta</label>
              <input
                type="date"
                className="cyber-input w-full"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>
      )}

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="data-card neon-outline-cyan">
          <div className="text-[var(--text-muted)] text-xs uppercase">Ventas activas</div>
          <div className="text-3xl font-bold mt-2 neon-text-cyan">{ventasActivas.length}</div>
        </div>
        <div className="data-card neon-outline-cyan">
          <div className="text-[var(--text-muted)] text-xs uppercase">Ingresos</div>
          <div className="text-3xl font-bold mt-2 neon-text-cyan">${totalIngresos.toLocaleString("es-UY", { maximumFractionDigits: 0 })}</div>
        </div>
        {/* La ganancia solo tiene sentido por turno: descuenta las salidas de caja,
            que se registran contra un turno, no contra un rango de fechas. */}
        {modo === "turno" && turnoActual ? (
          <div className="data-card neon-outline-cyan">
            <div className="text-[var(--text-muted)] text-xs uppercase">Ganancia del turno</div>
            <div
              className={`text-3xl font-bold mt-2 ${
                turnoActual.ganancia >= 0 ? "text-[var(--success)]" : "text-[var(--error)]"
              }`}
            >
              ${turnoActual.ganancia.toLocaleString("es-UY", { maximumFractionDigits: 0 })}
            </div>
            <div className="text-[10px] text-[var(--text-muted)] mt-1">
              costo ${turnoActual.costoMercaderia.toLocaleString("es-UY", { maximumFractionDigits: 0 })}
              {turnoActual.salidasUyu > 0 && (
                <> · salidas ${turnoActual.salidasUyu.toLocaleString("es-UY", { maximumFractionDigits: 0 })}</>
              )}
            </div>
            {turnoActual.coberturaCosto < 0.9 && (
              <div className="text-[10px] text-[var(--warning)] mt-1.5 leading-snug">
                ⚠ Estimada: $
                {turnoActual.facturadoSinCosto.toLocaleString("es-UY", { maximumFractionDigits: 0 })} de
                lo facturado es de productos sin costo cargado. La ganancia real es menor.
              </div>
            )}
          </div>
        ) : (
          <div className="data-card">
            <div className="text-[var(--text-muted)] text-xs uppercase">Ganancia</div>
            <div className="text-sm text-[var(--text-muted)] mt-3">
              Se calcula por turno — cambiá a “Por turno” para verla.
            </div>
          </div>
        )}
        <div className="data-card neon-outline-red">
          <div className="text-[var(--text-muted)] text-xs uppercase">Ventas anuladas</div>
          <div className="text-3xl font-bold mt-2 text-[var(--error)]">{ventasAnuladas.length}</div>
        </div>
      </div>

      {/* Contexto del turno elegido */}
      {modo === "turno" && turnoActual && (
        <div className="data-card border-l-2 border-[var(--neon-magenta)]">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-bold text-[var(--neon-magenta)]">
              {etiquetaTurno(turnoActual.session).dia} {etiquetaTurno(turnoActual.session).fecha}
            </span>
            <span className="font-mono text-sm text-[var(--text-secondary)]">
              {etiquetaTurno(turnoActual.session).rango}
            </span>
            <span className="text-sm text-[var(--text-secondary)]">· {turnoActual.session.cajero}</span>
          </div>
          {turnoActual.session.notas_cierre && (
            <div className="text-xs text-[var(--text-secondary)] mt-2 italic">
              {turnoActual.session.notas_cierre}
            </div>
          )}
        </div>
      )}

      {/* Lista de ventas */}
      {loading ? (
        <div className="data-card text-center py-12">
          <div className="neon-text-cyan text-xl font-mono animate-glow">Cargando ventas...</div>
        </div>
      ) : sales.length === 0 ? (
        <div className="data-card text-center py-12">
          <div className="text-4xl mb-4">📭</div>
          <div className="text-[var(--text-secondary)]">
            {modo === "turno" ? "Este turno no tuvo ventas" : "No hay ventas en este período"}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {sales.map(sale => (
            <div
              key={sale.id}
              className={`data-card transition-all ${
                sale.estado === "anulada"
                  ? "border-[var(--error)] opacity-60"
                  : "neon-outline-cyan hover:neon-outline-magenta"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
                  {/* Fecha y hora */}
                  <div>
                    <div className="text-xs text-[var(--text-muted)] uppercase">Fecha</div>
                    <div className="font-mono text-[var(--neon-cyan)]">
                      {new Date(sale.fecha).toLocaleDateString("es-UY")}
                    </div>
                    <div className="text-xs text-[var(--text-secondary)]">
                      {new Date(sale.fecha).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>

                  {/* Total */}
                  <div>
                    <div className="text-xs text-[var(--text-muted)] uppercase">Total</div>
                    <div className={`text-xl font-bold ${sale.estado === "anulada" ? "line-through text-[var(--error)]" : "neon-text-cyan"}`}>
                      ${Number(sale.total).toLocaleString("es-UY", { maximumFractionDigits: 0 })}
                    </div>
                    <div className="text-xs text-[var(--text-secondary)]">{sale.moneda}</div>
                  </div>

                  {/* Método de pago */}
                  <div>
                    <div className="text-xs text-[var(--text-muted)] uppercase">Método</div>
                    <div className="text-[var(--text-primary)] capitalize">{sale.metodo_pago}</div>
                  </div>

                  {/* Estado */}
                  <div>
                    <div className="text-xs text-[var(--text-muted)] uppercase">Estado</div>
                    <div className={`font-bold uppercase text-sm ${
                      sale.estado === "anulada" ? "text-[var(--error)]" : "text-[var(--success)]"
                    }`}>
                      {sale.estado === "anulada" ? "❌ Anulada" : "✓ Activa"}
                    </div>
                    {sale.estado === "anulada" && sale.anulada_por && (
                      <div className="text-xs text-[var(--text-muted)] mt-0.5">
                        por {sale.anulada_por}
                        {sale.anulada_at && (
                          <> · {new Date(sale.anulada_at).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</>
                        )}
                      </div>
                    )}
                    {/* Se cobró acá pero el carrito venía de un turno ya cerrado (B27) */}
                    {sale.session_id_original && (
                      <div className="text-[10px] text-[var(--warning)] mt-0.5" title="El turno se cerró mientras el carrito estaba abierto, así que la venta entró en el turno vigente">
                        ↪ reasignada de un turno anterior
                      </div>
                    )}
                  </div>

                  {/* Productos (collapsed) */}
                  <div>
                    <button
                      onClick={() => setExpandedSale(expandedSale === sale.id ? null : sale.id)}
                      className="text-xs text-[var(--neon-cyan)] hover:text-[var(--neon-magenta)] transition-colors"
                    >
                      {sale.items?.length || 0} producto(s) {expandedSale === sale.id ? "▲" : "▼"}
                    </button>
                  </div>
                </div>

                {/* Botón anular */}
                {sale.estado === "activa" && (
                  <button
                    onClick={() => setShowCancelModal(sale.id)}
                    className="px-4 py-2 rounded-lg border border-[var(--error)] text-[var(--error)] hover:bg-[var(--error)] hover:bg-opacity-20 transition-all text-sm font-bold"
                  >
                    Anular
                  </button>
                )}
              </div>

              {/* Items expandidos */}
              {expandedSale === sale.id && sale.items && sale.items.length > 0 && (
                <div className="mt-4 pt-4 border-t border-[var(--slate-gray)]">
                  <div className="text-xs text-[var(--text-muted)] uppercase mb-2">Productos vendidos</div>
                  <div className="space-y-2">
                    {sale.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center text-sm">
                        <span className="text-[var(--text-primary)]">{item.nombre}</span>
                        <span className="font-mono text-[var(--text-secondary)]">
                          {item.cantidad}x ${Number(item.precio_unitario).toLocaleString("es-UY", { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                    ))}
                  </div>
                  {sale.nota && (
                    <div className="mt-3 text-xs text-[var(--text-secondary)]">
                      <strong>Nota:</strong> {sale.nota}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal de confirmación de cancelación */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
          <div className="data-card neon-outline-red max-w-md w-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-[var(--error)]">⚠️ Anular Venta</h2>
              <button
                onClick={() => setShowCancelModal(null)}
                className="text-[var(--text-secondary)] hover:text-[var(--neon-cyan)] text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-[var(--text-primary)]">
                ¿Estás seguro de que querés anular esta venta?
              </p>
              <div className="p-4 border border-[var(--warning)] bg-[var(--warning)] bg-opacity-10 rounded-lg">
                <div className="text-sm text-[var(--text-secondary)]">
                  <strong className="text-[var(--warning)]">Esta acción:</strong>
                  <ul className="mt-2 space-y-1 list-disc list-inside">
                    <li>Marcará la venta como anulada</li>
                    <li>Devolverá el stock de los productos vendidos</li>
                    <li>No se puede deshacer</li>
                  </ul>
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  onClick={() => setShowCancelModal(null)}
                  className="px-6 py-3 rounded-lg border border-[var(--slate-gray)] text-[var(--text-secondary)] hover:border-[var(--neon-cyan)] transition-all"
                  disabled={cancelingSale === showCancelModal}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleCancelSale(showCancelModal)}
                  className="px-6 py-3 rounded-lg bg-[var(--error)] text-white font-bold hover:bg-opacity-80 transition-all"
                  disabled={cancelingSale === showCancelModal}
                >
                  {cancelingSale === showCancelModal ? "Anulando..." : "✓ Confirmar Anulación"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
