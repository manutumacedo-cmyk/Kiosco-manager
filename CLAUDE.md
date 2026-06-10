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

✅ B18 — resuelto: idempotencia en `createSale` con `client_request_id` (UUID por intento de
cobro, rota por carrito). `create_sale_atomic` dedupea + unique index parcial + guard
`unique_violation`; combos idempotentes (upsert). Verificado en browser (Network=Offline).

⏳ Críticos (🔴) que quedan sin resolver:
- **B26** — anular una venta tras el cierre desincroniza el snapshot del turno
  (`cancel_sale` no chequea turno cerrado).

Otros pendientes no-críticos: B19, B21, B22, B27, B30 (🟠/🟡) y B31 (carpeta `web/` duplicada).

## gstack
Comandos namespaceados con prefijo `gstack-` (instalado con `./setup --prefix`).
Use /gstack-browse for all web browsing. Never use mcp__claude-in-chrome__* tools.
Available skills: /gstack-office-hours, /gstack-plan-ceo-review, /gstack-plan-eng-review,
/gstack-plan-design-review, /gstack-design-consultation, /gstack-design-shotgun,
/gstack-design-html, /gstack-review, /gstack-ship, /gstack-land-and-deploy, /gstack-canary,
/gstack-benchmark, /gstack-browse, /gstack-open-gstack-browser, /gstack-qa, /gstack-qa-only,
/gstack-design-review, /gstack-setup-browser-cookies, /gstack-setup-deploy, /gstack-setup-gbrain,
/gstack-sync-gbrain, /gstack-retro, /gstack-investigate, /gstack-document-release,
/gstack-document-generate, /gstack-codex, /gstack-cso, /gstack-autoplan, /gstack-pair-agent,
/gstack-careful, /gstack-freeze, /gstack-guard, /gstack-unfreeze, /gstack-upgrade, /gstack-learn.

## Skill routing
Al EMPEZAR cada tarea, evaluá si encaja una skill de gstack y proponéla (o usala) antes
de arrancar a codear. No reimplementes a mano lo que una skill ya hace. Guía rápida:

- **Planear una feature / decidir alcance** → /gstack-office-hours (interroga supuestos antes
  de codear). Para revisar un plan ya armado: /gstack-plan-ceo-review (¿vale la pena?),
  /gstack-plan-eng-review (¿cómo construirlo?), /gstack-plan-design-review (UX/visual).
- **Debuggear un bug con causa no obvia** (ej. B18 idempotencia, B26 snapshot de turno)
  → /gstack-investigate (root cause sistemático, auto-freezea el módulo).
- **Antes de commitear / cerrar una tarea** → /gstack-review (revisión del diff).
- **Probar la UI en browser de verdad** (POS, caja, reportes) → /gstack-qa (prueba y arregla)
  o /gstack-qa-only (solo reporta). Navegación web puntual → /gstack-browse.
- **Trabajo visual / UI** (headers, layout del POS, neon styling) → /gstack-design-review
  (encuentra inconsistencias y AI slop); explorar variantes → /gstack-design-shotgun.
- **Comandos destructivos** (DROP TABLE, rm -rf, reset --hard sobre SQL/caja) → /gstack-careful
  o /gstack-guard. Para acotar edits a un módulo mientras debuggeo → /gstack-freeze.
- **Cerrar y desplegar** → /gstack-ship (tests + diff + CHANGELOG + PR), luego /gstack-canary.
- **Seguridad** (auth, JWT, env, manejo de plata) → /gstack-cso.

Regla del proyecto: una tarea a la vez, probar en browser antes de commitear. Las skills
/gstack-qa y /gstack-review encajan con eso — usalas en vez de saltar el paso de prueba.
