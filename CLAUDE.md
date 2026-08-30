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
**Estado al 2026-08-30.** La app está en producción (Vercel, sale de `main`) y el kiosco
opera con ella todas las noches. Lo grande de la pasada de endurecimiento está cerrado.

✅ Cerrado y en producción:
- **Cuadre cross-moneda completo** (B23-B25, B29, B28, B40-B44, B46). El arqueo guarda
  `efectivo_contado_uyu/brl` y `diferencia_*`; PIX se registra como digital en BRL.
- **B18** — idempotencia en `createSale`; **B26/B27** — frontera de turno cerrada.
- **B49** — visibilidad por rol en `/caja`: el cajero abre tipeando solo el fondo, opera su
  turno y cierra con **conteo a ciegas** (sin esperado, sin diferencia, sin historial, nota
  opcional que nunca traba). El admin ve todo y la diferencia se sigue grabando (B28 intacto).
  OJO: el corte es del lado del cliente — el corte duro espera a B47 + B36/B5.
- **B50** — diferencias entre cajas: vista `diferencias_entre_turnos` (LAG por `apertura_at`)
  + panel solo-admin en `/caja`. Derivada a propósito: persistir el retiro como `cash_outflow`
  rompía el arqueo (`diferencia_*` son GENERATED sobre `total_salidas_*`). Medido al aplicar:
  $605.595 y R$7.892 retirados sin rastro en 79 turnos.
- **M11** — última conexión por usuario + aviso de login fuera de horario (18:30–03:30,
  hora de Rivera, `lib/horarioKiosco.ts` — usar ese helper para toda comparación horaria).

- **M12** — asistencia del personal en `/perfil`: llegada **obligatoria** al iniciar sesión
  (cookie + gate en middleware), salida opcional con panel de tres opciones al desloguear, y
  aviso con hora exacta de cada llegada y salida en el centro de notificaciones. Incluye
  `feat/asistencia` (PR #9) mergeado dentro. **Rama `feat/perfil-asistencia`, PR #10 abierto.**
  Su migración ya está aplicada: la de PR #9 nunca se había corrido y la tabla no existía.

⏳ Pendientes que importan, en orden:
- **B36/B5 + B47** 🔴 — RLS abierta (`USING (true)`) y anon key pública: todo el corte de
  visibilidad es best-effort hasta cerrar esto.
- **B51** 🟠 — `users_username_key` es `UNIQUE(username)` con soft delete: 7 nombres quemados
  (incluye `Test_Caja` y `Santiago`, un cajero real). Fix: índice único parcial
  `WHERE deleted_at IS NULL`. **B52** 🟡 — login case-sensitive.
- **B20** 🟡 parcial — falta que un faltante de stock de un ítem no aborte el carrito entero.
- **B45** 🟡 — nadie declara fondo BRL ni registra movimientos en reales (descubribilidad).
- Decisión de producto pendiente: el panel del **turno abierto** todavía muestra al cajero
  efectivo/fondo/entradas/salidas — puede anotarlos antes de cerrar y burlar el conteo a
  ciegas. Propuesta: dejarle solo `Ventas realizadas` y `Total ventas`.
- Limpieza menor: B19, B21, B22, B30, B31 (carpeta `web/` duplicada). Los datos de QA ya
  se limpiaron (usuarios temporales, avisos de prueba y el turno de caja que había quedado
  abierto y bloqueaba la apertura).

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

## Subagentes — routing de modelos

Cuando una tarea la puede hacer un agente en paralelo o de forma independiente, creá un
subagente con el modelo que corresponda. No delegues si ya tenés el contexto para resolverlo
en 1-2 tool calls; el agente vale cuando hay trabajo genuinamente separable o costoso para
el contexto principal.

| Modelo | Cuándo usarlo |
|--------|---------------|
| **haiku** | Búsquedas rápidas, lecturas de archivos sueltos, greps, preguntas de contexto corto, tareas con respuesta < 200 palabras, QA puntual de un componente. |
| **sonnet** | Implementar una feature siguiendo un plan ya definido, refactors, escribir SQL, resolver un bug con causa conocida, cualquier tarea de código con más de 2-3 archivos. |
| **opus** | Planear arquitectura, decidir alcance de una feature con trade-offs, análisis de seguridad o dinero, revisar un plan complejo, tareas donde la respuesta incorrecta tiene alto costo. |

Reglas:
- Si el usuario no especifica modelo, aplicá la tabla de arriba.
- Tarea de plomería (leer + buscar + reportar) → haiku.
- Tarea de construcción (editar + implementar + probar) → sonnet.
- Tarea de diseño de solución o decisión con consecuencias → opus.
- Si no estás seguro, sonnet es el default seguro.

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
