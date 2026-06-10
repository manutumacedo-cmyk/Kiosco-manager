# Handoff — Kiosco Manager / "24 SIETE"

> Contexto para retomar el proyecto en un chat nuevo. Última actualización: 2026-06-10.

## Qué es el proyecto
POS web para un kiosco **nocturno** real en la frontera Rivera (UY) / Sant'Ana (BR).
Se cobra en **dos monedas**: pesos uruguayos (UYU) y reales brasileños (BRL).

Prioridades del negocio, en orden:
1. **Rápido** — hora pico, muchas personas pidiendo a la vez.
2. **Sin errores de plata** — la caja tiene que cuadrar.
3. **Simple** — varios cajeros distintos, sin entrenamiento.

**Stack:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4. Supabase
(PostgreSQL) con operaciones críticas vía funciones SQL atómicas. Auth: login simple
por env + JWT en cookie + middleware.

**Docs brújula (leer al inicio):**
- `docs/00-CONTEXTO.md` — el norte del proyecto.
- `docs/01-AUDITORIA.md` — bugs y mejoras con IDs estables (B#/M#).
- `docs/02-ROADMAP.md` — plan por fases, estado actual.

⚠️ No existe ningún `docs/03-*`.

**Cómo se trabaja:** una tarea a la vez → se prueba en browser → se commitea. Mostrar
diff y esperar confirmación antes de aplicar. Mostrar SQL exacto antes de correrlo en
Supabase. Nunca arrancar un paso nuevo con trabajo sin commitear.

## Dónde estamos
Fases 0–3 del roadmap completas. En curso: **pasada de endurecimiento pre-producción
(bugs B18–B31)**, no es una fase numerada. **El 2026-06-10 arrancó la prueba en local**
(server de dev en http://localhost:3000).

## Qué se cerró recientemente (commiteado y pusheado a `origin/main`)
- **Cuadre cross-moneda (B23, B24, B25):** modelo "dos cajones, movimiento neto".
  `sales` guarda `tasa_cambio` + columnas generadas `mov_efectivo_uyu` / `mov_efectivo_brl`
  (netean el vuelto por cajón). `close_cash_session` y `getSessionTotals` suman esos
  `mov_*`, con invariante de consistencia visible en el cierre. Vuelto mixto prohibido en v1.
- **B29 (tasa por venta):** `sales.tasa_cambio` guardado por venta; la RPC
  `create_sale_atomic` lo recibe y el POS lo envía.
- **B28 (arqueo al cierre, pasos 1-4, 🟠):** `cash_sessions` tiene `efectivo_contado_uyu/brl`
  y `diferencia_*`. El cierre pide contar la caja (pesos, y reales si hubo movimiento BRL),
  muestra diferencia en vivo (✅/🟡/🔴), exige nota si hay descuadre y el historial indica
  Sobró/Faltó/✓ cuadró. **Verificado en browser.**
- **B20 (🟡 PARCIAL):** el error de "stock insuficiente" ahora muestra el **nombre** del
  producto (antes UUID). **Falta la segunda mitad:** que un faltante de un solo ítem no
  aborte el carrito entero (cambio transaccional, aparte).

## Pendientes CRÍTICOS (🔴) sin resolver
- **B18 — venta duplicada al reintentar tras corte de red:** falta idempotencia en
  `createSale`. Si la RPC commitea pero la respuesta se pierde, el cajero reintenta y se
  duplica la venta (doble stock, doble efectivo esperado).
- **B26 — anular tras el cierre desincroniza el snapshot del turno:** `cancel_sale` no
  chequea si la venta pertenece a un turno ya cerrado. El stock vuelve pero el total
  congelado del turno no baja.

**Próxima decisión:** elegir entre atacar B18 o B26 primero.

## Otros pendientes no-críticos
B19, B21, B22, B27, B30 (🟠/🟡) y B31 (carpeta `web/` duplicada, borrar). Warning no
bloqueante: Next 16 marca `middleware` como deprecado (sugiere renombrar a `proxy`).

## Archivos clave
- `app/ventas/nueva/page.tsx` — POS (pantalla de venta).
- `app/caja/page.tsx` — apertura/cierre de turno + historial (acá vive el arqueo B28).
- `lib/services/sales.ts` — lógica de ventas (acá iría la idempotencia de B18).
- `lib/services/cashSessions.ts` — sesiones de caja.
- `lib/services/reports.ts` — reportes.
- `lib/sql/00-schema-completo.sql` — fuente de verdad del schema (acá `cancel_sale`,
  `close_cash_session`, `create_sale_atomic`).

## No tocar sin razón
- El insert de combos en `sale_combos` (B2, resuelto con cuidado).
- `sale_items` NO tiene FK a `products` (intencional, por los combos).

## Estado de git
`main` limpio y sincronizado con `origin/main`. Nota: algunos commits recientes tienen un
`@` colgado al inicio del subject (artefacto de PowerShell here-string) — es cosmético, se
decidió **no** reescribirlos.
