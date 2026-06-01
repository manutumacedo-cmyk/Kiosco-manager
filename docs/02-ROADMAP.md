# 02 · ROADMAP (Paso a paso)

> Plan de trabajo en **fases**. No saltar fases. Cada paso: se hace → se prueba → se marca.
> Referencias: ver problemas en [`01-AUDITORIA.md`](./01-AUDITORIA.md) y el norte en [`00-CONTEXTO.md`](./00-CONTEXTO.md).
>
> Marcado: `[ ]` pendiente · `[~]` en progreso · `[x]` hecho y probado.

---

## FASE 0 · Base sana y puesta en marcha
*Objetivo: poder correr el proyecto, saber que compila, y limpiar la casa antes de tocar nada.*

- [x] **0.1** Eliminar la carpeta duplicada `Kiosco-manager-main/` (B13). ✅ Era una versión MÁS NUEVA
      (combos en reportes); se promovieron 4 archivos al root y se borró la carpeta anidada.
- [x] **0.2** `npm install` y crear `.env.local` con las claves. ✅ `.env.local` creado con Supabase +
      `AUTH_SECRET` generado. ⚠️ `AUTH_USERNAME`/`AUTH_PASSWORD` son temporales: **cambiar antes de implementar**.
- [x] **0.3** `npm run build` sin errores. ✅ Compila (aviso menor: renombrar `middleware`→`proxy`, no urgente).
- [x] **0.4** Base de datos reconstruida desde cero en proyecto nuevo Supabase `kiosco-manager-24siete`
      (id `hxfgvxubffueuovgzljh`, región São Paulo). Esquema completo en [`lib/sql/00-schema-completo.sql`](../lib/sql/00-schema-completo.sql)
      (11 tablas + funciones atómicas + vista + tabla `sale_combos`).
- [x] **0.5** RLS revisado vía advisors. ✅ Estado conocido: políticas públicas (`USING true`) temporales,
      + `security_definer_view` en `combos_with_products` y `search_path` mutable en funciones → todo para Fase 4 (B5).

**Criterio de salida:** ✅ COMPLETADA. Proyecto compila, base nueva creada y operativa.
**Pendiente del usuario:** levantar `npm run dev`, loguearse y **re-cargar los productos** (se perdieron con la base vieja).

---

## FASE 1 · Que la caja cuadre (la plata) 🔴
*Objetivo: que el total cobrado, el detalle y la moneda sean siempre coherentes.*

- [ ] **1.1** Arreglar el extra **Monster** que no se suma al `precio_unitario` guardado (B7).
      → En [`app/ventas/nueva/page.tsx`](../app/ventas/nueva/page.tsx#L257-L265), incluir el extra Monster
      en el precio del ítem, igual que se hace con `shotExtra`. Verificar que `Σ(items) === total`.
- [x] **1.2** Guardar **moneda + monto pagado + vuelto** por venta (B3, M8). ✅
      → Añadir columnas (`moneda`, `pagado`, `vuelto`, o tabla de pagos) y pasarlas por `createSale`
      y `create_sale_atomic`. Que el cobro en BRL se registre como BRL.
- [ ] **1.3** Arreglar la **atribución de combos** en la venta y reportes (B2).
      → Decidir modelo: guardar los ítems del combo con su **precio prorrateado** (no 0) o marcar la
      línea combo de forma que los reportes la entiendan. Que la ganancia limpia salga bien con combos.

**Criterio de salida:** hago 3 ventas de prueba (normal, con Monster, con combo, una en BRL) y
**todo cuadra** en el detalle y en el reporte.

---

<!--
  NOTA DE ORDEN: la Fase 2 (velocidad/UI) va ANTES que la Fase 3 (sesión de caja) a propósito.
  El rediseño de la UI del POS y la sesión de caja tocan el MISMO archivo (`app/ventas/nueva/page.tsx`).
  Si hiciéramos primero la caja y después la UI, habría que retocar ese archivo dos veces. Haciendo
  primero la UI nueva, la sesión de caja se monta una sola vez sobre la pantalla ya rediseñada.
-->

## FASE 2 · Velocidad en hora pico ⚡
*Objetivo: cobrar lo más rápido posible con teclado. Sacar lo que estorba.*

- [ ] **2.1** **Atajos de teclado** en el POS (M1):
      foco automático en búsqueda · `Enter` agrega el primer resultado · teclas para método de pago ·
      atajo para **cobrar** · `Esc` para limpiar. Documentar los atajos en pantalla.
- [ ] **2.2** Soporte de **lector de código de barras** (M2):
      campo `codigo` en `products` · la búsqueda matchea por código exacto y agrega directo al carrito.
- [x] **2.3** **Sacar los insights del camino de venta** (B4/M6): ✅
      que NO corra tras cada venta. Moverlo a cálculo on-demand (al abrir el dashboard) o a una
      vista/consulta SQL agregada. Eliminar el patrón N+1.

**Criterio de salida:** una venta típica (buscar → agregar → cobrar) se hace **sin tocar el mouse**
y sin esperas perceptibles.

---

## FASE 3 · Turno / Sesión de caja 🔴
*Objetivo: operar por turnos reales con apertura/cierre manual, aunque crucen la medianoche.*

- [x] **3.0** **Rediseñar pantalla de ventas**: grid de botones por categoría, panel derecho como
      modal de cobro. (M10) ✅
- [ ] **3.1** Modelo de **sesión de caja**: tabla `cash_sessions` con
      `cajero`, `apertura_at`, `monto_inicial`, `cierre_at`, `estado` (abierta/cerrada).
- [ ] **3.2** Pantalla **Abrir caja** (elegir/escribir cajero + monto inicial) y **Cerrar caja**
      (totales por método y por moneda, diferencia vs efectivo contado).
- [ ] **3.3** Asociar cada **venta a la sesión abierta** y al **cajero** (M4). Añadir `session_id` a `sales`.
- [ ] **3.4** Reescribir reportes y cierre para trabajar **por sesión**, no por día calendario (B1).
      → Reemplaza la lógica de `setHours(0,0,0,0)` de [`cashRegister.ts`](../lib/services/cashRegister.ts).
- [ ] **3.5** Bloquear cobrar si **no hay caja abierta** (guía al cajero a abrirla primero).

**Criterio de salida:** abro caja a las 22:00, vendo, cierro a las 04:00 del día siguiente, y el cierre
muestra **un solo turno** con todos los totales correctos y quién lo atendió.

---

## FASE 4 · Red de seguridad (prevención) 🛡️
*Objetivo: no perder ventas si se cae internet, y cerrar el riesgo de seguridad.*

- [ ] **4.1** Activar **RLS** en Supabase y/o mover operaciones sensibles a rutas server-side (B5/M7).
- [ ] **4.2** Convertir el POS en **PWA** y armar una **cola offline** (B8/M5):
      si no hay conexión, la venta se guarda local (IndexedDB) y se sincroniza al volver el WiFi.
      Indicador visible de estado online/offline y ventas pendientes de sincronizar.
- [ ] **4.3** Manejo de errores claro en el POS (reintento, aviso, nunca "se perdió y no sé").

**Criterio de salida:** desconecto el WiFi, hago una venta, la vuelvo a conectar y la venta aparece
sincronizada sin intervención manual.

---

## FASE 5 · Extras (según necesidad)
*Objetivo: pulir. Solo si las fases anteriores están sólidas.*

- [ ] **5.1** **Impresión de ticket / comanda** (M9).
- [ ] **5.2** Reportes adicionales (productos más vendidos por turno, comparativa de turnos).
- [ ] **5.3** Revisar UX general y textos para que sea entendible por cualquier cajero nuevo.

---

## Reglas del roadmap

1. **Una fase a la vez.** No empezar Fase 2 sin cerrar el criterio de salida de Fase 1.
2. **Probar con datos reales de prueba** después de cada paso, no solo "compila".
3. Si aparece un bug nuevo, anotarlo en [`01-AUDITORIA.md`](./01-AUDITORIA.md) con un ID y severidad.
4. Cada cambio se mide contra las 3 prioridades: **rápido, sin errores de plata, simple**.
