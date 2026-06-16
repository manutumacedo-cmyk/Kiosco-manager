/**
 * Marca "24 SIETE" — cartel de neón dibujado en CSS, sin imágenes.
 * Emblema circular: "24" en degradado cian→violeta, "SIETE" en magenta→violeta,
 * doble anillo con degradado cónico (cian arriba, índigo a los costados,
 * magenta abajo; el interior desfasado) sobre fondo radial violeta oscuro.
 * Escala con el font-size del wrapper (unidades em): pasale un className
 * tipo `text-[24px]` para el hero o `text-[6px]` para versiones mini.
 */
export default function BrandMark({ className = "" }: { className?: string }) {
  return (
    <div className={`brand-mark ${className}`} role="img" aria-label="24 SIETE">
      <span className="brand-mark-ring-outer" aria-hidden="true" />
      <span className="brand-mark-ring-inner" aria-hidden="true" />
      <span className="brand-mark-24">24</span>
      <span className="brand-mark-siete">SIETE</span>
    </div>
  );
}
