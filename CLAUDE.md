# Proyecto: Kiosco Manager / "24 SIETE"

POS web para un kiosco nocturno real en la frontera Rivera (UY) / Sant'Ana (BR).
Se cobra en pesos uruguayos (UYU) y reales brasileños (BRL).

## Prioridades del negocio (en orden)
1. Rápido — hora pico, muchas personas pidiendo a la vez
2. Sin errores de plata — la caja tiene que cuadrar
3. Simple — varios cajeros distintos, sin entrenamiento

## Stack
- Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4
- Supabase (PostgreSQL), operaciones críticas vía funciones SQL atómicas
- Auth: login simple (usuario/clave por env) + JWT en cookie + middleware

## Documentos brújula (LEER al inicio de cada sesión)
- docs/00-CONTEXTO.md — el norte del proyecto
- docs/01-AUDITORIA.md — bugs y mejoras con IDs estables (B#/M#)
- docs/02-ROADMAP.md — plan por fases, estado actual

## Cómo trabajamos
- Una tarea a la vez: se hace → se prueba en browser → se commitea
- Mostrar diff y esperar confirmación antes de aplicar cambios
- Mostrar SQL exacto antes de ejecutar en Supabase
- Probar en browser antes de cada commit, no solo "compila"
- Nunca arrancar un paso nuevo con trabajo sin commitear
- Bugs nuevos se documentan en 01-AUDITORIA.md con ID antes de arreglarlos

## Archivos clave
- app/ventas/nueva/page.tsx — POS (pantalla de venta)
- app/caja/page.tsx — apertura/cierre de turno + historial
- lib/services/sales.ts — lógica de ventas
- lib/services/cashSessions.ts — sesiones de caja
- lib/services/reports.ts — reportes
- lib/sql/00-schema-completo.sql — fuente de verdad del schema

## No tocar sin razón
- El insert de combos en sale_combos (B2, resuelto con cuidado)
- sale_items NO tiene FK a products (intencional, por los combos)

## Tarea actual
Fix del cuadre cross-moneda (B23, B24, B25) — modelo de "dos cajones, movimiento
neto" aprobado, con 3 decisiones: vuelto mixto prohibido en v1, columnas generadas
en la DB, invariante de consistencia como aviso visible en el cierre. Wireframe del
nuevo modal de cobro aprobado (botón "PAGO JUSTO $" dominante, un toque).

Orden de implementación (un paso a la vez, verificar + commit entre cada uno):
1. Schema — 3 columnas nuevas en `sales`: `tasa_cambio`, `mov_efectivo_uyu`
   (generada), `mov_efectivo_brl` (generada). ← próximo paso
2. RPC `create_sale_atomic` (recibe `tasa_cambio`, exige `pagado/vuelto` no-null en efectivo)
3. Cierre — `close_cash_session` + `getSessionTotals` suman los `mov_*` + invariante
4. POS — flujo del modal de cobro nuevo

Decidido: "PAGO JUSTO $" cobra en un solo toque (registra y cierra, sin micro-confirm).
