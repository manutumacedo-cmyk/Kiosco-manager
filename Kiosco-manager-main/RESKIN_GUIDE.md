# 24 SIETE - Guía Completa de Reskin Cyberpunk

## 🎨 Sistema de Diseño Implementado

### Archivos Centralizados

1. **`styles/theme.ts`** - Constantes de diseño TypeScript
   - Colores: cian (#00f3ff), magenta (#ff00ff), negro (#050505)
   - Sombras neón predefinidas
   - Bordes dobles estilo logo
   - Constantes de animación

2. **`app/globals.css`** - Clases de utilidad y animaciones
   - Variables CSS custom properties
   - Animaciones: `neon-pulse`, `neon-glow`, `slide-in`, `fade-in`
   - Clases de utilidad: `.neon-border-cyan`, `.neon-text-magenta`, `.data-card`, etc.
   - Inputs cyberpunk: `.cyber-input`
   - Botones: `.cyber-button`, `.cyber-button-magenta`

### Paleta de Colores

```css
--neon-cyan: #00f3ff       /* Principal - Activo/Información */
--neon-magenta: #ff00ff    /* Acento - Alertas/CTA */
--dark-bg: #050505         /* Fondo principal */
--carbon-gray: #1a1a1a     /* Fondos de tarjetas */
--slate-gray: #2a2a2a      /* Bordes sutiles */
--text-primary: #f0f0f0    /* Texto principal */
--text-secondary: #a0a0a0  /* Texto secundario */
--text-muted: #606060      /* Texto desactivado */
```

---

## ✅ Páginas Reskinadas Completamente

### 1. Home (`app/page.tsx`)
- Hero section con logo 24 SIETE
- Círculos pulsantes cyan y magenta
- Tarjetas de menú con hover effects
- Footer informativo

### 2. Reportes (`app/reportes/hoy/page.tsx`)
- Header con círculo pulsante cyan
- Tarjetas de métricas con bordes neón
- Ganancia limpia con fondo magenta animado
- Alertas de reposición con bordes dobles magenta
- Efectos de hover en todas las tarjetas

### 3. Nueva Venta (`app/ventas/nueva/page.tsx`)
- Header con círculo pulsante magenta
- Panel de búsqueda con drop-shadow cyan
- Panel de carrito con drop-shadow magenta
- Inputs estilo cyberpunk (`.cyber-input`)
- Botón de guardar con `.cyber-button-magenta`
- Total destacado con fondo magenta

---

## 🚧 Página Pendiente: Productos

### Estado Actual
[productos/page.tsx](app/productos/page.tsx) (~575 líneas) mantiene diseño original:
- Tabla HTML tradicional
- Fondo blanco
- Bordes grises estándar

### Transformación Recomendada

#### Opción A: Mantener Tabla con Estilo Cyberpunk
**Ventaja:** Menor cambio en estructura HTML
**Transformaciones:**

```tsx
// Header
<div className="p-6 space-y-4">
  // Cambiar a:
<div className="min-h-screen bg-[var(--deep-dark)] p-6 space-y-6">

// Título
<h1 className="text-2xl font-semibold">Productos</h1>
  // Cambiar a:
<div className="flex items-center gap-3">
  <div className="h-10 w-10 rounded-full neon-border-cyan animate-pulse-cyan" />
  <h1 className="text-3xl font-bold neon-text-cyan">PRODUCTOS</h1>
</div>

// Badge de alertas
<span className="px-3 py-1 rounded-full bg-red-100 text-red-800">
  // Cambiar a:
<span className="px-4 py-2 rounded-full neon-outline-magenta animate-pulse-magenta bg-[var(--magenta-glow)] text-[var(--neon-magenta)]">

// Tabs
<button className={`px-4 py-2 rounded-lg border ${...}`}>
  // Cambiar a:
<button className={`cyber-button ${tab === "listado" ? "neon-outline-cyan" : ""}`}>

// Inputs de búsqueda
<input className="border rounded-lg px-3 py-2" ...>
  // Cambiar a:
<input className="cyber-input" ...>

// Tabla
<thead className="bg-gray-50">
  // Cambiar a:
<thead className="bg-[var(--carbon-gray)] border-b-2 border-[var(--neon-cyan)]">

// Filas de alerta
<tr className={`border-t ${enAlerta ? "bg-red-50" : ""}`}>
  // Cambiar a:
<tr className={`border-t border-[var(--slate-gray)] ${enAlerta ? "neon-outline-magenta bg-[var(--magenta-glow)]" : ""}`}>
```

#### Opción B: Transformar a Grid de Tarjetas
**Ventaja:** Diseño más moderno, estilo tarjetas "Data Card"
**Desventaja:** Requiere reescribir estructura HTML

```tsx
// En lugar de <table>, usar:
<div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
  {shownItems.map((p) => {
    const enAlerta = Number(p.stock) <= Number(p.stock_minimo);
    const ganancia = Number(p.precio) - Number(p.costo);

    return (
      <div
        key={p.id}
        className={`data-card ${enAlerta ? "neon-outline-magenta animate-pulse-magenta" : "neon-hover-cyan"}`}
      >
        {/* Header del producto */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-lg font-bold text-[var(--neon-cyan)]">{p.nombre}</h3>
            {p.categoria && (
              <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">
                {p.categoria}
              </span>
            )}
          </div>
          {enAlerta && (
            <span className="px-2 py-1 rounded-full neon-outline-magenta text-[var(--neon-magenta)] text-xs">
              REPONER
            </span>
          )}
        </div>

        {/* Métricas en grid */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <div className="text-xs text-[var(--text-muted)] uppercase">Precio</div>
            <div className="text-lg font-mono font-bold text-[var(--neon-cyan)]">
              ${Number(p.precio).toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--text-muted)] uppercase">Stock</div>
            <div className="text-lg font-mono font-bold text-[var(--text-primary)]">
              {p.stock}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--text-muted)] uppercase">Costo</div>
            <div className="text-sm font-mono text-[var(--text-secondary)]">
              ${Number(p.costo).toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--text-muted)] uppercase">Ganancia</div>
            <div className="text-sm font-mono text-[var(--success)]">
              ${ganancia.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Acciones en modo edición */}
        {editMode && (
          <div className="flex gap-2 pt-3 border-t border-[var(--slate-gray)]">
            <button className="cyber-button flex-1" onClick={() => saveRow(p.id)}>
              Guardar
            </button>
            <button
              className="px-3 py-2 border border-[var(--error)] text-[var(--error)] rounded-lg hover:bg-[var(--error)] hover:text-[var(--dark-bg)] transition-all"
              onClick={() => handleDeleteProduct(p.id, p.nombre)}
            >
              Eliminar
            </button>
          </div>
        )}
      </div>
    );
  })}
</div>
```

---

## 🎯 Componente de Navegación

### `components/CyberNav.tsx` (Creado)
Barra de navegación reutilizable con:
- Logo 24 SIETE con colores neón
- Círculo animado
- Links con indicador activo (outline cyan)
- Iconos y hover effects

**Uso:** Importar en `layout.tsx` o páginas individuales

```tsx
import CyberNav from "@/components/CyberNav";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <CyberNav />
          {children}
        </Providers>
      </body>
    </html>
  );
}
```

---

## 📋 Checklist de Implementación

### Completado ✅
- [x] Sistema de tema centralizado (`styles/theme.ts`)
- [x] CSS global con clases de utilidad (`app/globals.css`)
- [x] Metadata actualizado (`app/layout.tsx`)
- [x] Página Home rediseñada
- [x] Página Reportes rediseñada
- [x] Página Nueva Venta rediseñada
- [x] Componente CyberNav creado

### Pendiente 🚧
- [ ] Página Productos - aplicar Opción A o B
- [ ] Tab de Reposición (`app/productos/ReposicionTab.tsx`)
- [ ] Integrar CyberNav en layout global (opcional)
- [ ] Actualizar componentes UI:
  - [ ] `components/ui/Toast.tsx` - estilos neón
  - [ ] `components/ui/ConfirmDialog.tsx` - estilos neón

---

## 🔧 Utilidades CSS Principales

### Bordes Neón
```css
.neon-border-cyan        /* Borde doble cyan con glow */
.neon-border-magenta     /* Borde doble magenta con glow */
.neon-outline-cyan       /* Borde simple cyan con sombra */
.neon-outline-magenta    /* Borde simple magenta con sombra */
```

### Texto
```css
.neon-text-cyan          /* Texto cyan con text-shadow */
.neon-text-magenta       /* Texto magenta con text-shadow */
```

### Animaciones
```css
.animate-pulse-cyan      /* Pulsación cyan (2s loop) */
.animate-pulse-magenta   /* Pulsación magenta (2s loop) */
.animate-glow            /* Efecto glow alternado (1.5s) */
.animate-slide-in        /* Entrada desde derecha (0.3s) */
```

### Componentes
```css
.data-card               /* Tarjeta base con hover effect */
.cyber-input             /* Input field oscuro con focus cyan */
.cyber-button            /* Botón cyan con hover fill */
.cyber-button-magenta    /* Botón magenta con hover fill */
```

### Hover Effects
```css
.neon-hover-cyan         /* Transform + box-shadow cyan */
.neon-hover-magenta      /* Transform + box-shadow magenta */
```

---

## 🚀 Próximos Pasos Recomendados

1. **Decidir estructura para Productos:**
   - Tabla estilizada (más rápido, menos cambio)
   - Grid de tarjetas (más moderno, más trabajo)

2. **Aplicar reskin a Reposición:**
   - Seguir patrón de tarjetas usado en Reportes
   - Formularios con `.cyber-input`
   - Botones con `.cyber-button`

3. **Actualizar componentes UI compartidos:**
   - Toast con colores neón
   - ConfirmDialog con estilos cyberpunk

4. **Integrar CyberNav globalmente:**
   - Opcional: agregar en `layout.tsx` para navegación persistente

5. **Optimizaciones:**
   - Agregar transiciones suaves
   - Pulir responsive design
   - Testear accesibilidad (contraste de colores)

---

## 📖 Convenciones de Código

### TypeScript
- Mantener tipado estricto
- NO modificar lógica de negocio
- Solo cambiar JSX/TSX y clases CSS

### CSS
- Usar variables CSS (`var(--neon-cyan)`) en lugar de hex directo
- Preferir clases de utilidad sobre estilos inline
- Mantener consistencia en naming (kebab-case)

### Componentes
- Mantener separación de responsabilidades
- UI components en `components/`
- Lógica de negocio en `lib/services/`
- Tipos en `types/`

---

## 🎨 Referencias Visuales

### Logo Original
- Círculos dobles estilo neón
- Colores: Cyan (#00f3ff) + Magenta (#ff00ff)
- Fondo negro profundo (#050505)

### Inspiración Cyberpunk
- Neon Genesis Evangelion (UI interfaces)
- Blade Runner 2049 (hologramas)
- Cyberpunk 2077 (HUD elements)
- Akira (neón urbano)

---

**Creado:** 2026-02-15
**Versión:** 1.0
**Autor:** Claude Sonnet 4.5 para proyecto 24 SIETE
