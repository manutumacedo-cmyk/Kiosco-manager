# Handoff — B49 / B50 (visibilidad por rol en caja)

> Sesión del 2026-08-30. Se cortó por inestabilidad del browser de QA, no por el código.
> Este archivo es descartable: borralo cuando B49 esté commiteado.

---

## 0. Limpieza de QA — casi toda hecha

> **Corregido el 2026-08-30 tras una auditoría independiente.** Este archivo decía que
> había un turno de prueba abierto bloqueando la apertura de caja. **Ya no es cierto**:
> alguien corrió el `DELETE` mientras tanto. Verificado contra la base.

Estado real verificado (`turnos_abiertos = 0`, `turno_prueba = 0`, `usuarios_qa = 0`):

| Qué | Estado |
|---|---|
| Turno de prueba `853fe1aa-…` (Test_Caja, fondo $1) | ✅ borrado. 0 turnos abiertos. |
| Usuario `qa_admin_b49` | ✅ borrado en duro |
| Usuario `qa_cajero_m11` | ✅ borrado en duro |
| Sesiones QA en `user_sessions` | ✅ limpias. Solo queda 1 activa, de `Santi` (admin real). |
| Fila "Login fuera de horario" de `Test_Caja` en `notifications` | ⬜ **queda 1**, borrar |
| Usuario **`Test_Caja`** (cajero, activo, clave `admin123`) | ⬜ **queda vivo en producción** |

**Lo que falta, y es lo más serio de los dos:** `Test_Caja` sigue activo en la base real
con una clave trivial. Es una cuenta de QA con acceso al POS del kiosco. Desactivarla o
borrarla en cuanto termine la verificación de B49.

En `notifications` hay además un broadcast de "actualización" con `user_id` null: **es
legítimo, no lo borres.**

`idx_one_open_session` existe y es `UNIQUE (estado) WHERE estado='abierta'` — o sea que
la advertencia original era correcta *mientras el turno existía*. Hoy es irrelevante.

---

## 1. Estado del código

**Rama:** `fix/cuadre-cross-moneda-b40-b45`

**B49 está implementado y sin commitear**, en un solo archivo: `app/caja/CajaClient.tsx`.
`tsc --noEmit` y `eslint` pasan limpios.

Los cortes aplicados, todos colgando de `const esAdmin = role === "admin"`:

| Qué se ocultó al cajero | Cómo |
|---|---|
| Historial de turnos | `{esAdmin && closedSessions.length > 0 && (` |
| `getClosedSessions` / `getLastClosedSession` | no se llaman si no es admin — el dato no sale de Supabase |
| "Último cierre · se contaron $X" | se apaga solo: `ultimoCierre` queda `null` |
| "Se retiró del cajón $X" / "Hay más plata" | idem, cuelgan de `ultimoCierre` |
| "Efectivo total en caja $ / R$" | `{arqueoConfirmado && esAdmin && (` |
| "Esperado: $X" + ✅/🟡/🔴 (x2, pesos y reales) | `{arqueoConfirmado && esAdmin && (` |
| Aviso ⚠️ del invariante | `{hayDescuadre && esAdmin && (` |
| Nota obligatoria por descuadre | `faltaNotaPorDescuadre = esAdmin && arqueoDescuadra && !notas.trim()` |

**Decisión del dueño sobre la nota:** para el cajero es **opcional y nunca traba el cierre**
(no puede explicar una diferencia que no ve). Para el admin **se dejó como estaba** —
él sí la ve, así que exigir la explicación sigue teniendo sentido y no se pierde B28.

**B50 no está empezado.** Es persistir el retiro de recaudación como salida al abrir turno.
Está documentado en `docs/01-AUDITORIA.md`. Dos cosas sin decidir: a quién se le atribuye
el movimiento, y qué hacer si el fondo declarado es *mayor* que el cierre anterior.

---

## 2. Qué se verificó en browser y qué no

### Verificado ✅

**Cajero (`Test_Caja`), caja cerrada** — captura en
`.gstack/qa-reports/screenshots/b49-cajero-caja.png`. Texto completo de la página:
`Caja cerrada · Cajero Test_Caja · Fondo inicial $ · Fondo inicial R$ · Abrir turno`.
Sin "Último cierre", sin "Se retiró", sin historial. Tipeando un fondo tampoco aparece
el bloque de retiro. La nav no muestra Reportes ni Usuarios.

**Admin (`qa_admin_b49`), arqueo con descuadre** — captura en
`.gstack/qa-reports/screenshots/b49-admin-arqueo-diferencia.png`. Con esperado $1 y
contado $500 mostró todo lo que debe:
```
Efectivo total en caja $   $ 1
Esperado: $ 1    🟡 Sobra $ 499
Hay diferencia con lo esperado. Dejá una nota explicando el descuadre para poder cerrar.
Notas · explicá el descuadre (obligatorio)
```

**Cajero, arqueo antes de confirmar** — mostró el texto nuevo
`"Contá el efectivo físico del cajón y confirmá lo que hay."` (el admin ve
`"...El esperado y la diferencia se muestran después."`), sin "Efectivo total en caja".

### NO verificado ❌

**Cajero, arqueo DESPUÉS de confirmar el conteo.** Es el punto que falta y no es menor:
hay que ver que con un descuadre real **no** aparezcan "Esperado", el ✅/🟡/🔴 ni la nota
obligatoria, y que **el botón "Confirmar cierre" quede habilitado** (que la nota no trabe).
Se intentó 4 veces y el daemon del browser se reinició en cada una.

---

## 3. Por qué se cortó

El daemon de `gstack browse` se reinicia solo cada pocos minutos (PIDs observados:
2216 → 12204 → 20420 → 23264). Cada reinicio deja el tab en `about:blank` y **pierde la
cookie de sesión**, así que hay que volver a loguearse. `browse restart` no lo estabilizó.

Además, al principio **dos sesiones de Claude compartían el mismo daemon** y se pisaban
los tabs. Eso ya se resolvió (la otra sesión liberó el browser), pero costó un rato de
diagnóstico: en el medio pareció que B49 fallaba, cuando en realidad la otra sesión había
hecho login como admin y la cookie es compartida entre tabs. **No era un bug de B49** —
se confirmó cruzando contra `user_sessions`.

---

## 4. Para retomar

1. Correr el `DELETE` de la sección 0. **Esto primero, antes que nada.**
2. Levantar el browser de nuevo (`browse restart`) o probar a mano en Chrome.
3. Login `Test_Caja` / `admin123` → `/caja` → abrir turno con fondo $1 / R$0 →
   "Cerrar turno" → contar $500 → "Confirmar conteo" → verificar que NO aparece
   Esperado ni diferencia, y que "Confirmar cierre" está habilitado sin escribir nota.
4. Cerrar el turno de verdad para probar el camino completo, y después borrar la fila.
5. Commitear B49. Sugerido:
   `fix(caja): el cajero ya no ve el arqueo, las diferencias ni el historial (B49)`
6. Limpiar el resto de la basura de QA (tabla de la sección 0).
7. Recién ahí arrancar B50.

**Ojo:** cada login de un cajero fuera de 18:30–03:30 escribe una fila en `notifications`
(es M11, recién mergeado). Contá cuántas generás y limpialas al final.

---

## 5. Contexto que no está en el código

- **`.env.local` apunta a la base de PRODUCCIÓN** (`kiosco-manager-24siete`,
  ref `hxfgvxubffueuovgzljh`). No hay base de staging. Cualquier prueba en
  `localhost:3000` escribe en los datos reales del kiosco. El dueño autorizó
  explícitamente abrir y borrar un turno de prueba para esta tarea.
- **Cuentas usables** (login exige `active = true` **y** `deleted_at IS NULL`):
  admin `Santi` (clave desconocida) y `qa_admin_b49` (`qa_b49_temp`, temporal);
  cajeros `Carla`, `Jager`, `Lucas`, `Test_Caja` (`admin123`).
- **Bug encontrado de paso, sin ID todavía:** `users_username_key` es
  `UNIQUE (username)` a secas, pero el borrado de usuarios es soft delete
  (`deleted_at`). Resultado: **el nombre de un usuario borrado no se puede reusar nunca**.
  Ya hay **6** nombres quemados: `admin`, `Admin`, `cajero_test`, `temp_borrar_qa`,
  `test_admin_temp`, `Santiago` (una versión previa de este archivo decía 5 — se comía
  el `admin` en minúscula, borrado el 2026-07-29). El dueño se lo topó en vivo con
  `duplicate key value violates unique constraint "users_username_key"`.
  Arreglo propuesto (no aplicado, toca auth en producción):
  ```sql
  ALTER TABLE users DROP CONSTRAINT users_username_key;
  CREATE UNIQUE INDEX users_username_activo_key ON users (username) WHERE deleted_at IS NULL;
  ```
- **Hay otra sesión de Claude trabajando en el repo** (`kiosco-manager-ed`), en M11
  (notificaciones + última conexión). Tiene tomados `middleware.ts`,
  `app/api/auth/login/route.ts`, `lib/services/users.ts`, `app/usuarios/*`,
  `app/reportes/*`, `types/database.ts` y **`docs/01-AUDITORIA.md`**.
  No toca `app/caja/CajaClient.tsx` ni `lib/services/cashSessions.ts` — esos son de B49/B50.
  Antes de escribir en la auditoría, coordinar con esa sesión.

---

## 6. Límites conocidos de B49 — leer antes de darlo por cerrado

> Una versión previa de esta sección decía que para calcular el esperado "hay que abrir
> devtools". **Eso subestimaba el problema.** Corregido tras auditoría independiente.

### 6.1 El cajero puede sumar el esperado de cabeza

En la pantalla de cierre, el panel "Resumen del turno" (`CajaClient.tsx` ~L711-770) le
muestra al cajero **todos los sumandos del esperado**:

```
Fondo inicial        $ …     ← session.monto_inicial
Efectivo UYU         $ …     ← totals.total_efectivo_uyu
Entradas al local  + $ …     ← totals.total_entradas_uyu
Salidas del local  − $ …     ← totals.total_salidas_uyu
```

Y el esperado es exactamente `fondo + efectivo + entradas − salidas` (L336-341). No hace
falta ninguna herramienta: es una suma de cuatro números en pantalla. Si la amenaza que
motivó B49 es el cajero que ajusta el conteo hacia atrás para que dé cero, **esto lo deja
a un paso**. Está sin resolver y es una decisión de producto pendiente: o se le ocultan
también esas líneas, o se acepta el límite a sabiendas.

### 6.2 El corte es del lado del cliente, no del servidor

Verificado contra producción: `cash_sessions`, `sales` y `cash_outflows` tienen políticas
RLS `FOR ALL USING (true)`, y la anon key es pública. Un cajero puede pedir los turnos
cerrados con `diferencia_uyu/brl` incluidas desde la consola del navegador. Lo que hace
B49 es **no pedir** los datos, no impedir que se pidan.

Esto importa porque la **"Nota de implementación" de la entrada B49 en `01-AUDITORIA.md`
dice que el corte va en el servidor**, y el código hace lo contrario. Antes de marcar B49
como resuelto hay que reconciliar las dos cosas: o se baja la ambición de esa nota dejando
explícito que el corte duro queda diferido a **B47 / B36 / B5**, o B49 no se cierra del
todo. Ojo: ese archivo lo tiene tomado la sesión de M11, hay que coordinar.
