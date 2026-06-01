# 01 · AUDITORÍA DEL SISTEMA (Estado actual)

> Foto de los problemas detectados leyendo el código real (no el README).
> Severidad: 🔴 Crítico (rompe plata/operación) · 🟠 Importante · 🟡 Menor / mejora.
> Cada item tiene un ID estable (B#=bug, M#=mejora) para referenciarlo en el roadmap.

---

## 🔴 BUGS CRÍTICOS (tocan la plata o la operación nocturna)

### B1 · La caja se cuenta por día calendario, no por turno 🔴
- **Dónde:** [`lib/services/cashRegister.ts`](../lib/services/cashRegister.ts) líneas 9, 39, 137 · [`lib/services/sales.ts`](../lib/services/sales.ts#L118) `fetchTodaySales`.
- **Qué pasa:** Todo usa `setHours(0,0,0,0)` (medianoche). En un kiosco **nocturno**, una sola
  noche de trabajo queda **partida en dos fechas**. El cierre de caja además bloquea un segundo
  cierre "del día" y exige que haya ventas — incompatible con turnos que cruzan medianoche.
- **Impacto:** Los reportes y el cierre **no reflejan el turno real**. La caja no cuadra.
- **Decisión del dueño:** turno con **apertura/cierre manual**. → Se rehace en Fase 3.

### B2 · Los combos rompen el cálculo de ganancia 🔴 — ✅ PARCIALMENTE RESUELTO
> **Update (Fase 0):** al adoptar la versión nueva del código, los combos vendidos ahora se guardan
> en la tabla **`sale_combos`** con su `costo_unitario` y `precio_unitario`, y los reportes los leen
> de ahí. Ya NO se mete el combo como línea falsa en `sale_items`. Falta validar el cuadre fino en la
> Fase 1.3 (que el `total` de la venta coincida con productos + combos).

- **Dónde:** [`app/ventas/nueva/page.tsx`](../app/ventas/nueva/page.tsx#L233-L256) · [`lib/services/sales.ts`](../lib/services/sales.ts#L236-L261).
- **Qué pasa:** Al vender un combo se insertan los productos con `precio_unitario = 0` y además
  una línea "combo" con `product_id = combo.id`. Ese ID **no existe en la tabla `products`**, así
  que el `join` de reportes a `products.costo` devuelve `null` → aparece como *"Producto eliminado"*
  y costo 0. El stock de los productos sí se descuenta (eso está bien), pero la **atribución de
  ingreso y costo del combo queda mal**.
- **Impacto:** Ganancia limpia mal calculada cuando se venden combos.

### B3 · No se guarda la moneda real ni el monto pagado / vuelto 🔴 — ✅ RESUELTO (Fase 1)
> **Update (Fase 1.2):** se agregaron columnas `pagado` y `vuelto` a `sales`; se actualizó
> `create_sale_atomic` para recibir y guardar `moneda`, `pagado` (en la moneda del cliente) y
> `vuelto` (en UYU). `createSale` y el POS pasan estos valores en cada venta.

- **Dónde:** `createSale` en [`lib/services/sales.ts`](../lib/services/sales.ts#L12) **no envía `moneda`** ·
  `create_sale_atomic` en [`lib/sql/migrations.sql`](../lib/sql/migrations.sql#L73) tampoco la inserta ·
  pero [`cashRegister.ts`](../lib/services/cashRegister.ts#L67) agrupa por `venta.moneda === "BRL"`.
- **Qué pasa:** Como la `moneda` nunca se setea, **el cobro en BRL nunca se contabiliza como BRL**.
  Tampoco se guarda cuánto pagó el cliente ni el vuelto. La calculadora de cambio es solo visual.
- **Impacto:** Imposible cuadrar efectivo en pesos vs reales al cerrar caja.

### B7 · El extra "Monster" no se suma al precio guardado 🔴
- **Dónde:** [`app/ventas/nueva/page.tsx`](../app/ventas/nueva/page.tsx#L69-L76) (el `total` SÍ incluye Monster)
  vs línea [262](../app/ventas/nueva/page.tsx#L262) (al guardar, `precio_unitario = it.precio_unitario + shotExtra`, **sin Monster**).
- **Qué pasa:** El `total` que se cobra incluye el `+$100` del Monster, pero los `sale_items`
  guardados **no**. La suma de los ítems guardados **no coincide** con el total cobrado.
- **Impacto:** Descuadre entre el total de la venta y el detalle. Reportes por producto subestiman ingreso.

### B14 · El stock de Monster nunca se descuenta 🔴 — ✅ RESUELTO (Fase 1)
- **Dónde:** [`app/ventas/nueva/page.tsx`](../app/ventas/nueva/page.tsx#L271-L283) (rama producto normal del armado de `saleItems`).
- **Qué pasa:** El Monster no es un producto referenciado: es solo la constante `MONSTER_PRICE` + el flag
  `includeMonster`. Al vender un vaso con Monster, **no se agrega una línea de Monster a `saleItems`**, así
  que la RPC `create_sale_atomic` nunca decrementa su stock. El +$100 se cobra (ok tras B7) pero el inventario
  de Monster queda intacto.
- **Impacto:** El stock de Monster nunca baja → se sobrevende, los reportes de reposición mienten, y el costo
  del Monster no se atribuye. Se detectó al cerrar B7.
- **Fix:** cuando `includeMonster && categoria === "Vasos"`, agregar Monster como ítem separado en `saleItems`
  con `precio_unitario = 0` (el precio ya está en el vaso) y `cantidad = it.cantidad`, tomando `stock_actual`
  de `products`. El producto Monster se identifica por nombre (match por inclusión, `nombre.includes("monster")`);
  si no se encuentra, se avisa con un toast de advertencia y la venta igual procede (sin descontar stock).

---

## 🟠 PROBLEMAS IMPORTANTES

### B4 · El motor de "insights" corre tras CADA venta y es N+1 🟠 — ✅ RESUELTO (commit 3a59a0f)
> **Update (Fase 2.3):** se eliminaron las dos llamadas a `generatePostSaleInsights` de `createSale`
> y `createSaleFallback` en [`lib/services/sales.ts`](../lib/services/sales.ts). El hook y el import
> fueron removidos. Los insights pasan a calcularse on-demand desde el dashboard. Camino de venta
> limpio: cero queries extras por venta. (M6 cerrado en la misma iteración.)

- **Dónde:** [`lib/services/strategicInsights.ts`](../lib/services/strategicInsights.ts#L120-L164) (`calculateCurrentMetrics` hace **una consulta por cada producto**) · disparado en [`sales.ts`](../lib/services/sales.ts#L46).
- **Qué pasa:** Después de cada venta dispara múltiples queries a Supabase. En hora pico = carga
  innecesaria y posible lentitud. Además corre en `setTimeout` del cliente: si el cajero navega o
  cierra, se cancela → poco fiable de todos modos.
- **Impacto:** Riesgo de lentitud justo cuando más rápido tiene que ser. Es una feature "linda" que
  pelea contra la prioridad #1 (rápido).

### B5 · La base de datos puede estar expuesta (sin RLS) 🟠
- **Dónde:** [`lib/supabaseClient.ts`](../lib/supabaseClient.ts) usa la `anon key` **desde el navegador**.
- **Qué pasa:** El login de la app (middleware + JWT) protege las **rutas de Next**, pero las llamadas
  a Supabase salen directo del browser con la `anon key` (que es pública). Si las tablas **no tienen
  Row Level Security (RLS)** bien configurado, cualquiera con la URL del proyecto podría leer/escribir.
- **Impacto:** Riesgo de seguridad / manipulación de datos.
- **Estado (Fase 0):** En la base nueva, RLS está **activo** en las 11 tablas pero con políticas
  **públicas** (`USING true` / `WITH CHECK true`) para que la app funcione con la anon key. Los advisors
  de Supabase reportan además: `security_definer_view` en `combos_with_products` (conviene `security_invoker=on`)
  y `function_search_path_mutable` en las 5 funciones (conviene fijar `search_path`). **Todo se endurece en la Fase 4.**

### B8 · Sin modo offline 🟠
- **Dónde:** todo el flujo de venta depende de `supabase.rpc(...)` online.
- **Qué pasa:** Si se cae el WiFi, `createSale` lanza error y **se pierde la venta**.
- **Impacto:** El dueño pidió explícitamente estar **prevenido ante cortes**. Hoy no hay red de seguridad.

### B10 · El fallback no atómico puede dejar ventas a medio guardar 🟠 — ✅ RESUELTO (Fase 0)
> **Update (Fase 0):** la función `create_sale_atomic` quedó aplicada en la base nueva
> (ver [`lib/sql/00-schema-completo.sql`](../lib/sql/00-schema-completo.sql)), así que toda venta
> entra por la RPC atómica. El fallback no atómico ya no es el camino real.

- **Dónde:** [`lib/services/sales.ts`](../lib/services/sales.ts#L60) `createSaleFallback`.
- **Qué pasa:** Si la RPC `create_sale_atomic` no existe, el fallback hace inserts por separado
  (sale → items → stock). Si falla a mitad, queda inconsistente.
- **Impacto:** Bajo si la migración SQL está aplicada (hay que confirmarlo en Fase 0). Si no, es real.

---

## 🟡 MENORES / HIGIENE

### B16 · Ventas anuladas contaban en los totales del dashboard 🟠 — ✅ RESUELTO (commit b0dadc6)
- **Dónde:** [`lib/services/reports.ts`](../lib/services/reports.ts) — `fetchTodayReport`, `fetchWeeklyReport`, `fetchMonthlyReport`.
- **Qué pasaba:** Las tres funciones consultaban `sales` **sin filtrar por `estado`**. Las ventas con
  `estado = 'anulada'` se incluían en los totales de ingresos y ganancia limpia. Mismo problema en
  `sale_items` y `sale_combos`: se consultaban por fecha sin verificar si la venta padre estaba activa.
- **Impacto:** El dashboard mostraba ingresos y ganancia inflados. Al anular una venta, los totales
  no bajaban hasta hacer un Refrescar manual, y aún así incluían la anulada.
- **Fix:** `.eq("estado", "activa")` en las 3 queries de `sales`. Para `sale_items` y `sale_combos`,
  join `!inner(estado)` + `.eq("sales.estado", "activa")` vía PostgREST para excluir ítems huérfanos
  de ventas anuladas del cálculo de ganancia.

### B17 · El dashboard no se actualiza automáticamente tras anular desde el historial 🟡
- **Dónde:** [`app/reportes/ventas/page.tsx`](../app/reportes/ventas/page.tsx) — `handleCancelSale`.
- **Qué pasa:** Al anular una venta en `/reportes/ventas`, se llama `loadSales()` que recarga el
  historial de esa página. Pero el dashboard en `/reportes/hoy` es una ruta separada y sus datos
  no se invalidan. El cajero necesita navegar al dashboard y pulsar "Refrescar" para ver los totales
  actualizados.
- **Impacto:** Bajo — son páginas separadas y el cajero que anula está en el historial, no en el
  dashboard. Con B16 resuelto, al hacer Refrescar los totales son correctos.
- **Fix futuro opcional:** estado global (React Context / Zustand) o Supabase Realtime para propagar
  la invalidación entre rutas. No urgente.

### B15 · Costos en reportes históricos usan precio live, no el del momento de la venta 🟡
- **Dónde:** [`lib/services/reports.ts`](../lib/services/reports.ts) · `calcularMetricas` en
  [`app/reportes/hoy/page.tsx`](../app/reportes/hoy/page.tsx#L83).
- **Qué pasa:** `totalCostos` se calcula sumando `products.costo` (valor actual de la tabla)
  en lugar del costo registrado al momento de la venta. Si el costo de un producto o componente
  de combo cambia, los reportes de períodos anteriores muestran la ganancia con costos nuevos.
- **Impacto:** Bajo hoy (costos estables). Podría distorsionar análisis histórico si se ajustan
  precios de compra. Aplica igual a productos individuales y a combos.
- **Fix futuro:** guardar `costo_unitario` por ítem en `sale_items` al momento de la venta
  (similar a como `sale_combos` ya guarda `costo_unitario`). No urgente hasta que haya historial
  con cambios de costos relevantes.

### B13 · El repo está duplicado 🟡 — ✅ RESUELTO (Fase 0)
- **Dónde:** existía `Kiosco-manager-main/` dentro del repo.
- **Hallazgo:** NO era una copia idéntica — era una versión **más nueva** (combos en reportes) que el
  último commit dejó anidada y rompía el build. Se promovieron sus 4 archivos al root y se eliminó la carpeta.

### B6 · El stock del carrito usa un snapshot que puede envejecer 🟡
- **Dónde:** [`app/ventas/nueva/page.tsx`](../app/ventas/nueva/page.tsx#L84) usa `stock_actual` cargado al abrir.
- **Impacto:** Con 1 solo dispositivo es bajo (se recarga tras cada venta). La función SQL atómica
  igual protege la integridad. Menor.

---

## 💡 OPORTUNIDADES DE MEJORA (no son bugs, suman a las prioridades)

| ID | Mejora | Prioridad de negocio | Cerrado en |
|---|---|---|---|
| **M1** | **Atajos de teclado** en el POS (buscar, agregar, elegir método, cobrar) | ⚡ Rápido | — |
| **M2** | **Lector de código de barras** (USB = teclado): campo `codigo` en productos + match en búsqueda | ⚡ Rápido | — |
| **M3** | **Sesión de caja** (apertura/cierre con cajero y monto inicial) | 💵 Cuadre + 👥 Turnos | — |
| **M4** | **Registrar cajero por venta** (saber quién vendió qué) | 👥 Turnos | — |
| **M5** | **PWA + cola offline** (guardar ventas localmente y sincronizar) | 🛡️ Prevención | — |
| **M6** | **Mover los insights** fuera del camino de venta (on-demand o vista SQL) | ⚡ Rápido | Fase 2.3 |
| **M7** | **Activar RLS** en Supabase | 🔒 Seguridad | — |
| **M8** | Guardar **moneda + pagado + vuelto** en cada venta | 💵 Cuadre | Fase 1.2 |
| **M9** | **Impresión de ticket / comanda** (opcional, según necesidad) | 🧾 Extra | — |
| **M10** | **Rediseño UI del POS** — grid de botones por categoría, panel de cobro colapsable en modal, atajos visibles en pantalla. Elimina la búsqueda como flujo principal. | ⚡ Rápido | — |

---

## Resumen ejecutivo

Lo que **más urge** para que funcione en la vida real:
1. **Cuadre de caja** (B3, B7, B2) — que la plata dé bien.
2. **Turno / sesión de caja** (B1 + M3 + M4) — la operación nocturna real.
3. **Velocidad con teclado** (M1, M2, B4/M6) — para la hora pico.
4. **Red de seguridad** (B8/M5, B5/M7) — prevención de cortes y seguridad.
