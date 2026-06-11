import Image from "next/image";

/**
 * Marca de agua sutil del logo en la esquina inferior derecha.
 * Vive en el layout raíz: presencia de marca en todas las pantallas sin
 * robar contraste a los datos (fixed, ~10% opacidad, no interactiva,
 * detrás del contenido).
 */
export default function BrandWatermark() {
  return (
    <div
      aria-hidden="true"
      className="fixed bottom-4 right-4 z-0 pointer-events-none select-none opacity-10"
    >
      <Image src="/logo.png" alt="" width={80} height={80} priority={false} />
    </div>
  );
}
