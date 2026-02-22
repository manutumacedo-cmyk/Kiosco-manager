# Kiosco Manager

Sistema de gestión de inventario, ventas y reportes para kioscos.

## 🚀 Características

- **Gestión de Productos**: CRUD completo con categorías (Bebidas, Alimento, Vasos, Otros)
- **Sistema de Costos**: Cálculo automático de ganancia limpia (precio - costo)
- **Punto de Venta (POS)**: Interfaz de carrito de compras con múltiples métodos de pago
- **Reportes Diarios**: Dashboard con ganancia limpia, ventas por método y productos más vendidos
- **Reposición**: Gestión de inventario con alertas de stock mínimo
- **Filtros**: Búsqueda por categoría en productos y ventas

## 🛠️ Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS 4
- **Backend**: Supabase (PostgreSQL)
- **Funcionalidades**: SQL atómico para prevenir race conditions

## 📋 Requisitos Previos

- Node.js 18+
- Cuenta de Supabase

## 🔧 Instalación

1. Clona el repositorio:
```bash
git clone https://github.com/manutumacedo-cmyk/Kiosco-manager.git
cd Kiosco-manager/web
```

2. Instala las dependencias:
```bash
npm install
```

3. Configura las variables de entorno:
```bash
# Crea un archivo .env.local con:
NEXT_PUBLIC_SUPABASE_URL=tu-url-de-supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
```

4. Ejecuta las migraciones SQL en Supabase:
- Ve a SQL Editor en tu dashboard de Supabase
- Ejecuta los archivos en `lib/sql/`:
  - `migrations.sql` - Funciones atómicas
  - `add-costo-column.sql` - Columna de costo

5. Inicia el servidor de desarrollo:
```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

## 📚 Estructura del Proyecto

```
web/
├── app/                    # Páginas Next.js App Router
│   ├── productos/         # Gestión de productos
│   ├── ventas/nueva/      # Punto de venta
│   └── reportes/hoy/      # Dashboard de reportes
├── components/            # Componentes reutilizables
├── lib/
│   ├── services/         # Servicios de API
│   └── sql/              # Migraciones SQL
└── types/                # Tipos TypeScript
```

## 🎯 Uso

1. **Productos**: Crea y gestiona tu inventario con precios, costos y stock
2. **Nueva Venta**: Procesa ventas con descuento automático de stock
3. **Reportes**: Visualiza métricas diarias y ganancia limpia

## 📄 Licencia

Este proyecto está bajo licencia MIT.