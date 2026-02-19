import Link from "next/link";

interface MenuCard {
  href: string;
  title: string;
  description: string;
  icon: string;
  color: "cyan" | "magenta";
}

const MENU_CARDS: MenuCard[] = [
  {
    href: "/productos",
    title: "Productos",
    description: "Gestión de inventario y reposición",
    icon: "📦",
    color: "cyan",
  },
  {
    href: "/ventas/nueva",
    title: "Nueva Venta",
    description: "Punto de venta (POS)",
    icon: "🛒",
    color: "magenta",
  },
  {
    href: "/combos",
    title: "Combos",
    description: "Administrar combos y tipo de cambio",
    icon: "🎁",
    color: "cyan",
  },
  {
    href: "/reportes/hoy",
    title: "Reportes",
    description: "Dashboard y ganancia limpia",
    icon: "📊",
    color: "magenta",
  },
  {
    href: "/reportes/ventas",
    title: "Historial",
    description: "Ventas anteriores y cancelaciones",
    icon: "📋",
    color: "cyan",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--deep-dark)] p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Hero Section */}
        <div className="text-center space-y-4 py-12">
          <div className="flex items-center justify-center gap-4">
            <div className="h-16 w-16 rounded-full neon-border-cyan animate-pulse-cyan" />
            <h1 className="text-6xl font-bold">
              <span className="neon-text-cyan">24</span>
              <span className="neon-text-magenta"> SIETE</span>
            </h1>
            <div className="h-16 w-16 rounded-full neon-border-magenta animate-pulse-magenta" />
          </div>
          <p className="text-[var(--text-secondary)] text-lg font-mono">
            24 SIETE: TU SED NO TIENE HORARIO, NOSOTROS TAMPOCO.
          </p>
        </div>

        {/* Menu Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {MENU_CARDS.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className={`
                data-card group cursor-pointer
                ${card.color === "cyan" ? "neon-hover-cyan" : "neon-hover-magenta"}
              `}
            >
              <div className="space-y-3">
                <div className="text-5xl">{card.icon}</div>
                <h2
                  className={`text-2xl font-bold ${
                    card.color === "cyan" ? "text-[var(--neon-cyan)]" : "text-[var(--neon-magenta)]"
                  }`}
                >
                  {card.title}
                </h2>
                <p className="text-[var(--text-secondary)]">{card.description}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* Info Footer */}
        <div className="text-center pt-12">
          <div className="inline-block border border-[var(--slate-gray)] rounded-lg px-6 py-3">
            <p className="text-[var(--text-muted)] text-sm font-mono">
              Presiona cualquier tarjeta para comenzar
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
