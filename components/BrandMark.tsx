/**
 * Marca "24 SIETE" — cartel de neón dibujado en CSS, sin imágenes.
 * Diseñada a medida para la estética cyber del kiosco: "24" en tubo cyan,
 * "SIETE" en tubo magenta, marco redondeado con glow y parpadeo sutil.
 * Escala con el font-size del wrapper (unidades em): pasale un className
 * tipo `text-[24px]` para el hero o `text-[6px]` para versiones mini.
 */
export default function BrandMark({ className = "" }: { className?: string }) {
  return (
    <div className={`brand-mark ${className}`} role="img" aria-label="24 SIETE">
      <span className="brand-mark-24">24</span>
      <span className="brand-mark-siete">SIETE</span>
    </div>
  );
}
