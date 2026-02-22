import { supabase } from "@/lib/supabaseClient";
import type { CierreCaja, Sale } from "@/types";

/**
 * Verifica si ya existe un cierre de caja para el día de hoy
 */
export async function hayCierrePorHoy(): Promise<boolean> {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const manana = new Date(hoy);
  manana.setDate(manana.getDate() + 1);

  const { data, error } = await supabase
    .from("cierres_caja")
    .select("id")
    .gte("fecha_cierre", hoy.toISOString())
    .lt("fecha_cierre", manana.toISOString())
    .limit(1);

  if (error) {
    throw new Error(`Error verificando cierre del día: ${error.message}`);
  }

  return data.length > 0;
}

/**
 * Cierra la caja del día actual
 * - Agrupa ventas de hoy por método de pago
 * - Guarda el cierre en la tabla cierres_caja
 */
export async function closeCashRegister(notas?: string): Promise<CierreCaja> {
  // Verificar si ya hay cierre hoy
  const yaHayCierre = await hayCierrePorHoy();
  if (yaHayCierre) {
    throw new Error("Ya existe un cierre de caja para el día de hoy");
  }

  // Obtener todas las ventas del día (desde las 00:00 hasta ahora)
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const { data: ventas, error: errorVentas } = await supabase
    .from("sales")
    .select("metodo_pago, total, moneda")
    .gte("fecha", hoy.toISOString());

  if (errorVentas) {
    throw new Error(`Error obteniendo ventas del día: ${errorVentas.message}`);
  }

  if (!ventas || ventas.length === 0) {
    throw new Error("No hay ventas registradas hoy para cerrar la caja");
  }

  // Agrupar por método de pago
  let totalEfectivo = 0;
  let totalDebito = 0;
  let totalTransferencia = 0;
  let totalBRL = 0;
  let montoTotal = 0;

  ventas.forEach((venta) => {
    const total = venta.total || 0;

    // Si la venta fue en BRL, la contamos en totalBRL
    if (venta.moneda === "BRL") {
      totalBRL += total;
    } else {
      // Ventas en UYU: agrupar por método de pago
      switch (venta.metodo_pago?.toLowerCase()) {
        case "efectivo":
          totalEfectivo += total;
          break;
        case "debito":
        case "débito":
          totalDebito += total;
          break;
        case "transferencia":
          totalTransferencia += total;
          break;
        default:
          // Si hay métodos no reconocidos, sumarlos a efectivo
          totalEfectivo += total;
      }
      montoTotal += total;
    }
  });

  // Si hay ventas en BRL, también las sumamos al total (ya están convertidas a UYU en la venta)
  // Nota: En el POS, cuando vendes en BRL, el total se guarda ya convertido a UYU
  // Por lo tanto, totalBRL es solo para referencia de cuántos BRL cobraste

  // Crear el cierre
  const { data: cierre, error: errorCierre } = await supabase
    .from("cierres_caja")
    .insert({
      fecha_cierre: new Date().toISOString(),
      total_efectivo: totalEfectivo,
      total_debito: totalDebito,
      total_transferencia: totalTransferencia,
      total_brl: totalBRL,
      cantidad_ventas: ventas.length,
      monto_total: montoTotal,
      notas: notas || null,
    })
    .select()
    .single();

  if (errorCierre) {
    throw new Error(`Error creando cierre de caja: ${errorCierre.message}`);
  }

  return cierre as CierreCaja;
}

/**
 * Obtiene los últimos cierres de caja (máximo 30)
 */
export async function fetchCierresCaja(): Promise<CierreCaja[]> {
  const { data, error } = await supabase
    .from("cierres_caja")
    .select("*")
    .order("fecha_cierre", { ascending: false })
    .limit(30);

  if (error) {
    throw new Error(`Error obteniendo cierres de caja: ${error.message}`);
  }

  return data as CierreCaja[];
}

/**
 * Obtiene el cierre de caja del día actual (si existe)
 */
export async function getCierreHoy(): Promise<CierreCaja | null> {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const manana = new Date(hoy);
  manana.setDate(manana.getDate() + 1);

  const { data, error } = await supabase
    .from("cierres_caja")
    .select("*")
    .gte("fecha_cierre", hoy.toISOString())
    .lt("fecha_cierre", manana.toISOString())
    .order("fecha_cierre", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    // Si no existe, retornar null
    if (error.code === "PGRST116") {
      return null;
    }
    throw new Error(`Error obteniendo cierre de hoy: ${error.message}`);
  }

  return data as CierreCaja;
}
