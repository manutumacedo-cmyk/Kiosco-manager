# Índice de documentación — Kiosco Manager / "24 SIETE"

> Punto base: catálogo de todos los `.md` del repo a esta fecha (2026-06-19), para saber
> cuál leer según lo que necesites y cuáles están desactualizados. No reemplaza a ningún
> doc — solo orienta.

## Brújula del proyecto (leer primero, en este orden)

| Doc | Qué es |
|---|---|
| [`00-CONTEXTO.md`](./00-CONTEXTO.md) | El norte del proyecto: para qué existe, prioridades de negocio, qué NO hacer. |
| [`01-AUDITORIA.md`](./01-AUDITORIA.md) | Foto de bugs/mejoras reales del código, con IDs estables (B#/M#) y severidad. |
| [`02-ROADMAP.md`](./02-ROADMAP.md) | Plan por fases, qué está hecho y qué sigue. |
| [`HANDOFF.md`](./HANDOFF.md) | Resumen de "dónde estamos ahora" para retomar en un chat nuevo. **El más al día.** |

## Planes y mockups puntuales

| Doc | Qué es |
|---|---|
| [`03-PLAN-TICKETS.md`](./03-PLAN-TICKETS.md) | Plan para impresión de tickets / confirmación de compra (en paralelo, toca B5). |
| [`TICKET-MOCKUP.md`](./TICKET-MOCKUP.md) | Dos mockups visuales del ticket de compra. |

## Guías de feature en la raíz del repo

| Doc | Qué es | Estado |
|---|---|---|
| [`PRODUCT.md`](../PRODUCT.md) | Brief de producto/diseño: usuarios, propósito, personalidad de marca, anti-referencias, principios de diseño, accesibilidad. | ✅ Vigente — es la base de criterio visual/UX. |
| [`CLAUDE.md`](../CLAUDE.md) | Instrucciones de proyecto para Claude Code (stack, prioridades, cómo trabajamos, routing de subagentes y skills). | ✅ Vigente, se actualiza seguido. |
| [`AGENTS.md`](../AGENTS.md) | Mismo contenido base que `CLAUDE.md` (convención para otros agentes/herramientas que leen `AGENTS.md` en vez de `CLAUDE.md`). | ⚠️ Duplicado intencional — si editás uno, replicá en el otro. |
| [`AUTH_SETUP.md`](../AUTH_SETUP.md) | Cómo funciona el login: JWT en cookie, middleware, variables de entorno. | ✅ Parece vigente (el sistema descrito coincide con el actual). |
| [`RESKIN_GUIDE.md`](../RESKIN_GUIDE.md) | Guía del sistema de diseño "cyberpunk/neón" — archivos centralizados de estilo. | 🟡 Verificar contra el código actual antes de confiar en el detalle. |
| [`BORDER_POS_GUIDE.md`](../BORDER_POS_GUIDE.md) | Spec original del POS multi-moneda (UYU/BRL), combos, adicionales en bebidas. | 🟡 Histórico — partes ya resueltas (B23-B25, B29) están mejor documentadas en `01-AUDITORIA.md`/`HANDOFF.md`. |
| [`STRATEGIC_INSIGHTS_GUIDE.md`](../STRATEGIC_INSIGHTS_GUIDE.md) | Motor de insights estratégicos post-venta (`lib/services/strategicInsights.ts`). | 🔴 **Desactualizado** — `lib/services/strategicInsights.ts` y `cashRegister.ts` están borrados en el working tree actual (`git status` los marca `D`). Confirmar si la feature se descontinuó antes de seguir usando esta guía. |
| [`README.md`](../README.md) | README genérico de instalación (clone, npm install, env, migraciones SQL). | 🔴 **Desactualizado** — dice `cd Kiosco-manager/web`, pero la app real vive en la raíz (`app/`, `lib/`, etc.). La carpeta `web/` es la duplicada que B31 marca para borrar. |
| [`web/README.md`](../web/README.md) | README default de `create-next-app` dentro de la carpeta duplicada. | 🔴 Vive en `web/`, la carpeta a borrar (B31). Se va junto con esa carpeta. |

## Cómo usar este índice
- Para arrancar una sesión nueva: `00-CONTEXTO.md` → `01-AUDITORIA.md` → `HANDOFF.md`.
- Para criterio de diseño/UX: `PRODUCT.md`.
- Antes de confiar en una guía marcada 🟡 o 🔴: verificar contra el código real, no asumir.
