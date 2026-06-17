# Product

## Register

product

## Users

Dos perfiles, un mostrador real: un kiosco nocturno en la frontera Rivera (UY) /
Sant'Ana (BR), que cobra en pesos uruguayos (UYU) y reales brasileños (BRL).

- **Cajeros** — varios, rotativos, sin entrenamiento formal. Operan en hora pico con
  gente esperando. Su tarea es una sola: cobrar rápido y sin equivocarse de plata.
  No exploran la app; ejecutan un flujo conocido (abrir caja → vender → cerrar caja).
- **Admin** — gestiona productos, combos, usuarios y mira reportes/cuadres. Menos
  presión de tiempo, más densidad de datos.

Contexto físico: equipos mixtos (tablet táctil y PC con mouse/teclado), luz ambiente
variable de un local nocturno. El diseño cubre touch (targets grandes) y desktop
(densidad de datos) a la vez.

## Product Purpose

POS web para que el kiosco cobre rápido y la caja cuadre. Éxito = un cajero nuevo
cobra una venta correctamente sin que nadie le explique, y al cierre el efectivo
contado coincide con lo que dice el sistema (incluido el cuadre cross-moneda UYU/BRL).

Prioridades del negocio, en orden estricto:
1. **Rápido** — hora pico, muchas personas pidiendo a la vez.
2. **Sin errores de plata** — la caja tiene que cuadrar.
3. **Simple** — varios cajeros distintos, sin entrenamiento.

## Brand Personality

Nocturno, eléctrico, confiable. El sello es "24 SIETE": un letrero de neón de bar/kiosco
que abre las 24 horas. La energía neón es identidad de marca, no decoración de cada
pantalla. Tono directo y sin vueltas — la herramienta desaparece en la tarea y deja al
cajero cobrar. El neón aparece donde refuerza confianza y orientación (marca, navegación,
estado activo, la acción de cobro), nunca compitiendo con la legibilidad de precios y
montos.

## Anti-references

- **Videojuego / arcade gamer.** Maneja plata real; es una herramienta de trabajo seria,
  no un juego. Nada de HUD de videojuego ni efectos de combate.
- **SaaS genérico de plantilla.** Nada de dashboard azul-y-blanco corporativo, cards
  idénticas en grilla infinita, ni aire de template.
- **Recargado / mareante.** Nada de parpadeos constantes, glow en todo o animación que
  canse en un turno nocturno largo. El neón se gana su lugar; no satura.

## Design Principles

- **La velocidad es la feature.** Cada decisión visual se mide contra "¿un cajero apurado
  lee esto más rápido?". Si el efecto frena la lectura de un precio o un total, se va.
- **El monto manda.** Precios, totales, vuelto y moneda son el contenido más importante de
  la pantalla: máximo contraste, jerarquía clara, sin glow encima.
- **Neón con propósito.** El efecto de tubo de neón vive en marca, navegación, estado
  activo y la acción primaria de cobro. Inputs, datos y tablas quedan limpios y sobrios.
- **Sin entrenamiento.** Estados, errores y vacíos enseñan el flujo. Un error de stock dice
  qué producto y qué hacer; un cuadre descuadrado se ve antes de cerrar.
- **Consistencia sobre sorpresa.** El botón de cobrar se ve igual en toda la app; mismo
  vocabulario de controles pantalla a pantalla. El delight es un momento, no cada página.

## Accessibility & Inclusion

- Objetivo WCAG AA: texto de cuerpo ≥4.5:1, montos y texto grande ≥3:1, contra el fondo
  oscuro real (no contra el glow). El glow nunca sustituye al contraste del texto.
- Targets táctiles cómodos (≥44px) para el uso en tablet en mostrador.
- `prefers-reduced-motion`: el parpadeo de neón y las animaciones tienen alternativa estática
  (ya hay precedente en el flicker de la marca). Nada de movimiento esencial para entender un
  estado.
- No depender solo del color para estados de plata: descuadre/sobró/faltó se marca también
  con texto e ícono, no solo rojo/verde (daltonismo).
