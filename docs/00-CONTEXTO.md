# 00 · CONTEXTO DEL PROYECTO (Norte)

> Este documento es la **brújula**. Antes de codear cualquier cosa, releé esto.
> Si una decisión técnica no ayuda a este contexto real, no va.

## Qué estamos haciendo

Adaptar el sistema **"24 SIETE" (Kiosco Manager)** para implementarlo en un
**kiosco nocturno real de un amigo**, en la frontera **Rivera (UY) / Sant'Ana (BR)**.
Hoy es un prototipo funcional; el objetivo es que aguante **uso real en horario pico**.

## Prioridades del negocio (en orden)

1. **Rápido** — en hora pico hay muchas personas pidiendo a la vez. Cada segundo cuenta.
2. **Efectivo / sin errores de plata** — la caja tiene que cuadrar. Cobrar mal = perder dinero o clientes.
3. **Simple de manejar** — varias personas distintas lo van a usar de noche; tiene que ser
   tan obvio que no requiera entrenamiento.

## Realidad de la implementación (respuestas del dueño)

| Tema | Decisión real | Implicancia técnica |
|---|---|---|
| **Dispositivo** | PC / Notebook con **teclado** | Optimizar para teclado: **atajos** + **búsqueda tecleando** + posible **lector de código de barras USB** (se comporta como teclado). |
| **Internet** | WiFi estable **casi siempre**, pero hay que **prevenir cortes** | Funcionar online normalmente, pero tener **red de seguridad offline** para no perder ventas si se cae. |
| **Jornada / reportes** | **Turno con cierre de caja manual** | La caja se **abre y cierra a mano**. Una venta pertenece al **turno abierto**, NO al día calendario. Un turno puede cruzar la medianoche. |
| **Cajeros** | **1 dispositivo, varias personas por turnos** | Saber **quién** cobró en cada turno. Apertura/cierre de caja por persona. |

## Moneda

- Se cobra en **UYU (pesos uruguayos)** y **BRL (reales)**.
- El POS ya tiene calculadora de cambio BRL→UYU, pero **no se guarda bien** qué moneda
  ni cuánto pagó el cliente (ver auditoría B3). Esto hay que arreglarlo para que la caja cuadre.

## Lo que NO queremos

- Complejidad que el cajero no entienda.
- Pantallas con muchos pasos para cobrar algo simple.
- Depender 100% de internet sin plan B.
- Features "lindas" (insights, animaciones) que ralenticen el cobro.

## Decisiones de diseño ya tomadas

- **Stock de insumos líquidos es manual, no automático.** El sistema **no** intenta trackear
  fracciones de botella (ml por trago, etc.). El control de insumos líquidos lo lleva el dueño a mano.
- **La UI del POS usa grid de botones grandes por categoría**, no la búsqueda como flujo principal.
  El cajero toca un botón de producto; la búsqueda es un atajo secundario, no el camino central.

## Stack técnico (para no desviarnos)

- **Frontend:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4.
- **Backend / DB:** Supabase (PostgreSQL). Operaciones críticas vía **funciones SQL atómicas**.
- **Auth:** login simple (usuario/clave por env) + JWT en cookie httpOnly + middleware.

## Cómo trabajamos

1. Seguimos el **`02-ROADMAP.md`** fase por fase, sin saltar.
2. Cada cambio se valida contra las 3 prioridades de arriba.
3. Los problemas conocidos están en **`01-AUDITORIA.md`** con su severidad.
4. No tocar dos cosas a la vez: un paso, se prueba, se sigue.
