# 🌎 Sistema de Punto de Venta para Frontera (UYU/BRL)

## 📋 Resumen

Sistema optimizado para un kiosco en zona de frontera Uruguay-Brasil, con soporte multi-moneda, combos personalizados y funciones específicas para bebidas con adicionales.

---

## 🚀 Características Implementadas

### 1. **Calculadora de Cambio Multi-Moneda (UYU/BRL)**

#### ¿Cómo funciona?

El cajero ve dos filas de botones con billetes:

**Pesos Uruguayos (UYU):** 50, 100, 200, 500, 1.000, 2.000
**Reales Brasileños (BRL):** 5, 10, 20, 50, 100, 200

#### Flujo de pago:

1. **Cliente pide cuenta:** Total mostrado en GRANDE (ej: $350.00 UYU)
2. **Cajero recibe billete:** Toca el botón correspondiente
   - Si es **UYU**: Calcula cambio directo
   - Si es **BRL**: Convierte a UYU usando tasa configurada → Calcula cambio en UYU
3. **Pantalla muestra:**
   - Total en Pesos
   - Pagó con: (billete + moneda)
   - **CAMBIO A DEVOLVER** (siempre en UYU)

#### Ejemplo real:

```
Total: $350.00 UYU
Cliente paga con: R$100 BRL
Tasa del día: 1 BRL = $7.50 UYU

→ Convertido: R$100 = $750.00 UYU
→ Cambio: $400.00 UYU (devolver en pesos uruguayos)
```

#### ⚙️ Configurar Tasa de Cambio:

1. Ir a **Combos** → sección "Configuración de Cambio"
2. Clic en "Modificar"
3. Ingresar nuevo valor (ej: 7.80)
4. Guardar

**Importante:** La tasa se actualiza en tiempo real para todas las ventas.

---

### 2. **Shot Extra (Incremento de Precio Fijo)**

#### ¿Qué es?

Un botón que suma un monto fijo al precio de un producto **sin afectar el inventario**.

#### Casos de uso:

- Cliente pide trago con "shot extra" de alcohol → +$50 UYU
- Porción extra de algún producto que no se descuenta del stock
- Cualquier adicional que solo modifique el precio

#### Cómo usarlo:

1. Agregá el producto al carrito
2. Tocá el botón **🔥 Shot Extra** en el item
3. Se suma automáticamente $50 UYU al subtotal
4. NO descuenta inventario adicional

**Configuración:**
El monto fijo está en `app/ventas/nueva/page.tsx` línea 31:
```typescript
const SHOT_EXTRA_AMOUNT = 50; // Cambiar este valor si necesitas otro monto
```

---

### 3. **Creador de Combos Personalizados**

#### ¿Qué son los combos?

Grupos de productos vendidos a precio único de oferta. Al vender un combo, el sistema descuenta del inventario todos los productos incluidos.

#### Crear un combo:

1. Ir a **Combos** (desde menú principal)
2. Clic en **+ Crear Combo**
3. Completar:
   - **Nombre:** Ej: "Combo Noche"
   - **Descripción:** Ej: "Botella + Hielo + 2 Vasos"
   - **Precio:** Ej: $350.00 (precio único del combo)
   - **Productos incluidos:**
     - Seleccionar producto
     - Cantidad a incluir
     - Agregar más productos con el botón "+"
4. **Guardar**

#### Ejemplo de combo:

**Combo "Fiesta" - $400.00**
- 1x Vodka
- 1x Hielo
- 2x Vaso Grande
- 1x Energizante

Al vender este combo, el sistema descuenta automáticamente:
- 1 unidad de Vodka
- 1 unidad de Hielo
- 2 unidades de Vaso Grande
- 1 unidad de Energizante

**Del inventario.**

#### Vender un combo:

1. En **Nueva Venta**, aparece sección "🎁 Combos disponibles"
2. Clic en el combo → se agrega al carrito
3. El combo aparece con ícono 🎁 y su precio configurado
4. Podés aplicarle **Shot Extra** también

#### Activar/Desactivar combos:

En **Combos** → clic en "🚫 Desactivar" para quitar de la venta sin eliminarlo.

---

### 4. **Optimización para PC (Layout Compacto)**

#### Diseño en 2 columnas:

**Panel Izquierdo (2/3 del ancho):**
- 🔍 Buscador de productos (compacto)
- 🎁 Combos disponibles
- 🛒 Carrito con todos los items

**Panel Derecho (1/3 del ancho):**
- 💰 Total GIGANTE
- 💵 Botones de billetes UYU
- 💶 Botones de billetes BRL
- 📋 Método de pago + Nota
- 💾 Botón Guardar Venta

**Ventajas:**
- Todo visible en una sola pantalla
- No hay scroll innecesario
- Calculadora siempre a la vista
- Total grande y claro

---

## 🗂️ Archivos Creados/Modificados

### **Nuevos archivos:**

1. **`lib/sql/border_pos_migration.sql`**
   - Migración de base de datos
   - Tablas: `combos`, `combo_items`, `exchange_rate_config`
   - Ejecutar en Supabase SQL Editor

2. **`lib/services/combos.ts`**
   - Servicios para combos (CRUD)
   - Funciones de tasa de cambio
   - Conversión BRL → UYU

3. **`app/combos/page.tsx`**
   - Interfaz de administración de combos
   - Configuración de tasa de cambio
   - Listado y edición de combos

### **Archivos modificados:**

1. **`app/ventas/nueva/page.tsx`**
   - Calculadora multi-moneda con botones
   - Botón Shot Extra
   - Soporte para combos
   - Layout optimizado para PC

2. **`types/database.ts`**
   - Tipos: `Combo`, `ComboItem`, `ComboWithProducts`, `ExchangeRateConfig`

3. **`types/ui.ts`**
   - CartItem extendido con: `shotExtra`, `isCombo`, `combo_id`

4. **`app/page.tsx`**
   - Agregada tarjeta "Combos" al menú principal
   - Grid de 4 columnas

---

## 📊 Estructura de Base de Datos

### **Tabla `combos`**
```sql
id UUID
nombre TEXT (ej: "Combo Noche")
descripcion TEXT (ej: "Botella + Hielo")
precio DECIMAL (ej: 350.00)
activo BOOLEAN
created_at TIMESTAMP
updated_at TIMESTAMP
```

### **Tabla `combo_items`**
```sql
id UUID
combo_id UUID (FK → combos)
product_id UUID (FK → products)
cantidad INT (ej: 2 vasos)
created_at TIMESTAMP
```

### **Tabla `exchange_rate_config`**
```sql
id UUID
currency_from TEXT (ej: "BRL")
currency_to TEXT (ej: "UYU")
rate DECIMAL (ej: 7.5000)
updated_at TIMESTAMP
```

---

## 🛠️ Instalación y Configuración

### Paso 1: Ejecutar Migración SQL

1. Abrir **Supabase Dashboard** → **SQL Editor**
2. Ejecutar el contenido de `lib/sql/border_pos_migration.sql`
3. Verificar que las tablas se crearon correctamente

### Paso 2: Configurar Tasa de Cambio Inicial

La migración inserta una tasa por defecto (1 BRL = 7.50 UYU), pero podés cambiarla:

1. Ir a **Combos**
2. Modificar tasa según el valor del día
3. Guardar

### Paso 3: Crear Combos (Opcional)

1. Ir a **Combos**
2. Crear combos según tu oferta
3. Activarlos para que aparezcan en ventas

### Paso 4: Reiniciar Servidor

```bash
npm run dev
```

---

## 🎯 Flujo de Trabajo Típico

### **Inicio del Día:**

1. Actualizar tasa de cambio BRL/UYU en **Combos**
2. Verificar stock de productos incluidos en combos activos

### **Durante Venta:**

1. Cliente pide → Agregar productos/combos al carrito
2. Aplicar **Shot Extra** si pidió adicionales
3. Tocar botón de billete (UYU o BRL)
4. Verificar cambio en pantalla
5. Guardar venta

### **Fin del Día:**

1. Revisar **Reportes** → Ventas en UYU vs BRL
2. Verificar ganancia limpia
3. Analizar combos más vendidos

---

## 💡 Tips y Buenas Prácticas

### **Tasa de Cambio:**
- Actualizá la tasa DIARIAMENTE según el valor del mercado
- Considerá margen de ganancia en la tasa (ej: banco da 7.40, vos ponés 7.50)

### **Combos:**
- Creá combos con productos de baja rotación + best-sellers
- Precio del combo debe ser atractivo (10-15% descuento vs comprar separado)
- Desactivá combos fuera de stock en lugar de eliminarlos

### **Shot Extra:**
- Usalo solo para adicionales que NO se descuentan de inventario
- Si el shot es un producto real, agregalo al carrito normal

### **Calculadora de Cambio:**
- SIEMPRE devolvé cambio en UYU (aunque pague en BRL)
- Si falta dinero, aparece "⚠️ Falta dinero" en rojo

---

## 🐛 Troubleshooting

### **Error: "function combos_with_products does not exist"**
- **Causa:** No ejecutaste la migración SQL
- **Solución:** Ejecutar `lib/sql/border_pos_migration.sql` en Supabase

### **Tasa de cambio no se actualiza**
- **Causa:** Error en la query de update
- **Solución:** Verificar permisos RLS en tabla `exchange_rate_config`

### **Combo no descuenta stock**
- **Causa:** Productos del combo fueron eliminados
- **Solución:** Editar combo y reemplazar productos

### **Botones de billetes deshabilitados**
- **Causa:** Carrito vacío
- **Solución:** Agregar al menos un producto para habilitar pago

---

## 📈 Próximas Mejoras Opcionales

1. **Historial de Tasas de Cambio**
   - Guardar tasa diaria para análisis histórico

2. **Reportes Multi-Moneda**
   - Ventas en BRL vs UYU
   - Ganancia por moneda

3. **Combos Dinámicos**
   - "2x1 en horario X"
   - Descuentos automáticos por cantidad

4. **Impresión de Ticket**
   - Ticket con detalle de cambio
   - Diferenciación de moneda recibida

---

## 🎓 Filosofía del Sistema

Este POS está diseñado para:
- ✅ Velocidad: Pagar en 3 clics
- ✅ Claridad: Total y cambio en GRANDE
- ✅ Flexibilidad: Combos, adicionales, multi-moneda
- ✅ Precisión: Conversión automática sin errores

**Objetivo:** Que el cajero se enfoque en atender, no en calcular.

---

## 📞 Soporte

Si algo no funciona:
1. Verificar que la migración SQL se ejecutó correctamente
2. Revisar permisos RLS en Supabase
3. Revisar consola del navegador (F12) por errores

---

**Sistema creado por:** Claude Sonnet 4.5
**Fecha:** 2026-02-16
**Versión:** 1.0 (Border Edition)

🌎 **¡Listo para operar en la frontera!**
