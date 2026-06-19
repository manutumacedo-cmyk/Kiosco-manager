# Mockup: Ticket de Compra "24 SIETE"

> Dos opciones visuales para WhatsApp / impresión física

---

## Opción 1: Ticket MINIMALISTA (para WhatsApp)

Así se vería si le mandas por WhatsApp al cliente (texto plano, legible):

```
━━━━━━━━━━━━━━━━━━━━━━━
     🌙 24 SIETE 🌙
   COMPROBANTE DE COMPRA
━━━━━━━━━━━━━━━━━━━━━━━

📅 17/06/2026  13:45
🎟️  Ticket #001234

───────────────────────
DETALLE
───────────────────────
Vaso Jugo Naranja
  × 2 @ $150 = $300

Combo Desayuno
  × 1 = $450

───────────────────────
💰 TOTAL: $750 UYU
💳 Pago: Efectivo

───────────────────────
✨ ¡Gracias por comprar! ✨
www.24siete.com
━━━━━━━━━━━━━━━━━━━━━━━
```

**Ventaja:** Cabe en cualquier pantalla, ve bien en WhatsApp, fácil de imprimir en ticket térmico.

---

## Opción 2: Ticket NEON (estética 24 SIETE)

Así se vería si imprime directo en la térmica (con códigos de estilo ESC/POS):

```
╔════════════════════════════╗
║  ▓▓▓▓  24 SIETE  ▓▓▓▓      ║  <- Neon cyan
║   COMPROBANTE DE COMPRA    ║
╚════════════════════════════╝

  Fecha: 17 Jun 2026 - 13:45:30
  Ticket #001234
  Cajero: Admin | Turno: 22h-06h

┌─────────────────────────────┐
│ DETALLE                     │
├─────────────────────────────┤
│ Vaso Jugo Naranja      $150 │  <- Cyan
│   × 2                 $300  │  <- Blanco
│                             │
│ Combo Desayuno        $450  │  <- Cyan
│   × 1                 $450  │  <- Blanco
│                             │
├─────────────────────────────┤
│ TOTAL VENTA:         $750   │  <- Magenta grande
│ Moneda: UYU                 │
│ Pago: Efectivo       $750   │  <- Verde (confirmado)
│ Vuelto: $0                  │
├─────────────────────────────┤
│ Tasa cambio: 7.5 UYU/BRL   │  (si hubiera sido en BRL)
│                             │
│ ✨ ¡GRACIAS POR SU COMPRA! ✨ │  <- Neon magenta
│     www.24siete.com         │
│                             │
│ █████████ Scan para         │
│ █       █ ver en línea      │  <- QR code
│ █ ◼◼◼ █                     │
│ █       █                   │
│ █████████                   │
╚─────────────────────────────╝
```

**Ventaja:** Se ve con la estética neon del kiosco, más profesional, incluye detalles (QR, tasa, cajero).

---

## Opción 3: Para VENDER (lo que le mandas al dueño por WhatsApp)

Aquí está el mockup listo para copiar-pegar en WhatsApp:

```
Mira cómo se vería el ticket de compra del kiosco 👇

━━━━━━━━━━━━━━━━━━━━━━━━━
  🌙 24 SIETE 🌙
COMPROBANTE DE COMPRA
━━━━━━━━━━━━━━━━━━━━━━━━━

📅 17 Jun 2026 - 13:45
🎟️ Ticket #001234

Vaso Jugo Naranja
   × 2 @ $150 = $300

Combo Desayuno  
   × 1 = $450

━━━━━━━━━━━━━━━━━━━━━━━━━
💰 TOTAL: $750 UYU
💳 Método: Efectivo
━━━━━━━━━━━━━━━━━━━━━━━━━

Cajero: Admin
Turno: 22:00 - 06:00

✨ ¡Gracias por comprar! ✨
24siete.com
━━━━━━━━━━━━━━━━━━━━━━━━━

Así van a recibir el cliente y vos de confirmación. ¿Te late?
```

---

## Decisiones de diseño

### Qué va SÍ
✅ Fecha/hora exacta  
✅ ID del ticket (para tracking)  
✅ Detalle (producto, cantidad, precio)  
✅ Total  
✅ Método de pago  
✅ Cajero (ayuda a auditoría, M4)  
✅ Turno (sesión abierta)  

### Qué va NO (por ahora)
❌ Dirección del kiosco (para tickets físicos sí, por WhatsApp no)  
❌ Código de barras (impresora podría no soportarlo)  
❌ QR code (investigar si impresora lo soporta)  
❌ RUT/factura (depende de si quieren facturación legal)  

---

## Variantes por moneda

### Si es en UYU (pago en pesos):
```
💰 TOTAL: $750 UYU
💳 Pago: Efectivo
   Monto: $750
   Vuelto: $0
```

### Si es en BRL (pago en reales):
```
💰 TOTAL: $100 BRL
💳 Pago: Efectivo
   Monto: $100 BRL
   Vuelto: $0
   
📊 Equivalente a $750 UYU
   (tasa: 7.5 UYU/BRL)
```

---

## Cómo funciona el flujo

1. **Cliente paga** → POS muestra "Confirmar venta"
2. **Cajero toca Cobrar** → Se guarda la venta, abre modal "Imprimir ticket"
3. **Cajero toca "Imprimir"** → Impresora genera el ticket (opción 1 o 2)
4. **Cliente recibe papel** → Lleva su comprobante
5. **Opcional:** El kiosco también guarda el ticket en PDF / envía por WhatsApp

---

## Para el dueño

> Mandá esto por WhatsApp al dueño para que vea cómo se vería:

```
Manu: Che, así quedaría el ticket del kiosco cuando imprimas. 
      ¿Te late este diseño o querés agregar/quitar algo? 👇

[Copiar opción 3 de arriba]

Cosas que podemos ajustar:
- Agregar dirección/teléfono del local?
- Más grande/más chico?
- Cambiar los emojis?
- Incluir número de factura/RUT?
```

