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
Pasada de endurecimiento pre-producción (bugs B18–B31). **Hoy arranca la prueba en local.**

✅ Cerrado: cuadre cross-moneda (B23, B24, B25), tasa por venta (B29) y arqueo de
efectivo contado al cierre (B28, pasos 1-4). El arqueo guarda `efectivo_contado_uyu/brl`
y `diferencia_*`, muestra diferencia en vivo, exige nota si hay descuadre, y el historial
indica Sobró/Faltó/✓ cuadró.

🟡 B20 — parcial: mensaje resuelto (el error de stock muestra el nombre del producto),
falta la segunda mitad (que un faltante de un solo ítem no aborte el carrito entero).

⏳ Críticos (🔴) que quedan sin resolver:
- **B18** — venta duplicada al reintentar tras corte de red (falta idempotencia en `createSale`).
- **B26** — anular una venta tras el cierre desincroniza el snapshot del turno
  (`cancel_sale` no chequea turno cerrado).

Otros pendientes no-críticos: B19, B21, B22, B27, B30 (🟠/🟡) y B31 (carpeta `web/` duplicada).
