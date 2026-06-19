# Plan: Sistema de Impresión de Tickets / Confirmación de Compra

> Roadmap para agregar impresión de tickets al POS ("24 SIETE"), con mirada a arquitectura extensible y resolución de B5 (seguridad) en paralelo.

---

## 1. Contexto & Requisitos

### Caso de uso
- Después de confirmar una venta, el cajero imprime un ticket (cliente se lo lleva como comprobante).
- Ticket = confirmación de compra (qué compró, cuándo, método de pago, total).
- Modelo similar a: BK, Bailes, comidas rápidas.

### Incógnitas hoy
1. **Impresora aún no definida** — ¿marca/modelo/protocolo?
2. **¿Sistema genérico o específico?** — ¿ESC/POS universal? ¿red/USB?
3. **¿Información en el ticket?** — qué campos mostrar.
4. **Relación con B5** — ¿La impresora es local (kiosco mismo) o remota? ¿Hay riesgo de seguridad?

---

## 2. Arquitectura Propuesta (flexible a incógnitas)

### 2.1 Capas

```
┌─────────────────┐
│ POS (React)     │  Botón "Imprimir ticket" tras confirmar venta
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│ API Route (Next.js)             │  POST /api/tickets/print
│ - Recibe sale_id                │  - Autentica (JWT, no anon key)
│ - Genera HTML/ESC-POS           │  - Llama al driver de impresora
│ - Maneja reintentos + idempotencia
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ Printer Driver (pluggable)      │  
│ - ESC/POS (genérico)            │  
│ - Network (TCP socket)          │  
│ - USB (local device)            │  
│ - Thermal receipt printer       │  
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ Impresora Física (TBD)          │
└─────────────────────────────────┘
```

### 2.2 Por qué esta estructura

- **API route como intermediaria** → La impresora vive en la máquina del kiosco (local/red); no podemos llamarla desde el browser.
- **Driver pluggable** → Si compramos una marca X hoy y otra Y mañana, cambiamos el driver sin tocar la lógica de venta.
- **Autentica con JWT, no anon key** → Arreglamos B5 desde aquí: `/api/tickets/print` exige JWT válido (server-side, no anon key expuesta).
- **Idempotencia** → Si el corte interrumpe la impresión, reintentar no imprime 2 veces (usamos `sale_id` + timestamp como clave).

---

## 3. Contenido del Ticket (propuesta)

```
┌──────────────────────────────┐
│        24 SIETE               │  (logo/nombre del local)
│    COMPROBANTE DE COMPRA      │
├──────────────────────────────┤
│ Fecha: 2026-06-17 13:45:30   │
│ Ticket ID: #001234            │  (sale_id acortado o secuencial)
├──────────────────────────────┤
│ DETALLE                       │
│ Vasos Jugo................... │
│   x2 @ $150 c/u = $300       │
│ Combo Desayuno............... │
│   x1 @ $450 = $450           │
├──────────────────────────────┤
│ TOTAL: $750 UYU              │
│ Pago: Efectivo               │
│ (o si es BRL: Pago: $105 BRL) │
├──────────────────────────────┤
│ Cajero: Admin                 │  (opcional, de acuerdo a M4)
│ Turno: 2026-06-17 22:00-06:00│  (sesión de caja activa)
├──────────────────────────────┤
│ ¡Gracias POR SU COMPRA!      │
│ www.24siete.com              │  (si existe sitio)
└──────────────────────────────┘
```

**Campos necesarios:**
- `sale_id` (identificador único)
- Fecha/hora
- Detalle (productos + combos + cantidades + precios unitarios)
- Total + moneda
- Método de pago (efectivo/débito/transferencia)
- Si es en BRL: mostrar monto en BRL + tasa de cambio usada
- Opcional: cajero, turno, número de ticket secuencial

---

## 4. Fases de Implementación

### Fase 0: Investigación & Prototipo (sin código en producción)
- **Tarea:** Decidir con el dueño qué impresora comprar.
  - ¿Local (USB al kiosco) o red (Ethernet/WiFi)?
  - ¿Marca/modelo específico?
  - Buscar datasheet / API / SDK del fabricante.
- **Entregable:** Documento con especificación de la impresora (protocolo, puertos, dependencias).

### Fase 1: Driver genérico (ESC/POS)
- Implementar un driver que hable **ESC/POS** (estándar de thermal receipts).
  - La mayoría de impresoras de kiosco lo soportan (Epson, Star, Brother, etc.).
  - Si no, agregar driver específico en Fase 1.5.
- Ubicación: `lib/drivers/printer/` (ej. `escpos.ts`).
- Test: con una impresora dummy que devuelva el buffer en lugar de imprimir.

### Fase 2: API route (`/api/tickets/print`)
- Recibe `sale_id` + JWT (autentica).
- Recupera la venta desde Supabase (vía `supabaseServer`, no anon key).
- Genera el HTML/buffer del ticket.
- Llama al driver.
- Registra en `print_logs` (tabla nueva) si todo salió bien.

### Fase 3: UI en POS
- Botón "Imprimir ticket" tras confirmar venta.
- Feedback visual: "Imprimiendo..." → "✓ Listo" o "✗ Error, reintentar".
- Atajos de teclado (M1): `Ctrl+P` para imprimir.

### Fase 4: Relación con B5 (seguridad)
- Mientras se hace el refactor de `lib/services/*.ts` (anon key → service_role):
  - Las rutas de API (como `/api/tickets/print`) **ya usan service_role** (supabaseServer).
  - Esto establece el patrón: "datos sensibles = API route + service_role".
  - Al cerrar B5, todas las data queries pasan por rutas de API (no browser directo).
  - `/api/tickets/print` es un early adopter de esa arquitectura.

---

## 5. Incógnitas & Cómo resolverlas

| Incógnita | Cómo resolver | Dueño | Timeline |
|-----------|---------------|-------|----------|
| ¿Qué impresora? | Investigar mercado + datasheet | Dueño del kiosco | Antes de Fase 1 |
| ¿ESC/POS universal o algo específico? | Leer docs del fabricante | Dueño + dev | Fase 0 → Fase 1 |
| ¿Qué datos en el ticket? | Reunión rápida (3 campos mínimo: qué + cuánto + cuándo) | Dueño | Ahora |
| ¿Impresora local o red? | Especificación de compra | Dueño | Antes de Fase 1 |
| ¿Registrar logs de impresión? | Sí, en tabla `print_logs(sale_id, printed_at, status, error)` | Dev | Fase 2 |

---

## 6. Vínculo con B5 (Seguridad)

### El problema hoy (B5)
- `lib/services/*.ts` usa `supabaseClient` (anon key pública).
- Cualquiera puede forjar ventas vía REST API.

### Cómo los tickets ayudan a resolver B5
1. **Patrón nuevo:** datos sensibles = API route (next.js server) con `supabaseServer`.
2. `/api/tickets/print` es el primer ejemplo: recibe `sale_id`, autentica con JWT, recupera la venta vía service_role.
3. Al hacer esto, validamos que el flujo "API route + JWT + service_role" funciona y es seguro.
4. Luego escalamos ese patrón a todas las demás operaciones (crear venta, cancelar, etc.).

### Timeline de B5
- **Ahora (Fase 0 de tickets):** Documentar B5 con la evidencia de hoy ✅ (ya hecho).
- **Fase 1 tickets:** Implementar `/api/tickets/print` como proof-of-concept.
- **Fase 2-3 B5:** Mover el resto (`createSale`, `fetchProducts`, etc.) a rutas de API con service_role.
- **Fase 4:** Cerrar RLS a service_role-only en Supabase. La app sigue funcionando (todas las queries pasan por API route autenticadas).

---

## 7. Checklist de arranque

- [ ] **Dueño:** Decidir + comunicar qué impresora comprar.
- [ ] **Dev:** Obtener datasheet / SDK de la impresora.
- [ ] **Dev:** Crear tabla `print_logs` en Supabase.
- [ ] **Dev:** Implementar driver genérico (ESC/POS).
- [ ] **Dev:** Crear `/api/tickets/print` route.
- [ ] **Dev + Dueño:** Decidir qué campos van en el ticket (minimalista: producto, cantidad, precio, total, método de pago).
- [ ] **Dev:** Agregar botón "Imprimir" en POS.
- [ ] **QA:** Testear con la impresora real cuando llegue.

---

## 8. Notas

- **No es urgente** — Tickets son nice-to-have, el POS funciona sin ellos. Pero **sí es importante para la experiencia del cliente** y **es la oportunidad para arreglar B5 de forma limpia**.
- **Modular & extensible** — Si el fabricante de la impresora cambia o queremos agregar generar PDF al mismo tiempo, el driver pluggable lo hace fácil.
- **Idempotencia = tranquilidad** — Si el WiFi cae mientras imprime, reintentar no causa duplicados ni problemas de sincronización.
