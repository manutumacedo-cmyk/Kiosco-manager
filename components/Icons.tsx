// Íconos de línea SVG inline — sin dependencias, render idéntico en tablet y PC.
// stroke 1.5px, currentColor: heredan la rampa de neón del contexto (cián/magenta).
// Se usan en el launcher del home en vez de emoji (que rendiriza distinto por hardware
// y empuja hacia el anti-ref "videojuego/arcade").

type IconProps = {
  className?: string;
  size?: number;
};

function base(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
}

export function CartIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2.5 3h2.2l2.2 11.2a1.6 1.6 0 0 0 1.6 1.3h8.4a1.6 1.6 0 0 0 1.55-1.2L21.5 7H6.2" />
    </svg>
  );
}

export function BoxIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
      <path d="M3 8l9 5 9-5" />
      <path d="M12 13v8" />
    </svg>
  );
}

export function CashboxIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="3" y="6" width="18" height="13" rx="1.6" />
      <path d="M3 10h18" />
      <path d="M9.5 14.5h5" />
      <path d="M7 6 8.5 3h7L17 6" />
    </svg>
  );
}

export function ComboIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="3.5" y="9" width="17" height="11" rx="1.4" />
      <path d="M3.5 13h17" />
      <path d="M12 9v11" />
      <path d="M12 9c-2.5 0-4-1.2-4-2.6C8 5.1 9 4.5 10 4.5c1.6 0 2 2 2 4.5 0-2.5.4-4.5 2-4.5 1 0 2 .6 2 1.9C16 7.8 14.5 9 12 9Z" />
    </svg>
  );
}

export function ChartIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M4 4v15.5a.5.5 0 0 0 .5.5H20" />
      <path d="M7.5 15l3-3.5 3 2.5 4-5.5" />
    </svg>
  );
}

export function HistoryIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3 4v4h4" />
      <path d="M12 8v4l2.6 1.6" />
    </svg>
  );
}

export function UsersIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6" />
      <path d="M17.5 14.3a5.5 5.5 0 0 1 3 5.2" />
    </svg>
  );
}

// Flecha "play" para la acción primaria VENDER.
export function PlayIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...base(size, className)} fill="currentColor" stroke="none">
      <path d="M8 5.2v13.6a1 1 0 0 0 1.54.84l10.2-6.8a1 1 0 0 0 0-1.68L9.54 4.36A1 1 0 0 0 8 5.2Z" />
    </svg>
  );
}

export function LogoutIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M14 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H14" />
      <path d="M17 8.5 20.5 12 17 15.5" />
      <path d="M20.5 12H10" />
    </svg>
  );
}
