"use client";

import { useEffect, useState } from "react";
import { getOpenSession } from "@/lib/services/cashSessions";

// Estado de caja en vivo dentro del hero VENDER del home.
// No depende solo del color (texto + punto + forma): abierto = verde, cerrado = ámbar,
// como pide PRODUCT.md (daltonismo). Skeleton mientras carga, no spinner.

type Estado = "cargando" | "abierta" | "cerrada" | "error";

export default function CajaStatusLine() {
  const [estado, setEstado] = useState<Estado>("cargando");

  useEffect(() => {
    let vivo = true;
    getOpenSession()
      .then((s) => {
        if (!vivo) return;
        setEstado(s ? "abierta" : "cerrada");
      })
      .catch(() => {
        if (vivo) setEstado("error");
      });
    return () => {
      vivo = false;
    };
  }, []);

  if (estado === "cargando") {
    return (
      <span
        className="inline-block h-4 w-40 rounded bg-[var(--slate-gray)]/60 animate-pulse"
        aria-hidden
      />
    );
  }

  if (estado === "abierta") {
    return (
      <span className="inline-flex items-center gap-2 text-sm font-mono text-[var(--success)]">
        <span className="h-2 w-2 rounded-full bg-[var(--success)] shadow-[0_0_6px_var(--success)]" />
        Caja abierta · listo para vender
      </span>
    );
  }

  // cerrada o error: ambos llevan a la caja. El error no debe trabar el flujo de venta.
  return (
    <span className="inline-flex items-center gap-2 text-sm font-mono text-[var(--warning)]">
      <span className="h-2 w-2 rounded-full bg-[var(--warning)] shadow-[0_0_6px_var(--warning)]" />
      {estado === "error" ? "No se pudo leer la caja" : "Caja cerrada · abrí turno primero"}
    </span>
  );
}
