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

### B5 · La base de datos puede estar expuesta (sin RLS) 🔴 — re-priorizado tras confirmar el riesgo
> **Update (2026-06-17):** pasada de hardening sobre los advisors de seguridad de Supabase.
> Se confirmó el riesgo de forma concreta (no teórico): probando contra la API REST con la
> `anon key` pública, hoy se puede leer **y escribir** `products`, `sales`, `cash_sessions`,
> `cash_outflows`, etc. directo contra Supabase, sin pasar por la app — incluida la RPC
> `create_sale_atomic` (o sea, se pueden **forjar ventas o tocar stock/caja desde afuera**).
> Esto pega directo en la prioridad #2 del proyecto (que la caja cuadre), así que sube a 🔴.
>
> **Resuelto en esta pasada** (sin tocar código de la app, solo Supabase):
> - RLS habilitado + restringido a `service_role` en `users` y `login_attempts` (las únicas
>   tablas que ya se consultan solo vía `supabaseServer`).
> - `search_path = public` fijado en las 7 funciones (`decrement_stock`, `increment_stock`,
>   `cancel_sale`, `update_combo_timestamp`, `create_sale_atomic`, `register_cash_outflow`,
>   `close_cash_session`).
> - Vista `combos_with_products` pasada a `SECURITY INVOKER`.
> - Intento de restringir `cash_outflows` y el resto de las tablas a `service_role` se **revirtió**:
>   rompía la app en producción (`lib/services/*.ts` usa la `anon key` para casi todo, no solo
>   `users.ts`). Verificado con `curl` contra la REST API antes y después de revertir.
>
> **Pendiente real (no es un fix de SQL, es un refactor):** mover `lib/services/sales.ts`,
> `products.ts`, `reports.ts`, `restock.ts`, `categories.ts`, `cashSessions.ts`, `combos.ts`,
> `cashRegister.ts`, `strategicInsights.ts` de `supabaseClient` (anon) a `supabaseServer`
> (service_role) — chequeando antes si alguno se importa desde un componente `"use client"`
> (ahí no se puede usar service_role directo, hay que pasar por una API route). Recién ahí se
> puede cerrar RLS a `service_role`-only en el resto de las tablas sin romper nada.
>
> **Decisión (2026-06-17, post /cso): DIFERIDO — riesgo aceptado temporalmente.** El refactor
> del borde server (Server Actions con `service_role` + verificación de JWT por handler) NO se
> hace en esta pasada. **Disparador de cierre obligatorio: antes del primer turno real con plata.**
> Mientras tanto el riesgo es real (cualquiera con la anon key del bundle puede forjar ventas /
> tocar stock-caja vía REST + `create_sale_atomic`, salteando middleware e idempotencia). Válido
> solo porque hoy no hay datos reales en producción. Hallazgos del /cso: el borde server debe
> re-verificar el JWT adentro de cada handler (no confiar en el header `x-user-role`, que el
> middleware setea en la respuesta y no en el request); `convertBRLtoUYU` es cálculo puro y puede
> quedar client-side; `cashRegister.ts` y `strategicInsights.ts` son código muerto (cero
> importadores) → borrarlos saca 2 archivos del alcance.

- **Dónde:** [`lib/supabaseClient.ts`](../lib/supabaseClient.ts) usa la `anon key`, importado desde
  casi todos los `lib/services/*.ts` (no solo desde el navegador — también desde Server Components
  y route handlers, pero con la misma key pública igual).
- **Qué pasa:** El login de la app (middleware + JWT) protege las **rutas de Next**, pero las llamadas
  a Supabase salen con la `anon key` (que es pública, `NEXT_PUBLIC_*`). Las tablas tienen RLS activo
  pero con políticas **públicas** (`USING true` / `WITH CHECK true`), así que cualquiera con la URL
  del proyecto y la anon key (visible en cualquier bundle que la use) puede leer/escribir directo.
- **Impacto:** Manipulación de datos de venta/caja desde afuera de la app, sin dejar rastro en los
  flujos que sí tienen idempotencia/validación (B18, B23-B25). Compromete el cuadre de caja.

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

## 🔍 PASADA DE AUDITORÍA PRE-PRODUCCIÓN — 2026-06-01 (B18+)

> Revisión crítica del código completo antes del **primer uso real** (kiosco nocturno, frontera
> Rivera/Sant'Ana). Agrupada como el análisis: **flujo de venta · flujo de caja · datos críticos**.
> Los 🔴 de acá se disparan en uso *normal*, no en casos raros — son los que deciden si la caja
> cuadra la noche uno.

### Flujo de venta

#### B18 · Venta duplicada al reintentar tras corte de red 🔴 — ✅ RESUELTO
- **Dónde:** [`createSale`](../lib/services/sales.ts#L34) (sin clave de idempotencia) · el POS conserva
  el carrito al fallar en [`app/ventas/nueva/page.tsx`](../app/ventas/nueva/page.tsx#L413).
- **Qué pasa:** Si `create_sale_atomic` **commitea en el servidor pero la respuesta se pierde** (WiFi
  inestable), el front lanza error y mantiene el carrito. El cajero vuelve a tocar COBRAR → se ejecuta
  la RPC de nuevo.
- **Impacto:** Venta doble, doble descuento de stock y doble efectivo esperado en el cuadre. Es justo
  el escenario de "cortes" que el dueño pidió prevenir (00-CONTEXTO).
- **Fix:** clave de idempotencia `client_request_id` (UUID por intento de cobro). El POS la genera y
  rota en cada cambio de carrito; en un reintento (carrito sin cambios) reusa la misma clave.
  `create_sale_atomic` dedupea: si ya existe una venta con esa clave la devuelve sin re-insertar ni
  re-descontar stock, con `unique index` parcial en `sales(client_request_id)` + guard `unique_violation`
  para el doble-submit concurrente. Combos también idempotentes (`upsert` + unique `sale_combos(sale_id,
  combo_id)`). Verificado en browser con Network=Offline tras el COMMIT.

#### B19 · El insert de combos no es atómico con la venta 🟠
- **Dónde:** [`lib/services/sales.ts`](../lib/services/sales.ts#L62) — `sale_combos` se inserta en una
  llamada separada *después* de la RPC.
- **Qué pasa:** La RPC `create_sale_atomic` commitea venta + ítems + stock; el insert de `sale_combos`
  va aparte. Si el corte ocurre entre ambos, la venta queda con stock descontado pero sin fila de combo.
- **Impacto:** El ingreso y costo del combo desaparecen del reporte y `Σ(líneas) ≠ total`. Reabre
  parcialmente B2 por una vía distinta (la costura no atómica).

#### B20 · "Stock insuficiente" muestra el UUID y voltea toda la venta 🟠 — ✅ MENSAJE RESUELTO
> **Update:** `create_sale_atomic` ahora levanta `'Stock insuficiente: % (hay %, se pidieron %)'` con el
> **nombre** del producto, el stock disponible y la cantidad pedida (el `SELECT` que bloquea la fila con
> `FOR UPDATE` trae también `nombre` → cero query extra). El cajero ve, p. ej.,
> *"Stock insuficiente: Monster (hay 0, se pidieron 1)"*. **Pendiente la otra mitad**: que un faltante de
> un solo ítem **no aborte el carrito entero** (cambio transaccional, aparte).

- **Dónde:** [`lib/sql/00-schema-completo.sql`](../lib/sql/00-schema-completo.sql#L305) —
  `RAISE EXCEPTION 'Stock insuficiente para producto %'` con el `product_id` (UUID).
- **Qué pasa:** Si un solo ítem queda corto, la RPC aborta la venta entera y el front muestra un UUID
  hexadecimal, no el nombre del producto.
- **Impacto:** En hora pico el cajero no sabe qué ítem sacar, prueba a ciegas y se traba la cola. Pelea
  contra la prioridad #1 (rápido).

#### B21 · Combo + producto suelto que comparten componente → sobreventa 🟠
- **Dónde:** guard del carrito en [`app/ventas/nueva/page.tsx`](../app/ventas/nueva/page.tsx#L166) ·
  chequeo de stock del combo en [líneas 191-198](../app/ventas/nueva/page.tsx#L191).
- **Qué pasa:** El guard compara la línea suelta contra el stock total e ignora lo que el combo consume
  del mismo producto. Se puede armar "Vaso X suelto = stock total" + un combo que también lleva Vaso X.
- **Impacto:** El carrito lo acepta pero la RPC lo rechaza entero al confirmar (con el error UUID de
  B20). Otro bloqueo de hora pico.

#### B22 · No se valida que el pago sea ≥ total 🟡
- **Dónde:** botón siempre habilitado en [`app/ventas/nueva/page.tsx`](../app/ventas/nueva/page.tsx#L846) ·
  aviso "Falta dinero" sin bloqueo en [líneas 788-790](../app/ventas/nueva/page.tsx#L788).
- **Qué pasa:** Si el cliente paga de menos, se muestra "Falta dinero" pero igual deja CONFIRMAR y
  guarda `pagado < total`.
- **Impacto:** El cuadre asume cobro completo → cajón corto. Bajo si el cajero presta atención, pero
  nada lo fuerza.

### Flujo de caja

#### B23 · El cajón de PESOS queda corto: el vuelto en pesos sobre ventas en reales no se resta 🔴 — ✅ RESUELTO
> **Update:** modelo "dos cajones, movimiento neto". `sales` guarda `tasa_cambio` y las columnas
> generadas `mov_efectivo_uyu` / `mov_efectivo_brl` (netean el vuelto por cajón). `close_cash_session`
> y `getSessionTotals` suman esos `mov_*`, con un invariante de consistencia visible en el cierre.
> Vuelto mixto prohibido en v1.

- **Dónde:** [`close_cash_session`](../lib/sql/00-schema-completo.sql#L369) (efectivo UYU = `Σ(total)`
  solo de `moneda='UYU'`, línea 371) · [`getSessionTotals`](../lib/services/cashSessions.ts#L43) ·
  display en [`app/caja/page.tsx`](../app/caja/page.tsx#L349) · elección de moneda del vuelto en el
  [POS](../app/ventas/nueva/page.tsx#L792).
- **Qué pasa:** En una venta pagada en **BRL** con vuelto en **pesos**, el cajero saca pesos del cajón,
  pero esa salida nunca se resta del efectivo UYU esperado (la venta tiene `moneda='BRL'`, así que no
  entra en `total_efectivo_uyu`). El lado BRL sí está bien neteado; rompe específicamente el cajón de pesos.
- **Impacto:** El "Efectivo total en caja $" del cierre sobreestima los pesos físicos por la suma de
  todos los vueltos en pesos dados sobre ventas en reales. **El cajón de pesos falta todas las noches**
  y nadie puede explicarlo. Rompe la prioridad #2 (que la caja cuadre).

#### B24 · `paidCurrency` no se resetea entre ventas → ventas en pesos grabadas como BRL 🔴 — ✅ RESUELTO
> **Update:** el nuevo flujo de cobro exige `pagado`/`vuelto` no-null en efectivo y la RPC
> `create_sale_atomic` los valida; el POS resetea la moneda entre ventas. Cerrado junto con B23/B25.

- **Dónde:** reset post-venta en [`app/ventas/nueva/page.tsx`](../app/ventas/nueva/page.tsx#L405)
  (limpia todo menos `paidCurrency`) · estado en [línea 32](../app/ventas/nueva/page.tsx#L32) ·
  se pasa como `moneda` en [línea 390](../app/ventas/nueva/page.tsx#L390).
- **Qué pasa:** Tras cobrar en reales queda `paidCurrency='BRL'`. La siguiente venta confirmada rápido
  (sin abrir la calculadora) se graba con `moneda='BRL'` y `pagado=null`.
- **Impacto:** Esa venta no entra ni en efectivo UYU (es BRL) ni en efectivo BRL (`pagado` null) →
  desaparece de ambos baldes, el cajón de pesos queda de más y `total_ventas ≠ efectivo+digital+brl`.
  Se dispara con una secuencia trivial (una venta en reales y todas las siguientes "rápidas" salen mal).

#### B25 · La calculadora es opcional → cobro en reales registrado como pesos 🔴 — ✅ RESUELTO
> **Update:** nuevo modal de cobro con "PAGO JUSTO $" dominante; el cobro fija explícitamente la moneda
> y exige `pagado`/`vuelto`. Ya no hay camino rápido que grabe reales como pesos. Cerrado con B23/B24.

- **Dónde:** default `paidCurrency='UYU'` en [`app/ventas/nueva/page.tsx`](../app/ventas/nueva/page.tsx#L32) ·
  camino rápido CONFIRMAR VENTA en [línea 846](../app/ventas/nueva/page.tsx#L846).
- **Qué pasa:** El camino rápido es confirmar sin abrir la calculadora; eso deja `moneda='UYU'`. Si el
  cajero cobró físicamente en reales sin elegir un billete BRL, se graba como pesos.
- **Impacto:** El cierre espera pesos que no están y no cuenta los reales que sí están. Descuadre en
  ambas monedas.

#### B26 · Anular después del cierre desincroniza el snapshot del turno 🔴
- **Dónde:** [`cancel_sale`](../lib/sql/00-schema-completo.sql#L317) no verifica si la venta pertenece
  a un turno cerrado · snapshot congelado en [`close_cash_session`](../lib/sql/00-schema-completo.sql#L381) ·
  UI de anulación en [`app/reportes/ventas/page.tsx`](../app/reportes/ventas/page.tsx#L87).
- **Qué pasa:** El snapshot del turno (`total_ventas`, efectivo, etc.) se congela al cerrar. Si después
  se anula una venta de ese turno, el stock vuelve pero el total grabado del turno no baja.
- **Impacto:** Stock devuelto sin ajuste de caja en el turno donde ya se contó y se llevó la plata. El
  historial de turnos miente.

#### B27 · Venta en el cambio de turno = plata invisible 🟠
- **Dónde:** `openSessionId` cargado una sola vez al abrir el POS en
  [`app/ventas/nueva/page.tsx`](../app/ventas/nueva/page.tsx#L52) · se pasa en [línea 398](../app/ventas/nueva/page.tsx#L398).
- **Qué pasa:** Si la caja se cierra mientras hay un carrito abierto, la venta se inserta con el
  `session_id` del turno ya cerrado, cuyo snapshot ya está congelado.
- **Impacto:** Esa venta no aparece en ningún turno. Plata cobrada, nunca cuadrada. Edge, pero ocurre
  justo en el relevo nocturno.

#### B28 · El cierre no pide el efectivo contado real ni calcula diferencia 🟠 — ✅ RESUELTO
> **Update:** `cash_sessions` tiene `efectivo_contado_uyu/brl` y columnas de `diferencia_*`;
> `close_cash_session` recibe el efectivo contado. El cierre pide contar la caja (pesos y reales si
> hubo movimiento BRL), muestra la diferencia en vivo, exige nota si hay descuadre y el historial
> indica Sobró/Faltó/✓ cuadró. Pasos 1-4 commiteados.

- **Dónde:** resumen de cierre en [`app/caja/page.tsx`](../app/caja/page.tsx#L347) (solo muestra el
  monto esperado) · `cash_sessions` sin columnas de contado/descuadre en
  [`lib/sql/00-schema-completo.sql`](../lib/sql/00-schema-completo.sql#L48).
- **Qué pasa:** El cierre solo muestra el efectivo *esperado*. Nunca pregunta cuánto contó el cajero ni
  guarda la diferencia.
- **Impacto:** Un arqueo que solo dice lo que *deberías* tener no detecta descuadres (y los de B23–B25
  pasan inadvertidos). Sin dato de descuadre, no hay control de caja real.

#### B32 · "Registrar salida" no soporta dinero que entra a la caja durante el turno 🔴 — ✅ RESUELTO
> **Update:** `cash_outflows` ahora modela "movimientos de caja" con columna `tipo`
> ('entrada'|'salida'). Un solo modal con selector Entrada/Salida (igual al de moneda). El esperado
> del cierre suma entradas y resta salidas. RPC `register_cash_movement` reemplaza a
> `register_cash_outflow`; `close_cash_session` guarda el snapshot separado por tipo. Verificado en
> browser (registrar entrada y salida actualiza los totales correctamente).

- **Dónde:** [`register_cash_outflow`](../lib/sql/00-schema-completo.sql#L496) y la tabla
  `cash_outflows` solo modelan salidas · botón único "− Registrar salida" en
  [`app/caja/CajaClient.tsx`](../app/caja/CajaClient.tsx#L398).
- **Qué pasa:** A veces durante el turno entra plata a la caja que no es una venta del POS (vuelto
  de un proveedor, un préstamo que se devuelve, etc.). Hoy no hay forma de registrarlo: solo se puede
  restar plata, nunca sumarla fuera de las ventas.
- **Impacto:** El efectivo esperado del arqueo (B28) no contempla esas entradas → la caja parece
  "sobrar" sin explicación, o el cajero tiene que inventar una salida negativa para que cuadre.

#### B33 · El cajero no tiene ninguna forma de anular una venta propia 🟠 — ✅ RESUELTO
> **Update:** nueva sección "Ventas de este turno" en `/caja` (visible para cajero y admin) con
> botón Anular por venta. RPC `cancel_sale_own_turno` valida que la venta pertenezca al turno
> **actualmente abierto** antes de anular — rechaza ventas de turnos cerrados o inexistentes
> (probado con SQL directo, sin tocar datos reales). De paso se resuelve **B30**: `cancel_sale`
> ahora recibe `p_anulada_por` y `sales` guarda `anulada_por`/`anulada_at`, visibles también en el
> historial de `/reportes/ventas` para el admin.

- **Dónde:** middleware bloquea `/reportes` (donde vive "Anular") para `role !== 'admin'` en
  [`middleware.ts`](../middleware.ts#L8) · botón Anular en
  [`app/reportes/ventas/page.tsx`](../app/reportes/ventas/page.tsx#L260).
- **Qué pasa:** Si el cajero cobra mal (producto equivocado, monto equivocado) durante su propio
  turno, no tiene cómo corregirlo sin un admin presente. En un kiosco nocturno con un solo
  empleado de turno, eso es habitual y bloqueante.
- **Impacto:** Errores de cobro quedan en el sistema sin corregir, o el cajero improvisa
  (anota en un papel, ajusta el cierre a mano) lo que rompe el cuadre real.

### Datos críticos

#### B29 · No se guarda la tasa de cambio usada en cada venta 🔴 — ✅ RESUELTO
> **Update:** `sales.tasa_cambio` guarda el cambio usado por venta; `create_sale_atomic` lo recibe y
> el POS lo envía. Permite reconstruir el valor UYU de las ventas en BRL. Cerrado junto al cuadre (B23).

- **Dónde:** `exchange_rate_config` es una sola fila mutable en
  [`lib/services/combos.ts`](../lib/services/combos.ts#L134) · `sales` no tiene columna de tasa en
  [`lib/sql/00-schema-completo.sql`](../lib/sql/00-schema-completo.sql#L57).
- **Qué pasa:** Si el dueño actualiza la tasa a mitad de turno, no queda registro de a qué cambio se
  cobró cada venta en reales.
- **Impacto:** Imposible reconstruir el valor UYU de las ventas en BRL ni auditar el cuadre. Debería
  guardarse `tasa_cambio` por venta.

#### B30 · No se registra quién anuló una venta ni cuándo 🟠 — ✅ RESUELTO (junto con B33)
> **Update:** `sales.anulada_por`/`anulada_at` se completan en `cancel_sale` (admin) y
> `cancel_sale_own_turno` (cajero, solo turno abierto). El historial de `/reportes/ventas` muestra
> quién anuló y cuándo. Sigue sin rol/PIN extra al anular — el control es "solo tu turno abierto"
> para cajero, sin restricción adicional para admin.

- **Dónde:** [`cancel_sale`](../lib/sql/00-schema-completo.sql#L317) no guarda autor ni timestamp ·
  `sales` sin `anulada_por`/`anulada_at` en [`lib/sql/00-schema-completo.sql`](../lib/sql/00-schema-completo.sql#L57) ·
  botón Anular sin rol/PIN en [`app/reportes/ventas/page.tsx`](../app/reportes/ventas/page.tsx#L263).
- **Qué pasa:** Cualquiera puede anular cualquier venta (devuelve stock) sin dejar rastro de autor ni motivo.
- **Impacto:** Agujero de fraude obvio para personal rotativo nocturno: anular una venta legítima y
  quedarse con el efectivo. Sin auditoría no se detecta.

> **Nota:** el costo en vivo de reportes históricos ya está cubierto por **B15**; no se duplica acá.

### Higiene / repo

#### B31 · Carpeta `web/` duplicada (copia vieja) 🟡
- **Dónde:** [`web/`](../web/) en la raíz del repo.
- **Qué pasa:** Es una copia desactualizada del proyecto (mismo patrón que B13, que sí se borró). No
  está en el camino activo (la app corre desde la raíz).
- **Impacto:** Invita a editar el archivo equivocado. Conviene borrarla.

---

## 💡 OPORTUNIDADES DE MEJORA (no son bugs, suman a las prioridades)

| ID | Mejora | Prioridad de negocio | Cerrado en |
|---|---|---|---|
| **M1** | **Atajos de teclado** en el POS (buscar, agregar, elegir método, cobrar) | ⚡ Rápido | Fase 2.1 |
| **M2** | **Lector de código de barras** (USB = teclado): campo `codigo` en productos + match en búsqueda | ⚡ Rápido | ⏸ diferido |
| **M3** | **Sesión de caja** (apertura/cierre con cajero y monto inicial) | 💵 Cuadre + 👥 Turnos | Fase 3.1/3.2 |
| **M4** | **Registrar cajero por venta** (saber quién vendió qué) | 👥 Turnos | Fase 3.3 |
| **M5** | **PWA + cola offline** (guardar ventas localmente y sincronizar) | 🛡️ Prevención | — |
| **M6** | **Mover los insights** fuera del camino de venta (on-demand o vista SQL) | ⚡ Rápido | Fase 2.3 |
| **M7** | **Activar RLS** en Supabase | 🔒 Seguridad | — |
| **M8** | Guardar **moneda + pagado + vuelto** en cada venta | 💵 Cuadre | Fase 1.2 |
| **M9** | **Impresión de ticket / comanda** (opcional, según necesidad) | 🧾 Extra | — |
| **M10** | **Rediseño UI del POS** — grid de botones por categoría, panel de cobro colapsable en modal, atajos visibles en pantalla. Elimina la búsqueda como flujo principal. | ⚡ Rápido | Fase 3.0 |

---

## Resumen ejecutivo

Lo que **más urge** para que funcione en la vida real:
1. **Cuadre de caja** (B3, B7, B2) — que la plata dé bien.
2. **Turno / sesión de caja** (B1 + M3 + M4) — la operación nocturna real.
3. **Velocidad con teclado** (M1, M2, B4/M6) — para la hora pico.
4. **Red de seguridad** (B8/M5, B5/M7) — prevención de cortes y seguridad.

> **Pasada pre-producción (2026-06-01) — ver B18–B33.** Bloqueantes del primer uso real, por urgencia:
> el **cuadre cross-moneda** (B23, B24, B25) ✅, el **arqueo real al cierre** (B28) ✅, el **reintento
> seguro de venta** (B18) ✅, **movimientos de caja entrada/salida** (B32) ✅ y **anulación por cajero
> + auditoría** (B33, B30) ✅. Crítico restante sin resolver: **B26** (anular tras el cierre
> desincroniza el snapshot del turno) — es el único 🔴 que queda de esta pasada.
