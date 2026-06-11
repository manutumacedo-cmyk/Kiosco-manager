import BrandMark from "@/components/BrandMark";

/**
 * Marca de agua sutil en la esquina inferior derecha.
 * Vive en el layout raíz: presencia de marca en todas las pantallas sin
 * robar contraste a los datos (fixed, ~10% opacidad, no interactiva,
 * detrás del contenido). Usa el cartel CSS de BrandMark, sin imágenes.
 */
export default function BrandWatermark() {
  return (
    <div
      aria-hidden="true"
      className="fixed bottom-4 right-4 z-0 pointer-events-none select-none opacity-10"
    >
      <BrandMark className="text-[7px] [animation:none]" />
    </div>
  );
}
